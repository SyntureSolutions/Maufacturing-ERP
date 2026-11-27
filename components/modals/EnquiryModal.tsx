'use client';

import React, { useEffect, useState } from 'react';
import { X, Save, AlertCircle, Plus, Trash2 } from 'lucide-react';

// Add or correct an enquiry (lead). Used on CRM and Sales Pipeline. Errors from the server are shown in the form; nothing is closed until it saved.

const SOURCES: [string, string][] = [['WEBSITE', 'Website'], ['EMAIL', 'Email'], ['PHONE', 'Phone'], ['TRADE_SHOW', 'Trade show'], ['DIRECT', 'Direct visit']];
const field = 'w-full px-3.5 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm';
const label = 'text-xs font-bold text-slate-700 uppercase tracking-wider';
const blankItem = () => ({ productName: '', estimatedQuantity: '1', product: '' });

interface Props { isOpen: boolean; onClose: () => void; onSaved: (enquiry: any) => void; enquiry?: any }

export default function EnquiryModal({ isOpen, onClose, onSaved, enquiry }: Props) {
  const [products, setProducts] = useState<any[]>([]);
  const [form, setForm] = useState({ customerName: '', email: '', phone: '', source: 'WEBSITE', region: 'DOMESTIC', country: '', notes: '' });
  const [items, setItems] = useState<any[]>([blankItem()]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    if (enquiry) {
      setForm({ customerName: enquiry.customerName || '', email: enquiry.email || '', phone: enquiry.phone || '', source: enquiry.source || 'WEBSITE', region: enquiry.region || 'DOMESTIC', country: enquiry.country || '', notes: enquiry.notes || '' });
      setItems((enquiry.items || []).map((i: any) => ({ productName: i.productName || '', estimatedQuantity: String(i.estimatedQuantity ?? 1), product: String(i.product || '') })));
    } else {
      setForm({ customerName: '', email: '', phone: '', source: 'WEBSITE', region: 'DOMESTIC', country: '', notes: '' });
      setItems([blankItem()]);
    }
    fetch('/api/products').then(r => (r.ok ? r.json() : [])).then(d => setProducts(Array.isArray(d) ? d.filter((p: any) => p.isActive !== false && p.sku) : [])).catch(() => setProducts([]));
  }, [isOpen, enquiry]);

  if (!isOpen) return null;

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const setItem = (n: number, k: string, v: string) => setItems(list => list.map((it, i) => {
    if (i !== n) return it;
    const next = { ...it, [k]: v };
    if (k === 'productName') next.product = products.find(p => p.name === v)?._id || ''; // a name from the product list is linked to that product
    return next;
  }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      const payload = { ...form, items: items.map(i => ({ productName: i.productName, estimatedQuantity: Number(i.estimatedQuantity), ...(i.product ? { product: i.product } : {}) })) };
      const res = await fetch(enquiry ? `/api/enquiries/${enquiry._id}` : '/api/enquiries', { method: enquiry ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `The enquiry could not be saved (error ${res.status}).`);
      onSaved(data);
      onClose();
    } catch (err: any) {
      setError(err.message || 'The enquiry could not be saved.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
          <div><h3 className="text-lg font-bold text-slate-900">{enquiry ? `Edit enquiry ${enquiry.enquiryNumber}` : 'New enquiry (lead)'}</h3>
            <p className="text-xs text-slate-500">{enquiry ? 'It can be changed until a quotation is made from it.' : 'Capture who is asking and what they want. Quote it from Sales Pipeline.'}</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-200" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-5 p-6">
          {error && <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2"><label className={label}>Customer / company name *</label>
              <input required className={field} value={form.customerName} onChange={e => set('customerName', e.target.value)} placeholder="e.g. Hero Cycles Regional Outlets" /></div>
            <div className="space-y-1.5"><label className={label}>Email</label>
              <input type="email" className={field} value={form.email} onChange={e => set('email', e.target.value)} placeholder="procurement@customer.com" /></div>
            <div className="space-y-1.5"><label className={label}>Phone</label>
              <input className={field} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98200 11223" /></div>
            <div className="space-y-1.5"><label className={label}>How did they reach us</label>
              <select className={field} value={form.source} onChange={e => set('source', e.target.value)}>{SOURCES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="space-y-1.5"><label className={label}>Market</label>
              <select className={field} value={form.region} onChange={e => set('region', e.target.value)}><option value="DOMESTIC">Domestic</option><option value="EXPORT">Export</option></select></div>
            {form.region === 'EXPORT' && <div className="space-y-1.5 md:col-span-2"><label className={label}>Country *</label>
              <input required className={field} value={form.country} onChange={e => set('country', e.target.value)} placeholder="e.g. Germany" /></div>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between"><label className={label}>What they want *</label>
              <button type="button" className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline" onClick={() => setItems(l => [...l, blankItem()])}><Plus className="h-3.5 w-3.5" /> Add item</button></div>
            <datalist id="enquiry-products">{products.map(p => <option key={p._id} value={p.name}>{p.sku}</option>)}</datalist>
            {items.map((it, n) => (
              <div key={n} className="grid grid-cols-[1fr_7rem_2.25rem] gap-2">
                <input required list="enquiry-products" className={field} value={it.productName} onChange={e => setItem(n, 'productName', e.target.value)} placeholder="Pick a product or type what they asked for" />
                <input required type="number" min="0.0001" step="any" className={field + ' text-right'} value={it.estimatedQuantity} onChange={e => setItem(n, 'estimatedQuantity', e.target.value)} aria-label="Quantity" />
                <button type="button" disabled={items.length === 1} className="rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" onClick={() => setItems(l => l.filter((_, i) => i !== n))} aria-label="Remove this item"><Trash2 className="mx-auto h-4 w-4" /></button>
              </div>))}
          </div>

          <div className="space-y-1.5"><label className={label}>Notes</label>
            <textarea rows={3} className={field + ' resize-none'} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything the sales team should know" /></div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-2 text-sm font-bold text-slate-900 shadow hover:bg-amber-400 disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving…' : enquiry ? 'Save changes' : 'Save enquiry'}</button>
        </div>
      </form>
    </div>
  );
}
