import React, { useEffect, useState } from 'react';
import { settingsApi } from '../../../api/settings';
import styles from './Section.module.css';

const SERIES_TYPES = [
  'invoice','quote','credit_note','purchase_order','goods_receipt',
  'service_job','delivery','picking_list','shipment','stocktake','journal',
];

const DEFAULT_SERIES = [
  { series_type:'invoice',        name:'Sales Invoice',    code:'SLS', prefix:'SLS', include_year:true,  padding:5 },
  { series_type:'quote',          name:'Quote',            code:'QT',  prefix:'QT',  include_year:true,  padding:5 },
  { series_type:'credit_note',    name:'Credit Note',      code:'CN',  prefix:'CN',  include_year:true,  padding:5 },
  { series_type:'purchase_order', name:'Purchase Order',   code:'PO',  prefix:'PO',  include_year:true,  padding:5 },
  { series_type:'goods_receipt',  name:'Goods Receipt',    code:'GR',  prefix:'GR',  include_year:true,  padding:5 },
  { series_type:'service_job',    name:'Service Job',      code:'SRV', prefix:'SRV', include_year:true,  padding:4 },
  { series_type:'delivery',       name:'Delivery Docket',  code:'DEL', prefix:'DEL', include_year:false, padding:5 },
  { series_type:'journal',        name:'Journal Entry',    code:'JNL', prefix:'JNL', include_year:true,  padding:5 },
];

function previewNumber(series) {
  const year  = new Date().getFullYear().toString();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const sep   = series.separator || '-';
  let num = series.prefix || '';
  if (series.include_year)  num += year  + sep;
  if (series.include_month) num += month + sep;
  num += String(series.next_number || 1).padStart(series.padding || 5, '0');
  num += (series.suffix || '');
  return num;
}

const EMPTY_FORM = { name:'', code:'', series_type:'invoice', prefix:'', suffix:'', separator:'-', include_year:true, include_month:false, padding:5, next_number:1, is_default:true, allow_manual:false };

