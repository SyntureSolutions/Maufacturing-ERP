'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, Alert } from '@/components/ui';

const field = 'input';
const btn = 'btn btn-sm';
const EDIT_ROLES = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER'];
const day = (d: any) => (d ? String(d).slice(0, 10) : '');
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({ product: '', supplier: '', validFrom: today(), validTo: `${new Date().getFullYear() + 1}-12-31`, fixed: false, blocked: false, mrpRelevant: true, notes: '' });

async function api(url: string, method = 'GET', body?: any) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Which suppliers may supply each product, and when. A product with entries valid today can only be bought from
// those suppliers (not a blocked one); the fixed supplier is the one planning proposes on requisitions.
export default function SourceListPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [role, setRole] = useState('');
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState<any>(blank());
  const [editing, setEditing] = useState<any | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = EDIT_ROLES.includes(role);

  const load = useCallback(async () => {
    const get = (u: string) => api(u).then(d => (Array.isArray(d) ? d : [])).catch(() => []);
    const [r, p, s] = await Promise.all([get('/api/source-lists'), get('/api/products'), get('/api/suppliers')]);
    setRows(r); setProducts(p.filter((x: any) => /^[a-f0-9]{24}$/.test(String(x._id)))); setSuppliers(s.filter((x: any) => /^[a-f0-9]{24}$/.test(String(x._id))));
  }, []);
  useEffect(() => { load(); api('/api/auth/session').then(s => setRole(s?.user?.role || '')).catch(() => {}); }, [load]);

  const run = async (fn: () => Promise<any>, ok: string) => {
    setMsg(null); setBusy(true);
    try { await fn(); setMsg({ ok: true, text: ok }); await load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };

  const shown = useMemo(() => rows.filter(r => !filter || String(r.product?._id) === filter), [rows, filter]);
  const validNow = (r: any) => day(r.validFrom) <= today() && day(r.validTo) >= today();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) run(async () => { await api(`/api/source-lists/${editing._id}`, 'PATCH', form); setEditing(null); setForm(blank()); }, 'Source list entry updated.');
    else run(async () => { await api('/api/source-lists', 'POST', form); setForm({ ...blank(), product: form.product }); }, 'Supplier added to the source list.');
  };
  const startEdit = (r: any) => {
    setEditing(r);
    setForm({ product: String(r.product?._id), supplier: String(r.supplier?._id), validFrom: day(r.validFrom), validTo: day(r.validTo), fixed: !!r.fixed, blocked: !!r.blocked, mrpRelevant: r.mrpRelevant !== false, notes: r.notes || '' });
  };
  const patch = (r: any, body: any, ok: string) => run(() => api(`/api/source-lists/${r._id}`, 'PATCH', body), ok);
  const remove = (r: any) => { if (window.confirm(`Remove ${r.supplier?.name} from the source list of ${r.product?.sku}? Purchase orders already raised are not affected.`)) run(() => api(`/api/source-lists/${r._id}`, 'DELETE'), 'Entry removed.'); };

  return (
    <div className="ui-page">
      <PageHeader title="Source List" subtitle="Approved suppliers per product and period. Purchase orders and RFQ awards for a listed product must use a listed, unblocked supplier; planning proposes the fixed one."
        actions={<select className={`${field} !w-auto`} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All products</option>{products.map(p => <option key={p._id} value={p._id}>{p.sku} · {p.name}</option>)}</select>} />
      {msg && <Alert ok={msg.ok}>{msg.text}</Alert>}

      {canEdit && (
        <form onSubmit={save} className="card space-y-3">
          <h2 className="text-[15px] font-bold">{editing ? `Change ${editing.supplier?.name} for ${editing.product?.sku}` : 'Add a supplier to a product'}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="lbl">Product<select required className={field} disabled={!!editing} value={form.product} onChange={e => setForm({ ...form, product: e.target.value })}>
              <option value="">Choose…</option>{products.map(p => <option key={p._id} value={p._id}>{p.sku} · {p.name}</option>)}</select></label>
            <label className="lbl">Supplier<select required className={field} disabled={!!editing} value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })}>
              <option value="">Choose…</option>{suppliers.map(s => <option key={s._id} value={s._id}>{s.name} ({s.code})</option>)}</select></label>
            <label className="lbl">Valid from<input required type="date" className={field} value={form.validFrom} onChange={e => setForm({ ...form, validFrom: e.target.value })} /></label>
            <label className="lbl">Valid to<input required type="date" className={field} value={form.validTo} onChange={e => setForm({ ...form, validTo: e.target.value })} /></label>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.fixed} onChange={e => setForm({ ...form, fixed: e.target.checked, blocked: e.target.checked ? false : form.blocked })} /> Fixed supplier (proposed by planning)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.blocked} onChange={e => setForm({ ...form, blocked: e.target.checked, fixed: e.target.checked ? false : form.fixed })} /> Blocked</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.mrpRelevant} onChange={e => setForm({ ...form, mrpRelevant: e.target.checked })} /> Used by planning</label>
            <input className={`${field} !w-auto flex-1`} placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            {editing && <button type="button" className={`${btn} btn-secondary`} onClick={() => { setEditing(null); setForm(blank()); }}>Cancel</button>}
            <button className={`${btn} btn-primary`} disabled={busy}>{editing ? 'Save' : 'Add'}</button>
          </div>
        </form>)}

      <div className="table-wrap">
        <table className="text-left text-sm">
          <thead><tr><th>Product</th><th>Supplier</th><th>Valid</th><th>Role</th><th>Notes</th><th /></tr></thead>
          <tbody>
            {shown.map(r => (
              <tr key={r._id} className={validNow(r) ? '' : 'text-slate-400'}>
                <td><b>{r.product?.sku}</b> <span className="text-xs">{r.product?.name}</span></td>
                <td>{r.supplier?.name} <span className="text-xs text-slate-500">{r.supplier?.code}</span></td>
                <td className="whitespace-nowrap text-xs">{new Date(r.validFrom).toLocaleDateString('en-IN')} – {new Date(r.validTo).toLocaleDateString('en-IN')}{!validNow(r) && <div>not valid today</div>}</td>
                <td className="space-x-1">
                  {r.fixed && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">Fixed</span>}
                  {r.blocked && <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-800">Blocked</span>}
                  {!r.fixed && !r.blocked && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">Allowed</span>}
                  {r.mrpRelevant === false && <span className="text-[11px] text-slate-500">not used by planning</span>}
                </td>
                <td className="text-xs text-slate-600">{r.notes}</td>
                <td>{canEdit && <div className="flex flex-wrap justify-end gap-1.5">
                  <button className={`${btn} btn-secondary`} onClick={() => startEdit(r)}>Edit</button>
                  {r.blocked
                    ? <button className={`${btn} btn-secondary`} disabled={busy} onClick={() => patch(r, { blocked: false }, `${r.supplier?.name} unblocked.`)}>Unblock</button>
                    : <button className={`${btn} btn-secondary`} disabled={busy} onClick={() => patch(r, { blocked: true, fixed: false }, `${r.supplier?.name} blocked for ${r.product?.sku}.`)}>Block</button>}
                  <button className={`${btn} btn-danger`} disabled={busy} onClick={() => remove(r)}>Remove</button>
                </div>}</td>
              </tr>))}
            {!shown.length && <tr><td colSpan={6} className="p-8 text-center text-sm text-slate-400">No source list entries. Products without one can be bought from any supplier.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
