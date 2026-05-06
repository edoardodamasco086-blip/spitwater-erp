'use strict';
// ============================================================
// routes/field-validation.js
//
// GET    /api/field-validation/:entity     — get rules for entity
// PUT    /api/field-validation/:entity     — save all rules for entity (bulk upsert)
// GET    /api/field-validation/entities   — list all entity keys + labels
// ============================================================

const express = require('express');
const router  = express.Router();

const { sql, pool, poolConnect } = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

router.use(requireAuth);

const ENTITIES = [
  { key: 'product',        label: 'Products',        icon: 'box'     },
  { key: 'contact',        label: 'Contacts',        icon: 'users'   },
  { key: 'invoice',        label: 'Invoices',        icon: 'file'    },
  { key: 'quote',          label: 'Quotes',          icon: 'doc'     },
  { key: 'purchase_order', label: 'Purchase Orders', icon: 'cart'    },
  { key: 'service_job',    label: 'Service Jobs',    icon: 'wrench'  },
];

const VALIDATION_TYPES = [
  { value: 'none',         label: 'No validation'         },
  { value: 'email',        label: 'Email address'         },
  { value: 'phone_au',     label: 'AU phone number'       },
  { value: 'mobile_au',    label: 'AU mobile number'      },
  { value: 'abn',          label: 'Australian ABN'        },
  { value: 'acn',          label: 'Australian ACN'        },
  { value: 'url',          label: 'URL / Website'         },
  { value: 'postcode_au',  label: 'AU postcode (4 digits)'},
  { value: 'numeric',      label: 'Numeric value'         },
  { value: 'integer',      label: 'Integer (whole number)'},
  { value: 'positive',     label: 'Positive number (>= 0)'},
  { value: 'percentage',   label: 'Percentage (0–100)'    },
  { value: 'range',        label: 'Number range (min/max)'},
  { value: 'min_length',   label: 'Minimum text length'   },
  { value: 'max_length',   label: 'Maximum text length'   },
  { value: 'date',         label: 'Valid date'            },
  { value: 'future_date',  label: 'Future date'           },
  { value: 'past_date',    label: 'Past date'             },
  { value: 'regex',        label: 'Custom regex pattern'  },
  { value: 'leaf_category',label: 'Must be leaf category' },
  { value: 'numeric_only', label: 'Digits only'           },
];

const TRANSFORMS = [
  { value: 'none',          label: 'No transform'              },
  { value: 'trim',          label: 'Trim whitespace'           },
  { value: 'uppercase',     label: 'UPPERCASE'                 },
  { value: 'lowercase',     label: 'lowercase'                 },
  { value: 'titlecase',     label: 'Title Case'                },
  { value: 'uppercase_trim',label: 'UPPERCASE + trim'          },
  { value: 'lowercase_trim',label: 'lowercase + trim'          },
  { value: 'numeric_only',  label: 'Digits only (strip non-numeric)' },
  { value: 'phone_au_format',label: 'Format as AU phone'       },
  { value: 'abn_format',    label: 'Format as ABN (xx xxx xxx xxx)' },
];

// ── GET /api/field-validation/meta ───────────────────────────
router.get('/meta', asyncHandler(async (_req, res) => {
  return res.json({
    success: true,
    data: { entities: ENTITIES, validation_types: VALIDATION_TYPES, transforms: TRANSFORMS },
  });
}));

// ── GET /api/field-validation/:entity ────────────────────────
router.get('/:entity', asyncHandler(async (req, res) => {
  await poolConnect;
  const { entity } = req.params;
  const orgId = req.user.orgId;

  const rows = await pool.request()
    .input('org_id',     sql.Int,         orgId)
    .input('entity_key', sql.VarChar(50), entity)
    .query(`
      SELECT id, entity_key, field_key, field_label,
             is_required, validation_type,
             validation_min, validation_max,
             validation_regex, validation_msg,
             transform, is_active, sort_order
      FROM field_validation_rules
      WHERE org_id = @org_id AND entity_key = @entity_key
      ORDER BY sort_order ASC, field_label ASC
    `);

  return res.json({ success: true, data: rows.recordset });
}));

// ── PUT /api/field-validation/:entity ─────────────────────────
// Bulk upsert — saves the entire ruleset for an entity
router.put('/:entity', requireRole('admin'), asyncHandler(async (req, res) => {
  await poolConnect;
  const { entity } = req.params;
  const orgId  = req.user.orgId;
  const { rules } = req.body; // array of rule objects

  if (!Array.isArray(rules)) {
    return res.status(400).json({ success: false, error: 'rules array required.' });
  }

  for (const rule of rules) {
    await pool.request()
      .input('org_id',           sql.Int,          orgId)
      .input('entity_key',       sql.VarChar(50),  entity)
      .input('field_key',        sql.VarChar(100), rule.field_key)
      .input('field_label',      sql.NVarChar(200),rule.field_label)
      .input('is_required',      sql.Bit,          rule.is_required ? 1 : 0)
      .input('validation_type',  sql.VarChar(30),  rule.validation_type || 'none')
      .input('validation_min',   sql.Decimal(18,4),rule.validation_min  ?? null)
      .input('validation_max',   sql.Decimal(18,4),rule.validation_max  ?? null)
      .input('validation_regex', sql.NVarChar(500),rule.validation_regex || null)
      .input('validation_msg',   sql.NVarChar(200),rule.validation_msg  || null)
      .input('transform',        sql.VarChar(30),  rule.transform || 'none')
      .input('is_active',        sql.Bit,          rule.is_active !== false ? 1 : 0)
      .input('sort_order',       sql.Int,          rule.sort_order || 0)
      .input('updated_by',       sql.Int,          req.user.userId)
      .query(`
        IF EXISTS (SELECT 1 FROM field_validation_rules
                   WHERE org_id=@org_id AND entity_key=@entity_key AND field_key=@field_key)
          UPDATE field_validation_rules SET
            field_label      = @field_label,
            is_required      = @is_required,
            validation_type  = @validation_type,
            validation_min   = @validation_min,
            validation_max   = @validation_max,
            validation_regex = @validation_regex,
            validation_msg   = @validation_msg,
            transform        = @transform,
            is_active        = @is_active,
            sort_order       = @sort_order,
            updated_at       = GETDATE(),
            updated_by       = @updated_by
          WHERE org_id=@org_id AND entity_key=@entity_key AND field_key=@field_key
        ELSE
          INSERT INTO field_validation_rules
            (org_id,entity_key,field_key,field_label,is_required,validation_type,
             validation_min,validation_max,validation_regex,validation_msg,
             transform,is_active,sort_order,updated_at,updated_by)
          VALUES
            (@org_id,@entity_key,@field_key,@field_label,@is_required,@validation_type,
             @validation_min,@validation_max,@validation_regex,@validation_msg,
             @transform,@is_active,@sort_order,GETDATE(),@updated_by)
      `);
  }

  return res.json({ success: true, message: `Saved ${rules.length} validation rules.` });
}));

module.exports = router;
