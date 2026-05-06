import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { invalidateValidationCache } from '../../hooks/useFieldValidation';
import styles from './FieldValidationPage.module.css';

const API = (path, opts = {}) =>
  fetch(`/api/field-validation${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
    ...opts,
  }).then(r => r.json());


const ENTITY_FIELDS = {
  product: [
    { key: 'name',                   label: 'Product Name',          hint: "The product's display name" },
    { key: 'product_code',           label: 'Product Code',          hint: 'Unique SKU / part number (auto-generated if empty)' },
    { key: 'barcode',                label: 'Barcode / EAN',         hint: 'EAN-13, UPC or custom barcode' },
    { key: 'category_id',            label: 'Category',              hint: 'Must be a leaf category (no subcategories)' },
    { key: 'base_uom_id',            label: 'Unit of Measure',       hint: 'Each, Kg, Litre, etc.' },
    { key: 'default_sales_price',    label: 'Default Sales Price',   hint: 'RRP / default price before price lists' },
    { key: 'default_purchase_price', label: 'Default Purchase Price',hint: 'Default cost from supplier' },
    { key: 'description',            label: 'Description',           hint: 'Long description / product details' },
    { key: 'weight_kg',              label: 'Weight (kg)',            hint: 'Gross weight in kilograms' },
    { key: 'length_cm',              label: 'Length (cm)',            hint: 'Outer dimension' },
    { key: 'warranty_months',        label: 'Warranty (months)',      hint: 'Standard warranty period' },
    { key: 'supplier_part_number',   label: 'Supplier Part No.',     hint: 'Manufacturer or supplier reference number' },
    { key: 'lead_time_days',         label: 'Lead Time (days)',       hint: 'Days from order to delivery' },
    { key: 'min_order_qty',          label: 'Min Order Qty',         hint: 'Minimum purchasable quantity' },
    { key: 'min_stock_level',        label: 'Min Stock Level',       hint: 'Reorder trigger level' },
  ],
  contact: [
    { key: 'full_name',      label: 'Full Name / Business Name', hint: 'Primary display name' },
    { key: 'email',          label: 'Email Address',             hint: 'Primary contact email' },
    { key: 'phone',          label: 'Phone',                     hint: 'Landline or general phone' },
    { key: 'mobile',         label: 'Mobile',                    hint: 'Mobile / cell number' },
    { key: 'abn',            label: 'ABN',                       hint: 'Australian Business Number (11 digits)' },
    { key: 'acn',            label: 'ACN',                       hint: 'Australian Company Number (9 digits)' },
    { key: 'address_line1',  label: 'Address Line 1',            hint: 'Street address' },
    { key: 'suburb',         label: 'Suburb',                    hint: 'City or suburb' },
    { key: 'state',          label: 'State',                     hint: 'Australian state / territory' },
    { key: 'postcode',       label: 'Postcode',                  hint: '4-digit Australian postcode' },
    { key: 'website',        label: 'Website',                   hint: 'Company website URL' },
    { key: 'credit_limit',   label: 'Credit Limit',              hint: 'Maximum outstanding balance allowed' },
    { key: 'credit_terms',   label: 'Payment Terms',             hint: 'NET30, NET60, COD, etc.' },
    { key: 'contact_type',   label: 'Contact Type',              hint: 'Customer, Supplier, Dealer, etc.' },
  ],
  invoice: [
    { key: 'contact_id',     label: 'Customer',           hint: 'Who is being invoiced' },
    { key: 'document_date',  label: 'Invoice Date',       hint: 'Date the invoice is issued' },
    { key: 'due_date',       label: 'Due Date',           hint: 'Payment due date' },
    { key: 'reference',      label: 'Customer Reference', hint: "Customer's PO or reference number" },
    { key: 'notes',          label: 'Notes',              hint: 'Internal notes (not printed)' },
    { key: 'footer_text',    label: 'Footer Text',        hint: 'Printed at bottom of invoice' },
  ],
  quote: [
    { key: 'contact_id',     label: 'Customer',       hint: 'Who the quote is addressed to' },
    { key: 'document_date',  label: 'Quote Date',     hint: 'Date the quote is created' },
    { key: 'expiry_date',    label: 'Expiry Date',    hint: 'Date the quote expires' },
    { key: 'reference',      label: 'Reference',      hint: 'Internal or customer reference' },
    { key: 'notes',          label: 'Notes',          hint: 'Conditions, payment terms, etc.' },
  ],
  purchase_order: [
    { key: 'contact_id',          label: 'Supplier',              hint: 'Who the PO is sent to' },
    { key: 'document_date',       label: 'Order Date',            hint: 'Date the PO is raised' },
    { key: 'expected_delivery',   label: 'Expected Delivery',     hint: 'When goods should arrive' },
    { key: 'reference',           label: 'Supplier Reference',    hint: 'Supplier quote or confirmation number' },
    { key: 'delivery_address',    label: 'Delivery Address',      hint: 'Ship-to address (defaults to warehouse)' },
    { key: 'notes',               label: 'Notes',                 hint: 'Special delivery instructions, etc.' },
  ],
  service_job: [
    { key: 'contact_id',          label: 'Customer',              hint: "Machine owner / paying customer" },
    { key: 'machine_serial',      label: 'Machine Serial No.',    hint: 'Serial number of the machine being serviced' },
    { key: 'fault_description',   label: 'Fault Description',     hint: 'Customer-reported fault or symptom' },
    { key: 'assigned_technician', label: 'Assigned Technician',   hint: 'Who is responsible for this job' },
    { key: 'estimated_hours',     label: 'Estimated Hours',       hint: 'Expected labour time' },
    { key: 'promised_date',       label: 'Promised Date',         hint: 'When the job should be completed' },
  ],
};

export default function FieldValidationPage() {
  const { isAdmin } = useAuth();
  const [meta,         setMeta]         = useState({ entities: [], validation_types: [], transforms: [] });
  const [selectedEntity, setSelectedEntity] = useState('product');
  const [rules,        setRules]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [success,      setSuccess]      = useState('');
  const [error,        setError]        = useState('');
  const [editingRow,   setEditingRow]   = useState(null); // field_key being edited
  const [newField,     setNewField]     = useState(null); // null or new rule form

  useEffect(() => {
    API('/meta').then(({ data }) => setMeta(data || { entities: [], validation_types: [], transforms: [] }));
  }, []);

  const loadRules = useCallback(async (entity = selectedEntity) => {
    setLoading(true);
    try {
      const { data } = await API(`/${entity}`);
      setRules(data || []);
    } finally { setLoading(false); }
  }, [selectedEntity]);

  useEffect(() => { loadRules(selectedEntity); }, [selectedEntity]); // eslint-disable-line

  function updateRule(fieldKey, changes) {
    setRules(prev => prev.map(r => r.field_key === fieldKey ? { ...r, ...changes } : r));
  }

  async function handleSave() {
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await API(`/${selectedEntity}`, {
        method: 'PUT',
        body: JSON.stringify({ rules }),
      });
      if (!res.success) throw new Error(res.error);
      invalidateValidationCache(selectedEntity);
      setSuccess('Validation rules saved successfully.');
      setEditingRow(null);
      setNewField(null);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Save failed.');
    } finally { setSaving(false); }
  }

  function addNewField() {
    const firstField = (ENTITY_FIELDS[selectedEntity] || [])[0];
    setNewField({
      field_key: firstField?.key || '', field_label: firstField?.label || '',
      is_required: false, validation_type: 'none',
      validation_min: '', validation_max: '',
      validation_regex: '', validation_msg: '',
      transform: 'none', is_active: true, sort_order: rules.length,
    });
  }

  function confirmNewField() {
    if (!newField.field_key || !newField.field_label) return;
    if (rules.find(r => r.field_key === newField.field_key)) {
      setError('A field with that key already exists.');
      return;
    }
    setRules(prev => [...prev, { ...newField, sort_order: prev.length }]);
    setNewField(null);
    setError('');
  }

  if (!isAdmin) {
    return (
      <div className={styles.page}>
        <div className={styles.stateBlock}>You don't have permission to manage field validation.</div>
      </div>
    );
  }

  const currentEntity = meta.entities.find(e => e.key === selectedEntity);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Field Validation Rules</h1>
          <p className={styles.sub}>Configure which fields are mandatory, how they are validated, and how values are automatically transformed on save.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={addNewField}>
            <PlusIcon /> Add Field
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><span className="spinner" /> Saving...</> : 'Save rules'}
          </button>
        </div>
      </div>

      {error   && <div className={styles.errorBox}><AlertIcon /> {error}</div>}
      {success && <div className={styles.successBox}>{success}</div>}

      <div className={styles.body}>
        {/* Entity sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.sideTitle}>Object type</div>
          {meta.entities.map(e => (
            <button
              key={e.key}
              className={[styles.sideItem, selectedEntity === e.key ? styles.sideActive : ''].join(' ')}
              onClick={() => { setSelectedEntity(e.key); setEditingRow(null); setNewField(null); setError(''); }}
            >
              <EntityIcon type={e.key} />
              <span>{e.label}</span>
            </button>
          ))}
        </aside>

        {/* Rules table */}
        <div className={styles.content}>
          <div className={styles.contentHeader}>
            <div>
              <div className={styles.contentTitle}>{currentEntity?.label || selectedEntity} Fields</div>
              <div className={styles.contentSub}>{rules.filter(r => r.is_active).length} active rules · {rules.filter(r => r.is_required).length} required fields</div>
            </div>
          </div>

          {loading ? (
            <div className={styles.stateBlock}><div className="spinner-dark" /> Loading rules...</div>
          ) : (
            <>
              {/* New field form */}
              {newField && (
                <div className={styles.newFieldForm}>
                  <div className={styles.newFieldTitle}>Add new field rule</div>
                  <div className={styles.newFieldRow}>
                    <div className="form-group" style={{ flex: 3 }}>
                      <label className="form-label">Field *</label>
                      <select
                        className="form-input"
                        value={newField.field_key}
                        onChange={e => {
                          const fields = ENTITY_FIELDS[selectedEntity] || [];
                          const found  = fields.find(f => f.key === e.target.value);
                          setNewField(f => ({
                            ...f,
                            field_key:   e.target.value,
                            field_label: found?.label || '',
                          }));
                        }}
                      >
                        <option value="">Select a field...</option>
                        {(ENTITY_FIELDS[selectedEntity] || [])
                          .filter(f => !rules.find(r => r.field_key === f.key))
                          .map(f => (
                            <option key={f.key} value={f.key}>{f.label} — {f.hint}</option>
                          ))
                        }
                        <option value="__custom__">Custom field key (advanced)...</option>
                      </select>
                      {newField.field_key && newField.field_key !== '__custom__' && (
                        <div style={{ fontSize: 11.5, color: 'var(--text-sub)', marginTop: 4 }}>
                          Key: <code style={{ fontFamily: 'DM Mono', background: 'var(--accent-dim)', color: 'var(--accent)', padding: '1px 5px', borderRadius: 3 }}>{newField.field_key}</code>
                          {' — '}{(ENTITY_FIELDS[selectedEntity] || []).find(f => f.key === newField.field_key)?.hint}
                        </div>
                      )}
                      {newField.field_key === '__custom__' && (
                        <input className="form-input" style={{ marginTop: 8, fontFamily: 'DM Mono' }}
                          placeholder="custom_field_key"
                          onChange={e => setNewField(f => ({ ...f, field_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''), field_label: f.field_label || e.target.value }))} />
                      )}
                    </div>
                    <div className="form-group" style={{ flex: 2 }}>
                      <label className="form-label">Display label *</label>
                      <input className="form-input" value={newField.field_label}
                        onChange={e => setNewField(f => ({ ...f, field_label: e.target.value }))}
                        placeholder="e.g. Category" />
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <button className="btn btn-primary btn-sm"
                        onClick={confirmNewField}
                        disabled={!newField.field_key || newField.field_key === '__custom__' ? !newField.field_label : !newField.field_label}>
                        Add
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => setNewField(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ width: 200 }}>Field</th>
                      <th style={{ width: 80  }}>Required</th>
                      <th style={{ width: 200 }}>Validation</th>
                      <th style={{ width: 120 }}>Min</th>
                      <th style={{ width: 120 }}>Max</th>
                      <th style={{ width: 180 }}>Transform</th>
                      <th style={{ width: 80  }}>Active</th>
                      <th style={{ width: 60  }}>Custom msg</th>
                      <th style={{ width: 40  }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map(rule => (
                      <RuleRow
                        key={rule.field_key}
                        rule={rule}
                        validationTypes={meta.validation_types}
                        transforms={meta.transforms}
                        isEditing={editingRow === rule.field_key}
                        onEdit={() => setEditingRow(editingRow === rule.field_key ? null : rule.field_key)}
                        onChange={changes => updateRule(rule.field_key, changes)}
                      />
                    ))}
                    {rules.length === 0 && (
                      <tr><td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-sub)' }}>
                        No rules configured. Click "Add Field" to start.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className={styles.legend}>
                <strong>Validation types:</strong>
                {meta.validation_types?.slice(0,8).map(t => (
                  <span key={t.value} className={styles.legendItem}><code>{t.value}</code> — {t.label}</span>
                ))}
                <span className={styles.legendItem}>... and {Math.max(0, (meta.validation_types?.length || 0) - 8)} more</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleRow({ rule, validationTypes, transforms, isEditing, onEdit, onChange }) {
  const needsRange = ['range','min_length','max_length'].includes(rule.validation_type);
  const needsRegex = rule.validation_type === 'regex';

  return (
    <>
      <tr className={[styles.ruleRow, !rule.is_active ? styles.inactiveRow : ''].join(' ')}>
        {/* Field name */}
        <td>
          <div className={styles.fieldName}>{rule.field_label}</div>
          <div className={styles.fieldKey}>{rule.field_key}</div>
        </td>

        {/* Required toggle */}
        <td className={styles.centerCell}>
          <button
            className={[styles.toggleBtn, rule.is_required ? styles.toggleOn : ''].join(' ')}
            onClick={() => onChange({ is_required: !rule.is_required })}
            title={rule.is_required ? 'Required — click to make optional' : 'Optional — click to make required'}
          >
            {rule.is_required ? 'Yes' : 'No'}
          </button>
        </td>

        {/* Validation type */}
        <td>
          <select
            className={styles.inlineSelect}
            value={rule.validation_type}
            onChange={e => onChange({ validation_type: e.target.value, validation_min: null, validation_max: null, validation_regex: '' })}
          >
            {validationTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </td>

        {/* Min */}
        <td>
          {needsRange ? (
            <input className={styles.inlineInput} type="number" step="any"
              value={rule.validation_min ?? ''}
              onChange={e => onChange({ validation_min: e.target.value === '' ? null : parseFloat(e.target.value) })}
              placeholder="Min" />
          ) : <span className={styles.naCell}>—</span>}
        </td>

        {/* Max */}
        <td>
          {needsRange ? (
            <input className={styles.inlineInput} type="number" step="any"
              value={rule.validation_max ?? ''}
              onChange={e => onChange({ validation_max: e.target.value === '' ? null : parseFloat(e.target.value) })}
              placeholder="Max" />
          ) : <span className={styles.naCell}>—</span>}
        </td>

        {/* Transform */}
        <td>
          <select
            className={styles.inlineSelect}
            value={rule.transform || 'none'}
            onChange={e => onChange({ transform: e.target.value })}
          >
            {transforms.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </td>

        {/* Active */}
        <td className={styles.centerCell}>
          <button
            className={[styles.toggleBtn, rule.is_active ? styles.toggleOn : styles.toggleOff].join(' ')}
            onClick={() => onChange({ is_active: !rule.is_active })}
          >
            {rule.is_active ? 'On' : 'Off'}
          </button>
        </td>

        {/* Custom msg expand */}
        <td className={styles.centerCell}>
          <button className={styles.expandBtn} onClick={onEdit} title="Set custom error message">
            {isEditing ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </button>
        </td>

        {/* Regex */}
        <td />
      </tr>

      {/* Expanded: custom msg + regex */}
      {isEditing && (
        <tr className={styles.expandedRow}>
          <td colSpan={9}>
            <div className={styles.expandedContent}>
              {needsRegex && (
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Regex pattern</label>
                  <input className="form-input" value={rule.validation_regex || ''}
                    onChange={e => onChange({ validation_regex: e.target.value })}
                    placeholder="e.g. ^[A-Z]{2}\d{6}$" style={{ fontFamily: 'DM Mono' }} />
                </div>
              )}
              <div className="form-group" style={{ flex: 3 }}>
                <label className="form-label">Custom error message</label>
                <input className="form-input" value={rule.validation_msg || ''}
                  onChange={e => onChange({ validation_msg: e.target.value })}
                  placeholder={`e.g. "Please enter a valid ${rule.field_label.toLowerCase()}."`} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-sub)', alignSelf: 'flex-end', paddingBottom: 6 }}>
                Leave blank to use the default message.
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function EntityIcon({ type }) {
  const icons = {
    product:        <BoxIcon />,
    contact:        <UsersIcon />,
    invoice:        <FileIcon />,
    quote:          <DocIcon />,
    purchase_order: <CartIcon />,
    service_job:    <WrenchIcon />,
  };
  return icons[type] || <FileIcon />;
}

function SvgIcon({ children, size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}
function PlusIcon()       { return <SvgIcon><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></SvgIcon>; }
function AlertIcon()      { return <SvgIcon size={14}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></SvgIcon>; }
function ChevronDownIcon(){ return <SvgIcon size={14}><polyline points="6 9 12 15 18 9"/></SvgIcon>; }
function ChevronUpIcon()  { return <SvgIcon size={14}><polyline points="18 15 12 9 6 15"/></SvgIcon>; }
function BoxIcon()        { return <SvgIcon><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></SvgIcon>; }
function UsersIcon()      { return <SvgIcon><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></SvgIcon>; }
function FileIcon()       { return <SvgIcon><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></SvgIcon>; }
function DocIcon()        { return <SvgIcon><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="16" y1="13" x2="8" y2="13"/></SvgIcon>; }
function CartIcon()       { return <SvgIcon><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></SvgIcon>; }
function WrenchIcon()     { return <SvgIcon><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></SvgIcon>; }
