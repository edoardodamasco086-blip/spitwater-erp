import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { productsApi } from '../../api/products';
import { useFieldValidation } from '../../hooks/useFieldValidation';
import styles from './ProductDetailPage.module.css';

const TABS = [
  { key: 'overview',  label: 'Overview'       },
  { key: 'images',    label: 'Images'         },
  { key: 'documents', label: 'Documents'      },
  { key: 'custom',    label: 'Custom Fields'  },
  { key: 'pricing',   label: 'Pricing'        },
  { key: 'stock',     label: 'Stock'          },
];

function formatCurrency(v) {
  if (v == null) return '-';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 4 }).format(v);
}
function formatQty(v) {
  if (v == null) return '0';
  return new Intl.NumberFormat('en-AU', { maximumFractionDigits: 4 }).format(v);
}
function formatFileSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}


// Flatten category tree preserving hierarchy order for dropdowns
function flattenCategoryTree(tree, depth = 0, result = []) {
  for (const node of tree) {
    result.push({ ...node, depth });
    if (node.children?.length) {
      flattenCategoryTree(node.children, depth + 1, result);
    }
  }
  return result;
}
export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  // Field validation — loads rules from DB, validates on save
  const [categories4Validation, setCategories4Validation] = useState([]);

  const [product,      setProduct]      = useState(null);
  const [categories,   setCategories]   = useState([]); // flat ordered list for dropdown
  const [categoryTree,  setCategoryTree]  = useState([]);
  const [uoms,         setUoms]         = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [customValues, setCustomValues] = useState({});
  const [pricing,      setPricing]      = useState([]);
  const [stock,        setStock]        = useState([]);
  const [loading,      setLoading]      = useState(!isNew);
  const [saving,       setSaving]       = useState(false);
  const [activeTab,    setActiveTab]    = useState('overview');
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState('');

  // Form state for overview
  const [form, setForm] = useState({
    name: '', product_code: '', barcode: '', description: '',
    product_type: 'product', category_id: '', base_uom_id: '',
    tracking_type: 'none', can_be_sold: true, default_sales_price: '',
    can_be_purchased: true, default_purchase_price: '',
    preferred_supplier_id: '', supplier_part_number: '',
    lead_time_days: 0, min_order_qty: 1, order_multiple: 1,
    min_stock_level: 0, max_stock_level: 0, reorder_qty: 0,
    warranty_months: 0, extended_warranty_months: 0,
    weight_kg: '', length_cm: '', width_cm: '', height_cm: '',
    is_active: true,
  });

  const { rules, errors: fieldErrors, validate: validateFields, liveValidate, clearErrors, isRequired } = useFieldValidation('product', { categories: categories4Validation });

  // Image upload
  const imgInputRef  = useRef(null);
  const docInputRef  = useRef(null);
  const [uploading,  setUploading]  = useState(false);
  const [uploadErr,  setUploadErr]  = useState('');

  useEffect(() => {
    // Load reference data independently so one failure doesn't block others
    productsApi.categories()
      .then(({ data }) => { setCategories(data.flat || []); setCategories4Validation(data.flat || []); })
      .catch(() => {});

    productsApi.uom()
      .then(({ data }) => setUoms(data.data || []))
      .catch(() => {});

    productsApi.customFields()
      .then(({ data }) => {
        setCustomFields(data.data || []);
      })
      .catch((err) => {
        console.warn('Custom fields load failed:', err?.response?.data?.error || err.message);
      });

    if (!isNew) loadProduct();
  }, [id]); // eslint-disable-line

  async function loadProduct() {
    setLoading(true);
    try {
      const [prodRes, cvRes, pricingRes, stockRes] = await Promise.all([
        productsApi.get(id),
        productsApi.getCustomValues(id),
        productsApi.getPricing(id),
        productsApi.getStock(id),
      ]);
      const p = prodRes.data.data;
      setProduct(p);
      setPricing(pricingRes.data.data);
      setStock(stockRes.data.data);
      setCustomValues(cvRes.data.data || {});
      // Populate form
      setForm({
        name:                    p.name || '',
        product_code:            p.product_code || '',
        barcode:                 p.barcode || '',
        description:             p.description || '',
        product_type:            p.product_type || 'product',
        category_id:             p.category_id || '',
        base_uom_id:             p.base_uom_id || '',
        tracking_type:           p.tracking_type || 'none',
        can_be_sold:             !!p.can_be_sold,
        default_sales_price:     p.default_sales_price ?? '',
        can_be_purchased:        !!p.can_be_purchased,
        default_purchase_price:  p.default_purchase_price ?? '',
        preferred_supplier_id:   p.preferred_supplier_id || '',
        supplier_part_number:    p.supplier_part_number || '',
        lead_time_days:          p.lead_time_days ?? 0,
        min_order_qty:           p.min_order_qty ?? 1,
        order_multiple:          p.order_multiple ?? 1,
        min_stock_level:         p.min_stock_level ?? 0,
        max_stock_level:         p.max_stock_level ?? 0,
        reorder_qty:             p.reorder_qty ?? 0,
        warranty_months:         p.warranty_months ?? 0,
        extended_warranty_months: p.extended_warranty_months ?? 0,
        weight_kg:               p.weight_kg ?? '',
        length_cm:               p.length_cm ?? '',
        width_cm:                p.width_cm ?? '',
        height_cm:               p.height_cm ?? '',
        is_active:               !!p.is_active,
      });
    } catch (e) { setError('Failed to load product.'); }
    finally { setLoading(false); }
  }

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setSuccess('');
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Product name is required.'); return; }
    setSaving(true); setError(''); setSuccess('');

    // Run field validation engine (only if rules loaded)
    let cleaned = form;
    if (rules.length > 0) {
      cleaned = validateFields(form);
      if (!cleaned) {
        setSaving(false);
        setError('Please fix the highlighted fields before saving.');
        return;
      }
    }
    try {
      const payload = {
        ...cleaned,
        category_id:             form.category_id            || null,
        base_uom_id:             form.base_uom_id            || null,
        preferred_supplier_id:   form.preferred_supplier_id  || null,
        default_sales_price:     parseFloat(form.default_sales_price)    || 0,
        default_purchase_price:  parseFloat(form.default_purchase_price) || 0,
        lead_time_days:          parseInt(form.lead_time_days)  || 0,
        min_order_qty:           parseFloat(form.min_order_qty) || 1,
        order_multiple:          parseFloat(form.order_multiple)|| 1,
        min_stock_level:         parseFloat(form.min_stock_level)|| 0,
        max_stock_level:         parseFloat(form.max_stock_level)|| 0,
        reorder_qty:             parseFloat(form.reorder_qty)   || 0,
        warranty_months:         parseInt(form.warranty_months) || 0,
        extended_warranty_months: parseInt(form.extended_warranty_months) || 0,
        weight_kg:   form.weight_kg  !== '' ? parseFloat(form.weight_kg)  : null,
        length_cm:   form.length_cm  !== '' ? parseFloat(form.length_cm)  : null,
        width_cm:    form.width_cm   !== '' ? parseFloat(form.width_cm)   : null,
        height_cm:   form.height_cm  !== '' ? parseFloat(form.height_cm)  : null,
      };
      if (isNew) {
        const res = await productsApi.create(payload);
        const newId = res.data.data.id;
        setSuccess(`Product created: ${res.data.data.product_code}`);
        setTimeout(() => navigate(`/products/${newId}`, { replace: true }), 800);
      } else {
        await productsApi.update(id, payload);
        setSuccess('Product saved.');
        setTimeout(() => setSuccess(''), 3000);
        loadProduct();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed.');
    } finally { setSaving(false); }
  }

  async function handleSavePricing() {
    setSaving(true);
    try {
      await productsApi.savePricing(id, pricing.map(p => ({
        price_list_id: p.price_list_id,
        unit_price:    p.unit_price,
        min_qty:       p.min_qty || 1,
        discount_pct:  p.discount_pct || 0,
      })));
      setSuccess('Pricing saved.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError('Failed to save pricing.'); }
    finally { setSaving(false); }
  }

  async function handleSaveCustom() {
    // Validate required fields
    const missing = customFields.filter(f => {
      if (!f.is_required) return false;
      const val = customValues[f.field_key];
      return val === undefined || val === null || val === '';
    });
    if (missing.length > 0) {
      setError(`Required fields missing: ${missing.map(f => f.field_label).join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      await productsApi.saveCustomValues(id, customValues);
      setSuccess('Custom fields saved.');
      setError('');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError('Failed to save custom fields.'); }
    finally { setSaving(false); }
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadErr('');
    try {
      await productsApi.uploadImage(id, file);
      loadProduct();
    } catch (err) { setUploadErr(err.response?.data?.error || 'Upload failed.'); }
    finally { setUploading(false); e.target.value = ''; }
  }

  async function handleDocUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadErr('');
    try {
      await productsApi.uploadDocument(id, file);
      loadProduct();
    } catch (err) { setUploadErr(err.response?.data?.error || 'Upload failed.'); }
    finally { setUploading(false); e.target.value = ''; }
  }

  async function handleSetPrimary(imgId) {
    await productsApi.setPrimaryImage(id, imgId);
    loadProduct();
  }

  async function handleDeleteImage(imgId) {
    if (!confirm('Delete this image?')) return;
    await productsApi.deleteImage(id, imgId);
    loadProduct();
  }

  async function handleDeleteDoc(docId) {
    if (!confirm('Delete this document?')) return;
    await productsApi.deleteDocument(id, docId);
    loadProduct();
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 32, color: 'var(--text-sub)' }}>
      <div className="spinner-dark" /> Loading product...
    </div>
  );

  const images    = product?.images    || [];
  const documents = product?.documents || [];

  return (
    <div className={styles.page}>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.breadcrumb}>
          <button className={styles.backBtn} onClick={() => navigate('/products')}>
            <ArrowIcon /> Products
          </button>
          <span className={styles.breadSep}>/</span>
          <span>{isNew ? 'New Product' : form.name || 'Loading...'}</span>
        </div>
        {!isNew && (
          <div style={{ display: 'flex', gap: 8 }}>
            <span className={`pill ${form.is_active ? 'pill-green' : 'pill-grey'}`}>
              {form.is_active ? 'Active' : 'Inactive'}
            </span>
            {product?.product_code && (
              <span className={styles.codeChip}>{product.product_code}</span>
            )}
          </div>
        )}
      </div>

      {/* Alerts */}
      {error   && <div className={styles.errorBox}><AlertIcon /> {error}</div>}
      {success && <div className={styles.successBox}>{success}</div>}
      {uploadErr && <div className={styles.errorBox}><AlertIcon /> {uploadErr}</div>}

      {/* Tabs */}
      {!isNew && (
        <div className={styles.tabs}>
          {TABS.map(t => (
            <button
              key={t.key}
              className={[styles.tab, activeTab === t.key ? styles.tabActive : ''].join(' ')}
              onClick={() => {
                setActiveTab(t.key);
                // Reload custom fields each time tab is opened to pick up newly created fields
                if (t.key === 'custom') {
                  productsApi.customFields()
                    .then(({ data }) => setCustomFields(data.data || []))
                    .catch(() => {});
                }
              }}
            >
              {t.label}
              {t.key === 'images'    && images.length > 0    && <span className={styles.tabBadge}>{images.length}</span>}
              {t.key === 'documents' && documents.length > 0 && <span className={styles.tabBadge}>{documents.length}</span>}
            </button>
          ))}
        </div>
      )}

      <div className={styles.body}>

        {/* ── OVERVIEW TAB ── */}
        {(isNew || activeTab === 'overview') && (
          <form className={styles.formLayout} onSubmit={handleSave}>

            {/* Left column — main fields */}
            <div className={styles.mainCol}>

              <div className={styles.card}>
                <div className={styles.cardTitle}>Product Details</div>
                <div className={styles.grid2}>

                  {/* Name */}
                  <div className="form-group" style={{gridColumn:'1/-1'}}>
                    <label className="form-label">
                      Product Name {isRequired('name') && <span className="req-star">*</span>}
                    </label>
                    <input
                      className={['form-input', fieldErrors.name ? 'input-error' : ''].join(' ')}
                      value={form.name}
                      onChange={e => { set('name', e.target.value); clearErrors('name'); }}
                      onBlur={e => liveValidate('name', e.target.value)}
                      placeholder="e.g. SW-1500D Pressure Washer"
                      autoFocus
                    />
                    {fieldErrors.name && <div className="field-error">{fieldErrors.name}</div>}
                  </div>

                  {/* Product Code */}
                  <div className="form-group">
                    <label className="form-label">
                      Product Code {isNew && <span style={{fontWeight:400,color:'var(--text-sub)'}}>(auto-generated if empty)</span>}
                      {isRequired('product_code') && <span className="req-star">*</span>}
                    </label>
                    <input className="form-input" value={form.product_code}
                      onChange={e => set('product_code', e.target.value)}
                      placeholder="SW-00001" style={{ fontFamily: 'DM Mono' }} disabled={!isNew} />
                  </div>

                  {/* Barcode */}
                  <div className="form-group">
                    <label className="form-label">
                      Barcode / EAN {isRequired('barcode') && <span className="req-star">*</span>}
                    </label>
                    <input
                      className={['form-input', fieldErrors.barcode ? 'input-error' : ''].join(' ')}
                      value={form.barcode}
                      onChange={e => { set('barcode', e.target.value); clearErrors('barcode'); }}
                      onBlur={e => liveValidate('barcode', e.target.value)}
                      placeholder="9312345678901" style={{ fontFamily: 'DM Mono' }} />
                    {fieldErrors.barcode && <div className="field-error">{fieldErrors.barcode}</div>}
                  </div>

                  {/* Product Type */}
                  <div className="form-group">
                    <label className="form-label">Product Type</label>
                    <select className="form-input" value={form.product_type} onChange={e => set('product_type', e.target.value)}>
                      <option value="product">Product</option>
                      <option value="service">Service</option>
                      <option value="component">Component</option>
                      <option value="kit">Kit / Bundle</option>
                    </select>
                  </div>

                  {/* Category */}
                  <div className="form-group">
                    <label className="form-label">
                      Category {isRequired('category_id') && <span className="req-star">*</span>}
                    </label>
                    <select
                      className={['form-input', fieldErrors.category_id ? 'input-error' : ''].join(' ')}
                      value={form.category_id}
                      onChange={e => { set('category_id', e.target.value); clearErrors('category_id'); }}
                      onBlur={e => liveValidate('category_id', e.target.value)}
                    >
                      <option value="">No category</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}
                          disabled={!!cat.has_children}
                          style={cat.has_children ? { color: 'var(--text-sub)', fontStyle: 'italic' } : {}}>
                          {'\u00A0\u00A0'.repeat(cat.depth || 0)}{(cat.depth || 0) > 0 ? '— ' : ''}{cat.name}{cat.has_children ? ' (select a subcategory)' : ''}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.category_id && <div className="field-error">{fieldErrors.category_id}</div>}
                  </div>

                  {/* Unit of Measure */}
                  <div className="form-group">
                    <label className="form-label">
                      Unit of Measure {isRequired('base_uom_id') && <span className="req-star">*</span>}
                    </label>
                    <select
                      className={['form-input', fieldErrors.base_uom_id ? 'input-error' : ''].join(' ')}
                      value={form.base_uom_id}
                      onChange={e => { set('base_uom_id', e.target.value); clearErrors('base_uom_id'); }}
                      onBlur={e => liveValidate('base_uom_id', e.target.value)}
                    >
                      <option value="">Select UOM...</option>
                      {uoms.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
                    </select>
                    {fieldErrors.base_uom_id && <div className="field-error">{fieldErrors.base_uom_id}</div>}
                  </div>

                  {/* Tracking */}
                  <div className="form-group">
                    <label className="form-label">Serial / Lot Tracking</label>
                    <select className="form-input" value={form.tracking_type} onChange={e => set('tracking_type', e.target.value)}>
                      <option value="none">No tracking</option>
                      <option value="serial">Serial number</option>
                      <option value="lot">Lot / batch</option>
                    </select>
                  </div>

                  {/* Description */}
                  <div className="form-group" style={{gridColumn:'1/-1'}}>
                    <label className="form-label">
                      Description {isRequired('description') && <span className="req-star">*</span>}
                    </label>
                    <textarea className="form-input" rows={4} style={{ resize: 'vertical' }}
                      value={form.description}
                      onChange={e => set('description', e.target.value)}
                      placeholder="Product description, features, specifications..." />
                  </div>

                </div>
              </div>

              {/* Pricing section */}
              <div className={styles.card}>
                <div className={styles.cardTitle}>Default Pricing</div>
                <div className={styles.grid2}>
                  <div className="form-group">
                    <label className="form-label">
                      <label style={{display:'flex',alignItems:'center',gap:6,marginBottom:0}}>
                        <input type="checkbox" checked={form.can_be_sold} onChange={e => set('can_be_sold', e.target.checked)} style={{accentColor:'var(--accent)'}} />
                        Can be sold
                      </label>
                    </label>
                    <input className="form-input" type="number" step="0.0001" min="0" placeholder="0.00" value={form.default_sales_price} onChange={e => set('default_sales_price', e.target.value)} disabled={!form.can_be_sold} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      <label style={{display:'flex',alignItems:'center',gap:6,marginBottom:0}}>
                        <input type="checkbox" checked={form.can_be_purchased} onChange={e => set('can_be_purchased', e.target.checked)} style={{accentColor:'var(--accent)'}} />
                        Can be purchased
                      </label>
                    </label>
                    <input className="form-input" type="number" step="0.0001" min="0" placeholder="0.00" value={form.default_purchase_price} onChange={e => set('default_purchase_price', e.target.value)} disabled={!form.can_be_purchased} />
                  </div>
                </div>
              </div>

              {/* Purchasing section */}
              <div className={styles.card}>
                <div className={styles.cardTitle}>Purchasing & Stock</div>
                <div className={styles.grid3}>
                  <div className="form-group">
                    <label className="form-label">Lead time (days)</label>
                    <input className="form-input" type="number" min="0" value={form.lead_time_days} onChange={e => set('lead_time_days', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Min order qty</label>
                    <input className="form-input" type="number" step="0.0001" min="0" value={form.min_order_qty} onChange={e => set('min_order_qty', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Order multiple</label>
                    <input className="form-input" type="number" step="0.0001" min="0" value={form.order_multiple} onChange={e => set('order_multiple', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Min stock level</label>
                    <input className="form-input" type="number" step="0.0001" min="0" value={form.min_stock_level} onChange={e => set('min_stock_level', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Max stock level</label>
                    <input className="form-input" type="number" step="0.0001" min="0" value={form.max_stock_level} onChange={e => set('max_stock_level', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Reorder qty</label>
                    <input className="form-input" type="number" step="0.0001" min="0" value={form.reorder_qty} onChange={e => set('reorder_qty', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Physical / Warranty */}
              <div className={styles.card}>
                <div className={styles.cardTitle}>Physical & Warranty</div>
                <div className={styles.grid4}>
                  <div className="form-group">
                    <label className="form-label">Weight (kg)</label>
                    <input className="form-input" type="number" step="0.0001" min="0" placeholder="0.00" value={form.weight_kg} onChange={e => set('weight_kg', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Length (cm)</label>
                    <input className="form-input" type="number" step="0.01" min="0" placeholder="0.00" value={form.length_cm} onChange={e => set('length_cm', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Width (cm)</label>
                    <input className="form-input" type="number" step="0.01" min="0" placeholder="0.00" value={form.width_cm} onChange={e => set('width_cm', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Height (cm)</label>
                    <input className="form-input" type="number" step="0.01" min="0" placeholder="0.00" value={form.height_cm} onChange={e => set('height_cm', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Warranty (months)</label>
                    <input className="form-input" type="number" min="0" value={form.warranty_months} onChange={e => set('warranty_months', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Extended warranty (months)</label>
                    <input className="form-input" type="number" min="0" value={form.extended_warranty_months} onChange={e => set('extended_warranty_months', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            {/* Right column — meta */}
            <div className={styles.sideCol}>
              {/* Primary image */}
              {!isNew && (
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Primary Image</div>
                  {product?.primary_image_url ? (
                    <img src={product.primary_image_url} alt={form.name} className={styles.primaryImg} />
                  ) : (
                    <div className={styles.noImage}>No image yet</div>
                  )}
                  <button type="button" className="btn btn-outline btn-sm" style={{marginTop:10,width:'100%'}} onClick={() => setActiveTab('images')}>
                    Manage images
                  </button>
                </div>
              )}

              {/* Status */}
              <div className={styles.card}>
                <div className={styles.cardTitle}>Status</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5 }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} style={{ accentColor: 'var(--accent)', width: 16, height: 16 }} />
                  Active (visible in documents & portal)
                </label>
              </div>

              {/* Supplier */}
              <div className={styles.card}>
                <div className={styles.cardTitle}>Preferred Supplier</div>
                <div className="form-group">
                  <label className="form-label">Supplier part number</label>
                  <input className="form-input" value={form.supplier_part_number} onChange={e => set('supplier_part_number', e.target.value)} placeholder="MFR-SKU-1234" style={{ fontFamily: 'DM Mono' }} />
                </div>
              </div>

              {/* Save button */}
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={saving || !form.name.trim()}>
                {saving ? <><span className="spinner" /> Saving...</> : isNew ? 'Create product' : 'Save changes'}
              </button>

              {!isNew && (
                <button type="button" className="btn btn-outline" style={{ width: '100%' }}
                  onClick={() => { if (confirm('Archive this product?')) productsApi.void(id, 'Archived by user').then(() => navigate('/products')); }}>
                  Archive product
                </button>
              )}
            </div>
          </form>
        )}

        {/* ── IMAGES TAB ── */}
        {!isNew && activeTab === 'images' && (
          <div className={styles.tabContent}>
            <div className={styles.uploadArea}>
              <input ref={imgInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
              <button className={styles.uploadBtn} onClick={() => imgInputRef.current.click()} disabled={uploading}>
                {uploading ? <><span className="spinner-dark" /> Uploading...</> : <><UploadIcon /> Upload image</>}
              </button>
              <div className={styles.uploadHint}>JPEG, PNG, WebP — max 10 MB</div>
            </div>

            {images.length === 0 ? (
              <div className={styles.emptyTab}>No images uploaded yet.</div>
            ) : (
              <div className={styles.imageGrid}>
                {images.map(img => (
                  <div key={img.id} className={[styles.imageCard, img.is_primary ? styles.imagePrimary : ''].join(' ')}>
                    <img src={img.image_url} alt={img.alt_text || form.name} className={styles.imagePreview} />
                    {img.is_primary && <div className={styles.primaryBadge}>Primary</div>}
                    <div className={styles.imageActions}>
                      {!img.is_primary && (
                        <button className="btn btn-outline btn-sm" onClick={() => handleSetPrimary(img.id)}>Set primary</button>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteImage(img.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── DOCUMENTS TAB ── */}
        {!isNew && activeTab === 'documents' && (
          <div className={styles.tabContent}>
            <div className={styles.uploadArea}>
              <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.png" style={{ display: 'none' }} onChange={handleDocUpload} />
              <button className={styles.uploadBtn} onClick={() => docInputRef.current.click()} disabled={uploading}>
                {uploading ? <><span className="spinner-dark" /> Uploading...</> : <><UploadIcon /> Upload document</>}
              </button>
              <div className={styles.uploadHint}>PDF, Word, Excel, images — max 50 MB</div>
            </div>

            {documents.length === 0 ? (
              <div className={styles.emptyTab}>No documents uploaded yet. Upload spec sheets, manuals, MSDS etc.</div>
            ) : (
              <div className={styles.docList}>
                {documents.map(doc => (
                  <div key={doc.id} className={styles.docRow}>
                    <div className={styles.docIcon}><DocIcon mime={doc.mime_type} /></div>
                    <div className={styles.docInfo}>
                      <div className={styles.docName}>{doc.file_name}</div>
                      <div className={styles.docMeta}>
                        {formatFileSize(doc.file_size)}
                        {doc.description && ` · ${doc.description}`}
                        {doc.is_visible_to_dealer    && ' · Dealer visible'}
                        {doc.is_visible_to_customer  && ' · Customer visible'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <a href={`/uploads/${doc.storage_path}`} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">Download</a>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDoc(doc.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CUSTOM FIELDS TAB ── */}
        {!isNew && activeTab === 'custom' && (
          <div className={styles.tabContent}>
            {customFields.length === 0 ? (
              <div className={styles.emptyTab}>
                No custom fields defined for products yet.
                <button className="btn btn-outline btn-sm" style={{marginTop:12}} onClick={() => navigate('/admin/products/custom-fields')}>
                  Add custom fields
                </button>
              </div>
            ) : (
              <>
                <div className={styles.customGrid}>
                  {customFields.map(field => {
                    const val = customValues[field.field_key];
                    const isEmpty = val === undefined || val === null || val === '';
                    const showRequired = field.is_required && isEmpty;
                    return (
                    <div key={field.id} className="form-group">
                      <label className="form-label">
                        {field.field_label}
                        {field.is_required && <span style={{color:'var(--red)',marginLeft:3}}>*</span>}
                      </label>
                      {field.help_text && <div style={{fontSize:11.5,color:'var(--text-sub)',marginBottom:5}}>{field.help_text}</div>}

                      {field.field_type === 'text' && (
                        <input className={['form-input', showRequired ? 'error' : ''].join(' ')} value={customValues[field.field_key] || ''} onChange={e => setCustomValues(v => ({...v,[field.field_key]:e.target.value}))} placeholder={field.placeholder || ''} />
                      )}
                      {field.field_type === 'textarea' && (
                        <textarea className="form-input" rows={3} value={customValues[field.field_key] || ''} onChange={e => setCustomValues(v => ({...v,[field.field_key]:e.target.value}))} />
                      )}
                      {field.field_type === 'number' && (
                        <input className={['form-input', showRequired ? 'error' : ''].join(' ')} type="number" value={customValues[field.field_key] ?? ''} onChange={e => setCustomValues(v => ({...v,[field.field_key]:e.target.value}))} />
                      )}
                      {field.field_type === 'boolean' && (
                        <label style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',fontSize:13.5}}>
                          <input type="checkbox" checked={!!customValues[field.field_key]} onChange={e => setCustomValues(v => ({...v,[field.field_key]:e.target.checked}))} style={{accentColor:'var(--accent)',width:15,height:15}} />
                          Yes
                        </label>
                      )}
                      {field.field_type === 'date' && (
                        <input className="form-input" type="date" value={customValues[field.field_key] || ''} onChange={e => setCustomValues(v => ({...v,[field.field_key]:e.target.value}))} />
                      )}
                      {(field.field_type === 'select' || field.field_type === 'multi_select') && (
                        <select className="form-input" value={customValues[field.field_key] || ''} onChange={e => setCustomValues(v => ({...v,[field.field_key]:e.target.value}))}>
                          <option value="">Select...</option>
                          {field.options?.map(o => <option key={o.option_key} value={o.option_key}>{o.option_label}</option>)}
                        </select>
                      )}
                      {showRequired && (
                        <div style={{fontSize:11.5,color:'var(--red)',marginTop:4}}>This field is required</div>
                      )}
                    </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                  <button className="btn btn-primary" onClick={handleSaveCustom} disabled={saving}>
                    {saving ? 'Saving...' : 'Save custom fields'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── PRICING TAB ── */}
        {!isNew && activeTab === 'pricing' && (
          <div className={styles.tabContent}>
            {pricing.length === 0 ? (
              <div className={styles.emptyTab}>
                No price lists configured.
                <button className="btn btn-outline btn-sm" style={{marginTop:12}} onClick={() => navigate('/settings')}>
                  Create price lists in Settings
                </button>
              </div>
            ) : (
              <>
                <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Price list</th>
                        <th>Type</th>
                        <th>Unit price (AUD)</th>
                        <th>Min qty</th>
                        <th>Discount %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pricing.map((p, i) => (
                        <tr key={p.price_list_id}>
                          <td>
                            <div style={{ fontWeight: 500 }}>{p.price_list_name}</div>
                            {p.is_default && <div style={{ fontSize: 11, color: 'var(--accent)' }}>Default</div>}
                          </td>
                          <td><span className="pill pill-grey">{p.price_list_type}</span></td>
                          <td>
                            <input
                              className="form-input"
                              type="number" step="0.0001" min="0"
                              style={{ width: 120, fontFamily: 'DM Mono' }}
                              placeholder="Not set"
                              value={p.unit_price ?? ''}
                              onChange={e => {
                                const v = [...pricing];
                                v[i] = { ...v[i], unit_price: e.target.value === '' ? null : parseFloat(e.target.value) };
                                setPricing(v);
                              }}
                            />
                          </td>
                          <td>
                            <input className="form-input" type="number" step="0.0001" min="1" style={{ width: 80 }}
                              value={p.min_qty || 1}
                              onChange={e => { const v=[...pricing]; v[i]={...v[i],min_qty:parseFloat(e.target.value)||1}; setPricing(v); }} />
                          </td>
                          <td>
                            <input className="form-input" type="number" step="0.01" min="0" max="100" style={{ width: 80 }}
                              value={p.discount_pct || 0}
                              onChange={e => { const v=[...pricing]; v[i]={...v[i],discount_pct:parseFloat(e.target.value)||0}; setPricing(v); }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn btn-primary" onClick={handleSavePricing} disabled={saving}>
                    {saving ? 'Saving...' : 'Save pricing'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── STOCK TAB ── */}
        {!isNew && activeTab === 'stock' && (
          <div className={styles.tabContent}>
            {stock.length === 0 ? (
              <div className={styles.emptyTab}>No stock levels recorded yet. Stock is updated when goods receipts are posted.</div>
            ) : (
              <>
                <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Warehouse</th>
                        <th>On hand</th>
                        <th>Reserved</th>
                        <th>Available</th>
                        <th>On order</th>
                        <th>Last updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stock.map(s => (
                        <tr key={s.id}>
                          <td>
                            <div style={{ fontWeight: 500 }}>{s.warehouse_name}</div>
                            <div style={{ fontSize: 11.5, fontFamily: 'DM Mono', color: 'var(--text-sub)' }}>{s.warehouse_code}</div>
                          </td>
                          <td style={{ fontFamily: 'DM Mono', fontWeight: 600 }}>{formatQty(s.qty_on_hand)}</td>
                          <td style={{ fontFamily: 'DM Mono', color: 'var(--orange)' }}>{formatQty(s.qty_reserved)}</td>
                          <td style={{ fontFamily: 'DM Mono', color: s.qty_available > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                            {formatQty(s.qty_available)}
                          </td>
                          <td style={{ fontFamily: 'DM Mono', color: 'var(--accent)' }}>{formatQty(s.qty_on_order)}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-sub)' }}>
                            {new Date(s.updated_at).toLocaleDateString('en-AU')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, fontSize: 13, color: 'var(--text-sub)' }}>
                  Total on hand: <strong>{formatQty(stock.reduce((s, r) => s + (r.qty_on_hand || 0), 0))}</strong>
                  {' · '}
                  Total available: <strong>{formatQty(stock.reduce((s, r) => s + (r.qty_available || 0), 0))}</strong>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

function DocIcon({ mime }) {
  const isImg = mime?.startsWith('image');
  const isPdf = mime === 'application/pdf';
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 6,
      background: isPdf ? 'var(--red-dim)' : isImg ? 'var(--accent-dim)' : 'var(--bg)',
      border: '1px solid var(--border)',
      display: 'grid', placeItems: 'center',
      fontSize: 10, fontWeight: 700, color: isPdf ? 'var(--red)' : 'var(--accent)',
    }}>
      {isPdf ? 'PDF' : isImg ? 'IMG' : 'DOC'}
    </div>
  );
}

function SvgIcon({ children, size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}
function ArrowIcon()  { return <SvgIcon><polyline points="15 18 9 12 15 6"/></SvgIcon>; }
function AlertIcon()  { return <SvgIcon size={14}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></SvgIcon>; }
function UploadIcon() { return <SvgIcon><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></SvgIcon>; }
