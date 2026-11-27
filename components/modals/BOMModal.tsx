'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Plus, Trash2 } from 'lucide-react';

// Create or edit a draft bill of materials. A BOM says what goes into `baseQuantity` of the item (1 pcs, 100 kg, 200 L);
// each component is entered in its stock unit or its purchase unit, both from the item master.

const blankLine = () => ({ product: '', quantity: '', unit: '', wastagePercentage: '' });
const blankOutput = () => ({ product: '', kind: 'SCRAP', quantity: '', unit: '' });
const blankStep = () => ({ description: '', machineType: '', estimatedTimeMinutes: '' });

export default function BOMModal({ isOpen, onClose, onSuccess, bom }: { isOpen: boolean; onClose: () => void; onSuccess: () => void; bom?: any }) {
  const editing = !!bom?._id;
  const [form, setForm] = useState<any>({ product: '', version: '', baseQuantity: '1', notes: '', components: [blankLine()], outputs: [], routingSteps: [] });
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/products').then(r => (r.ok ? r.json() : [])).then(d => setProducts(Array.isArray(d) ? d : [])).catch(() => setProducts([]));
    setError('');
    setForm(editing ? {
      product: String(bom.product?._id || bom.product), version: bom.version, baseQuantity: String(bom.baseQuantity || 1), notes: bom.notes || '',
      components: (bom.components || []).map((c: any) => ({ product: String(c.product?._id || c.product), quantity: String(c.quantity), unit: c.unit, wastagePercentage: c.wastagePercentage ? String(c.wastagePercentage) : '' })),
      outputs: (bom.outputs || []).map((o: any) => ({ product: String(o.product?._id || o.product), kind: o.kind, quantity: String(o.quantity), unit: o.unit })),
      routingSteps: (bom.routingSteps || []).map((s: any) => ({ description: s.description, machineType: s.machineType || '', estimatedTimeMinutes: String(s.estimatedTimeMinutes ?? '') })),
    } : { product: '', version: '', baseQuantity: '1', notes: '', components: [blankLine()], outputs: [], routingSteps: [] });
  }, [isOpen, bom, editing]);

  if (!isOpen) return null;

  const byId = new Map(products.map(p => [String(p._id), p]));
  const output = byId.get(form.product);
  const makeable = products.filter(p => (p.productType !== 'SERVICE' && p.productType !== 'RAW_MATERIAL') || String(p._id) === form.product);
  const materials = products.filter(p => p.productType !== 'SERVICE' && String(p._id) !== form.product);
  const unitsOf = (p: any) => (p ? [p.uom, ...(p.purchaseUom && p.purchaseUom !== p.uom ? [p.purchaseUom] : [])] : []);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  type ListKey = 'components' | 'outputs' | 'routingSteps';
  const setLine = (key: ListKey, i: number, k: string, v: any) =>
    setForm((f: any) => ({ ...f, [key]: f[key].map((x: any, n: number) => (n === i ? { ...x, [k]: v, ...(k === 'product' ? { unit: byId.get(v)?.uom || '' } : {}) } : x)) }));
  const addLine = (key: ListKey) => setForm((f: any) => ({ ...f, [key]: [...f[key], key === 'components' ? blankLine() : key === 'outputs' ? blankOutput() : blankStep()] }));
  const dropLine = (key: ListKey, i: number) => setForm((f: any) => ({ ...f, [key]: f[key].filter((_: any, n: number) => n !== i) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const body: any = {
        baseQuantity: form.baseQuantity, notes: form.notes,
        components: form.components.filter((c: any) => c.product).map((c: any) => ({ product: c.product, quantity: c.quantity, unit: c.unit, wastagePercentage: c.wastagePercentage || 0 })),
        outputs: form.outputs.filter((o: any) => o.product).map((o: any) => ({ product: o.product, kind: o.kind, quantity: o.quantity, unit: o.unit })),
        routingSteps: form.routingSteps.filter((s: any) => s.description.trim()),
        ...(form.version.trim() ? { version: form.version.trim() } : {}),
        ...(editing ? {} : { product: form.product }),
      };
      const res = await fetch(editing ? `/api/production/bom/${bom._id}` : '/api/production/bom', {
        method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `The BOM could not be saved (${res.status}).`);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const field = 'w-full p-2 rounded-lg border border-slate-200 outline-none text-sm focus:border-blue-500';
  const label = 'block text-xs font-bold text-slate-500 mb-1';

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{editing ? `Edit BOM ${output?.sku || ''}, version ${bom.version}` : 'New bill of materials'}</h2>
            <p className="text-xs text-slate-500">Saved as a draft. It is used for work orders and MRP only after it is activated.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl flex items-center gap-2 text-sm"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}
          {editing && bom.rejection?.remarks && (
            <div className="p-3 bg-amber-50 text-amber-900 rounded-xl text-sm">Sent back by {bom.rejection.by}{bom.rejection.role ? ` (${bom.rejection.role})` : ''}: {bom.rejection.remarks}</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className={label}>Item this BOM makes</label>
              <select value={form.product} onChange={e => set('product', e.target.value)} className={field} required disabled={editing}>
                <option value="">Select item</option>
                {makeable.map(p => <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Makes (base quantity)</label>
              <div className="flex items-center gap-2">
                <input type="number" min="0" step="any" value={form.baseQuantity} onChange={e => set('baseQuantity', e.target.value)} className={field} required />
                <span className="text-sm text-slate-600 whitespace-nowrap">{output?.uom || ''}</span>
              </div>
            </div>
            <div>
              <label className={label}>Version</label>
              <input type="text" value={form.version} onChange={e => set('version', e.target.value)} className={field} placeholder={editing ? '' : 'Next number'} />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-slate-800">Components <span className="text-xs font-normal text-slate-500">quantities for {form.baseQuantity || '…'} {output?.uom || ''}</span></h3>
              <button type="button" onClick={() => addLine('components')} className="text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus className="w-4 h-4" /> Add component</button>
            </div>
            <div className="space-y-2">
              {form.components.map((c: any, i: number) => {
                const p = byId.get(c.product);
                const units = unitsOf(p);
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="col-span-12 md:col-span-6">
                      <label className={label}>Material</label>
                      <select value={c.product} onChange={e => setLine('components', i, 'product', e.target.value)} className={field} required>
                        <option value="">Select material</option>
                        {materials.map(m => <option key={m._id} value={m._id}>{m.name} ({m.sku})</option>)}
                      </select>
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className={label}>Quantity</label>
                      <input type="number" min="0" step="any" value={c.quantity} onChange={e => setLine('components', i, 'quantity', e.target.value)} className={field} required />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className={label}>Unit</label>
                      <select value={c.unit} onChange={e => setLine('components', i, 'unit', e.target.value)} className={field} disabled={!p}>
                        {units.map(u => <option key={u} value={u}>{u}{u !== p?.uom ? ` (= ${p.purchaseConversion || 1} ${p.uom})` : ''}</option>)}
                      </select>
                    </div>
                    <div className="col-span-3 md:col-span-1">
                      <label className={label}>Wastage %</label>
                      <input type="number" min="0" max="99.99" step="any" value={c.wastagePercentage} onChange={e => setLine('components', i, 'wastagePercentage', e.target.value)} className={field} placeholder="0" />
                    </div>
                    <button type="button" onClick={() => dropLine('components', i)} className="col-span-1 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg justify-self-end" aria-label="Remove component"><Trash2 className="w-4 h-4" /></button>
                  </div>
                );
              })}
              {!form.components.length && <div className="text-center py-5 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">No components yet.</div>}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-slate-800">Scrap &amp; by-products <span className="text-xs font-normal text-slate-500">what else {form.baseQuantity || '…'} {output?.uom || ''} gives, expected</span></h3>
              <button type="button" onClick={() => addLine('outputs')} className="text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus className="w-4 h-4" /> Add output</button>
            </div>
            <div className="space-y-2">
              {form.outputs.map((o: any, i: number) => {
                const p = byId.get(o.product);
                const choices = materials.filter(m => (o.kind === 'SCRAP' ? m.isScrap : !m.isScrap) || String(m._id) === o.product);
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="col-span-4 md:col-span-2">
                      <label className={label}>Type</label>
                      <select value={o.kind} onChange={e => setLine('outputs', i, 'kind', e.target.value)} className={field}>
                        <option value="SCRAP">Scrap</option><option value="BY_PRODUCT">By-product</option>
                      </select>
                    </div>
                    <div className="col-span-8 md:col-span-5">
                      <label className={label}>Item</label>
                      <select value={o.product} onChange={e => setLine('outputs', i, 'product', e.target.value)} className={field} required>
                        <option value="">{o.kind === 'SCRAP' ? 'Select a scrap item' : 'Select item'}</option>
                        {choices.map(m => <option key={m._id} value={m._id}>{m.name} ({m.sku})</option>)}
                      </select>
                    </div>
                    <div className="col-span-5 md:col-span-2">
                      <label className={label}>Expected qty</label>
                      <input type="number" min="0" step="any" value={o.quantity} onChange={e => setLine('outputs', i, 'quantity', e.target.value)} className={field} required />
                    </div>
                    <div className="col-span-5 md:col-span-2">
                      <label className={label}>Unit</label>
                      <select value={o.unit} onChange={e => setLine('outputs', i, 'unit', e.target.value)} className={field} disabled={!p}>
                        {unitsOf(p).map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <button type="button" onClick={() => dropLine('outputs', i)} className="col-span-2 md:col-span-1 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg justify-self-end" aria-label="Remove output"><Trash2 className="w-4 h-4" /></button>
                  </div>
                );
              })}
              {!form.outputs.length && <p className="text-xs text-slate-500">None. Add recoverable scrap (offcuts, swarf…) or useful by-products. Scrap items must be marked as scrap in the item master.</p>}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-slate-800">Operations <span className="text-xs font-normal text-slate-500">optional, in order</span></h3>
              <button type="button" onClick={() => addLine('routingSteps')} className="text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus className="w-4 h-4" /> Add operation</button>
            </div>
            <div className="space-y-2">
              {form.routingSteps.map((s: any, i: number) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="col-span-1 text-sm font-bold text-slate-500 pb-2 text-center">{i + 1}</div>
                  <div className="col-span-11 md:col-span-5"><label className={label}>Operation</label><input value={s.description} onChange={e => setLine('routingSteps', i, 'description', e.target.value)} className={field} required /></div>
                  <div className="col-span-6 md:col-span-3"><label className={label}>Machine / work centre</label><input value={s.machineType} onChange={e => setLine('routingSteps', i, 'machineType', e.target.value)} className={field} /></div>
                  <div className="col-span-5 md:col-span-2"><label className={label}>Minutes</label><input type="number" min="0" step="any" value={s.estimatedTimeMinutes} onChange={e => setLine('routingSteps', i, 'estimatedTimeMinutes', e.target.value)} className={field} /></div>
                  <button type="button" onClick={() => dropLine('routingSteps', i)} className="col-span-1 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg justify-self-end" aria-label="Remove operation"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className={label}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} className={field} rows={2} placeholder="What changed in this version, special instructions…" />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-5 py-2.5 font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
          <button type="submit" disabled={loading} className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl flex items-center gap-2 disabled:opacity-60">
            <Save className="w-4 h-4" /> {loading ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      </form>
    </div>
  );
}