export default function NumberingSettings() {
  const [series,  setSeries]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [saved,   setSaved]   = useState(false);

  async function load() {
    setLoading(true);
    try { const { data } = await settingsApi.listNumbering(); setSeries(data.data); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function set(field, value) {
    setForm(f => {
      const next = { ...f, [field]: value };
      if (field === 'series_type') {
        const def = DEFAULT_SERIES.find(d => d.series_type === value);
        if (def && !f.prefix) { next.prefix = def.prefix; next.name = def.name; next.padding = def.padding; next.include_year = def.include_year; next.code = def.code; }
      }
      return next;
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = { ...form, padding: parseInt(form.padding) || 5, next_number: parseInt(form.next_number) || 1 };
      if (editing === 'new') {
        await settingsApi.createNumbering(payload);
      } else {
        await settingsApi.updateNumbering(editing, payload);
      }
      setEditing(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSeedDefaults() {
    if (!confirm('This will create the standard Australian numbering series for all document types. Continue?')) return;
    setSaving(true);
    try {
      for (const def of DEFAULT_SERIES) {
        try {
          await settingsApi.createNumbering({ ...def, separator: '-', suffix: '', include_month: false, next_number: 1, is_default: true, allow_manual: false });
        } catch { /* skip duplicates */ }
      }
      load();
    } finally {
      setSaving(false);
    }
  }

  function startEdit(s) {
    setForm({ name: s.name, code: s.code, series_type: s.series_type, prefix: s.prefix || '', suffix: s.suffix || '', separator: s.separator || '-', include_year: !!s.include_year, include_month: !!s.include_month, padding: s.padding || 5, next_number: s.next_number || 1, is_default: !!s.is_default, allow_manual: !!s.allow_manual });
    setEditing(s.id);
    setError('');
  }

  if (loading) return <div className={styles.loading}><div className="spinner-dark" /> Loading...</div>;

  return (
    <div>
      {saved && <div className={styles.successBox}>Numbering series saved.</div>}

      {series.length === 0 ? (
        <div className={styles.empty}>
          <p>No numbering series configured. Use the defaults for a standard Australian setup.</p>
          <button className="btn btn-primary btn-sm" onClick={handleSeedDefaults} disabled={saving}>
            {saving ? 'Creating...' : 'Create default series'}
          </button>
        </div>
      ) : (
        <>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {series.map(s => (
              <div key={s.id}>
                <div className={styles.itemCard}>
                  <div className={styles.itemLeft}>
                    <div className={styles.itemTitle}>
                      {s.name}
                      {s.is_default && <span className="pill pill-blue">Default</span>}
                      {!s.is_active && <span className="pill pill-grey">Inactive</span>}
                    </div>
                    <div className={styles.itemMeta}>{s.series_type}</div>
                    <div style={{ marginTop: 6 }}>
                      <div className={styles.previewBadge}>{previewNumber(s)}</div>
                      <div className={styles.previewSub}>Next number preview</div>
                    </div>
                  </div>
                  <div className={styles.itemActions}>
                    <button className="btn btn-outline btn-sm" onClick={() => editing === s.id ? setEditing(null) : startEdit(s)}>
                      {editing === s.id ? 'Cancel' : 'Edit'}
                    </button>
                  </div>
                </div>

                {editing === s.id && (
                  <form className={styles.editForm} onSubmit={handleSave}>
                    {error && <div className={styles.errorBox}>{error}</div>}
                    <div className={styles.editFormRow}>
                      <div className="form-group" style={{flex:2}}>
                        <label className="form-label">Series name</label>
                        <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
                      </div>
                      <div className="form-group" style={{flex:1}}>
                        <label className="form-label">Code</label>
                        <input className="form-input" value={form.code} onChange={e => set('code', e.target.value.toUpperCase())} maxLength={20} />
                      </div>
                    </div>
                    <div className={styles.editFormRow}>
                      <div className="form-group" style={{flex:1}}>
                        <label className="form-label">Prefix</label>
                        <input className="form-input" value={form.prefix} onChange={e => set('prefix', e.target.value)} placeholder="SLS" />
                      </div>
                      <div className="form-group" style={{flex:1}}>
                        <label className="form-label">Separator</label>
                        <input className="form-input" value={form.separator} onChange={e => set('separator', e.target.value)} maxLength={5} />
                      </div>
                      <div className="form-group" style={{flex:1}}>
                        <label className="form-label">Suffix</label>
                        <input className="form-input" value={form.suffix} onChange={e => set('suffix', e.target.value)} placeholder="(optional)" />
                      </div>
                    </div>
                    <div className={styles.editFormRow}>
                      <div className="form-group" style={{flex:1}}>
                        <label className="form-label">Padding digits</label>
                        <input className="form-input" type="number" min={1} max={10} value={form.padding} onChange={e => set('padding', e.target.value)} />
                      </div>
                      <div className="form-group" style={{flex:1}}>
                        <label className="form-label">Next number</label>
                        <input className="form-input" type="number" min={1} value={form.next_number} onChange={e => set('next_number', e.target.value)} />
                      </div>
                    </div>
                    <div className={styles.editFormRow} style={{gap:20}}>
                      {[['include_year','Include year'],['include_month','Include month'],['allow_manual','Allow manual entry']].map(([field, label]) => (
                        <label key={field} style={{display:'flex',alignItems:'center',gap:6,fontSize:13,cursor:'pointer'}}>
                          <input type="checkbox" checked={!!form[field]} onChange={e => set(field, e.target.checked)} style={{accentColor:'var(--accent)'}} />
                          {label}
                        </label>
                      ))}
                    </div>
                    <div style={{ padding: '8px 0' }}>
                      <div className={styles.previewBadge}>{previewNumber(form)}</div>
                      <div className={styles.previewSub}>Preview with current settings</div>
                    </div>
                    <div className={styles.editFormActions}>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                      <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>

          {editing !== 'new' && (
            <button className={styles.addBtn} style={{marginTop:12}} onClick={() => { setForm(EMPTY_FORM); setEditing('new'); setError(''); }}>
              <PlusIcon /> Add numbering series
            </button>
          )}

          {editing === 'new' && (
            <form className={styles.editForm} style={{marginTop:12}} onSubmit={handleSave}>
              {error && <div className={styles.errorBox}>{error}</div>}
              <div className={styles.editFormRow}>
                <div className="form-group" style={{flex:2}}>
                  <label className="form-label">Series name *</label>
                  <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Sales Invoice" />
                </div>
                <div className="form-group" style={{flex:1}}>
                  <label className="form-label">Type *</label>
                  <select className="form-input" value={form.series_type} onChange={e => set('series_type', e.target.value)}>
                    {SERIES_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{flex:1}}>
                  <label className="form-label">Code *</label>
                  <input className="form-input" value={form.code} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="SLS" maxLength={20} />
                </div>
              </div>
              <div className={styles.editFormRow}>
                <div className="form-group" style={{flex:1}}><label className="form-label">Prefix</label><input className="form-input" value={form.prefix} onChange={e => set('prefix', e.target.value)} /></div>
                <div className="form-group" style={{flex:1}}><label className="form-label">Separator</label><input className="form-input" value={form.separator} onChange={e => set('separator', e.target.value)} maxLength={5} /></div>
                <div className="form-group" style={{flex:1}}><label className="form-label">Padding</label><input className="form-input" type="number" min={1} max={10} value={form.padding} onChange={e => set('padding', e.target.value)} /></div>
              </div>
              <div style={{padding:'8px 0'}}>
                <div className={styles.previewBadge}>{previewNumber(form)}</div>
                <div className={styles.previewSub}>Preview</div>
              </div>
              <div className={styles.editFormActions}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Creating...' : 'Create series'}</button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}

function PlusIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
