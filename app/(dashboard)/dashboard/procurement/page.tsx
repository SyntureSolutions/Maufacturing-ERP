'use client';

import { Alert } from '@/components/ui';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import Link from 'next/link';
import LineageDrawer from '@/components/common/LineageDrawer';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUrlTab } from '@/components/workspace/useUrlTab';

type Tab = 'INDENTS' | 'RFQ' | 'MRN';

const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const badge = (s: string) => ({
  PENDING: 'bg-amber-100 text-amber-800', APPROVED: 'bg-emerald-100 text-emerald-800', REJECTED: 'bg-red-100 text-red-800',
  RFQ_CREATED: 'bg-blue-100 text-blue-800', OPEN: 'bg-blue-100 text-blue-800', AWARDED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-slate-200 text-slate-600', RESERVED: 'bg-amber-100 text-amber-800', ISSUED: 'bg-emerald-100 text-emerald-800',
  PARTIALLY_ISSUED: 'bg-blue-100 text-blue-800', DRAFT: 'bg-slate-100 text-slate-700',
} as Record<string, string>)[s] || 'bg-slate-100 text-slate-700';

async function api(url: string, method: string, body?: any) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Total landed cost of a vendor quote for the RFQ items
function quoteTotal(rfq: any, quote: any) {
  const subtotal = rfq.items.reduce((sum: number, item: any) => {
    const price = quote.unitPrices.find((p: any) => String(p.product?._id || p.product) === String(item.product?._id || item.product))?.unitPrice || 0;
    return sum + price * item.quantity;
  }, 0);
  return subtotal * (1 + quote.gstPercent / 100) + quote.freight;
}

export default function ProcurementPage() {
  const [tab, setTab] = useState<Tab>('INDENTS');
  useUrlTab(['INDENTS', 'RFQ', 'MRN'] as Tab[], setTab);
  const [indents, setIndents] = useState<any[]>([]);
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [mrns, setMrns] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [newItem, setNewItem] = useState({ product: '', quantity: '', preferredSupplier: '' });
  const [selectedIndents, setSelectedIndents] = useState<string[]>([]);
  const [rfqVendors, setRfqVendors] = useState<string[]>([]);
  const [quoteRfq, setQuoteRfq] = useState<any | null>(null);
  const [quoteForm, setQuoteForm] = useState<any>({ supplier: '', prices: {}, freight: '0', gstPercent: '18', leadTimeDays: '', paymentTerms: '' });
  const [mrnWo, setMrnWo] = useState('');
  const [issueMrn, setIssueMrn] = useState<any | null>(null);
  const [scans, setScans] = useState<Record<string, string>>({});
  // ordering an approved requisition straight on a PO, line by line (the PO lines record which requisition lines they order)
  const [direct, setDirect] = useState<{ indent: any; supplier: string; lines: { lineNo: number; product: any; open: number; quantity: string; unitPrice: string; deliveryDate: string; use: boolean }[] } | null>(null);
  const openDirect = (indent: any) => setDirect({
    indent, supplier: String(indent.items.find((it: any) => it.preferredSupplier)?.preferredSupplier?._id || ''),
    lines: indent.items.filter((it: any) => it.lineNo && it.openQty > 0).map((it: any) => ({
      lineNo: it.lineNo, product: it.product, open: it.openQty, quantity: String(it.openQty),
      unitPrice: String(products.find(p => p._id === String(it.product?._id || it.product))?.purchasePrice ?? ''),
      deliveryDate: it.requiredBy ? String(it.requiredBy).slice(0, 10) : '', use: true,
    })),
  });
  const submitDirect = () => direct && run(async () => {
    const chosen = direct.lines.filter(l => l.use);
    if (!chosen.length) throw new Error('Choose at least one line.');
    const po = await api('/api/purchase', 'POST', {
      supplier: direct.supplier, notes: `Ordered from requisition ${direct.indent.number}`,
      items: chosen.map(l => ({ product: String(l.product?._id || l.product), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), deliveryDate: l.deliveryDate || undefined, sources: [{ indent: direct.indent._id, lineNo: l.lineNo, quantity: Number(l.quantity) }] })),
    });
    setDirect(null);
    return po;
  }, 'Purchase order raised from the requisition.');

  const load = useCallback(async () => {
    const get = (u: string) => fetch(u).then(r => (r.ok ? r.json() : [])).then(d => (Array.isArray(d) ? d : [])).catch(() => []);
    const [i, r, m, p, s, w] = await Promise.all([get('/api/purchase-indents'), get('/api/rfqs'), get('/api/mrn'), get('/api/products'), get('/api/suppliers'), get('/api/production')]);
    setIndents(i); setRfqs(r); setMrns(m); setProducts(p); setSuppliers(s); setWorkOrders(w);
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<any>, success: string) => {
    setError(''); setNotice('');
    try { await fn(); setNotice(success); await load(); } catch (e: any) { setError(e.message); }
  };

  const approvedIndents = useMemo(() => indents.filter(i => i.status === 'APPROVED'), [indents]);

  const openQuote = (rfq: any, supplier: string) => {
    const existing = rfq.quotes.find((q: any) => String(q.supplier?._id || q.supplier) === supplier);
    const prices: Record<string, string> = {};
    rfq.items.forEach((it: any) => {
      const pid = String(it.product?._id || it.product);
      prices[pid] = String(existing?.unitPrices.find((p: any) => String(p.product?._id || p.product) === pid)?.unitPrice ?? '');
    });
    setQuoteRfq(rfq);
    setQuoteForm({ supplier, prices, freight: String(existing?.freight ?? 0), gstPercent: String(existing?.gstPercent ?? 18), leadTimeDays: String(existing?.leadTimeDays ?? ''), paymentTerms: existing?.paymentTerms ?? '' });
  };

  const submitQuote = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api(`/api/rfqs/${quoteRfq._id}`, 'PATCH', {
        action: 'quote', supplier: quoteForm.supplier, freight: quoteForm.freight, gstPercent: quoteForm.gstPercent,
        leadTimeDays: quoteForm.leadTimeDays, paymentTerms: quoteForm.paymentTerms,
        unitPrices: Object.entries(quoteForm.prices).filter(([, v]) => v !== '').map(([product, unitPrice]) => ({ product, unitPrice: Number(unitPrice) })),
      });
      setQuoteRfq(null);
    }, 'Vendor quotation recorded.');
  };

  const field = 'input';
  const btn = 'btn btn-sm';

  return (
    <div className="ui-page">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Procurement Planning</h1>
        <p className="text-sm text-slate-500">Purchase indents, multi-vendor RFQ with rate comparison, and material requisition notes.</p>
      </div>

      <div className="flex gap-2">
        {([['INDENTS', 'Purchase Indents'], ['RFQ', 'RFQ & Rate Comparison'], ['MRN', 'Material Requisitions']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`${tab === k ? 'tab tab-active' : 'tab'}`}>{label}</button>
        ))}
      </div>

      {notice && <Alert ok>{notice}</Alert>}
      {error && <Alert ok={false}>{error}</Alert>}

      {tab === 'INDENTS' && (
        <div className="space-y-4">
          <form className="grid grid-cols-1 gap-3 card md:grid-cols-4" onSubmit={e => {
            e.preventDefault();
            run(async () => { await api('/api/purchase-indents', 'POST', { items: [{ ...newItem, quantity: Number(newItem.quantity) }] }); setNewItem({ product: '', quantity: '', preferredSupplier: '' }); }, 'Indent raised.');
          }}>
            <select required className={field} value={newItem.product} onChange={e => setNewItem({ ...newItem, product: e.target.value })}>
              <option value="">Material…</option>{products.map(p => <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>)}
            </select>
            <input required type="number" min="0.0001" step="any" placeholder="Quantity" className={field} value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: e.target.value })} />
            <select className={field} value={newItem.preferredSupplier} onChange={e => setNewItem({ ...newItem, preferredSupplier: e.target.value })}>
              <option value="">Preferred vendor (optional)</option>{suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
            <button className={`${btn} btn-primary`}>Raise indent</button>
          </form>

          <div className="table-wrap">
            <table className="w-full text-left text-sm">
              <thead className=""><tr><th className="p-3"></th><th className="p-3">Indent</th><th className="p-3">Items</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead>
              <tbody>
                {indents.map(i => (
                  <tr key={i._id} className="border-t border-slate-100">
                    <td className="p-3">{i.status === 'APPROVED' && <input type="checkbox" checked={selectedIndents.includes(i._id)} onChange={e => setSelectedIndents(e.target.checked ? [...selectedIndents, i._id] : selectedIndents.filter(x => x !== i._id))} />}</td>
                    <td className="p-3 font-semibold"><Link href={`/dashboard/procurement/indents/${i._id}`} className="text-[var(--erp-accent)] hover:underline">{i.number}</Link><div className="text-xs font-normal text-slate-400">{i.source}</div></td>
                    <td className="p-3">{i.items.map((it: any, n: number) => (
                      <div key={n}>{it.lineNo ? <span className="mr-1 text-xs text-slate-400">{it.lineNo}</span> : null}{it.product?.name} × {it.quantity}{it.preferredSupplier ? ` · ${it.preferredSupplier.name}` : ''}
                        {it.requiredBy && <span className="text-xs text-slate-500"> · needed by {new Date(it.requiredBy).toLocaleDateString('en-IN')}</span>}
                        {it.orderedQty > 0 && <span className={`ml-1 text-xs font-semibold ${it.openQty > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>· ordered {it.orderedQty}, open {it.openQty}</span>}</div>))}</td>
                    <td className="p-3"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge(i.status)}`}>{i.status.replace('_', ' ')}</span></td>
                    <td className="space-x-2 p-3">
                      <span className="inline-flex gap-1.5 align-middle"><AttachmentDrawer entityType="PURCHASE_INDENT" entityId={i._id} label="Files" /><LineageDrawer type="PURCHASE_INDENT" id={i._id} label="Chain" /></span>
                      {i.status === 'APPROVED' && i.items.some((it: any) => it.lineNo && it.openQty > 0) &&<button className={`${btn} btn-primary`} onClick={() => openDirect(i)}>Order on a PO</button>}
                      {i.status === 'PENDING' && <>
                        <button className={`${btn} btn-success`} onClick={() => run(() => api(`/api/purchase-indents/${i._id}`, 'PATCH', { action: 'approve' }), 'Indent approved.')}>Approve</button>
                        <button className={`${btn} btn-danger`} onClick={() => run(() => api(`/api/purchase-indents/${i._id}`, 'PATCH', { action: 'reject' }), 'Indent rejected.')}>Reject</button>
                      </>}
                    </td>
                  </tr>
                ))}
                {!indents.length && <tr><td colSpan={5} className="p-8 text-center text-sm text-slate-400">No indents yet.</td></tr>}
              </tbody>
            </table>
          </div>

          {approvedIndents.length > 0 && (
            <div className="space-y-3 card">
              <h2 className="font-bold text-slate-900">Convert {selectedIndents.length} selected indent(s) to RFQ</h2>
              <div className="flex flex-wrap gap-2">
                {suppliers.map(s => (
                  <label key={s._id} className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold">
                    <input type="checkbox" checked={rfqVendors.includes(s._id)} onChange={e => setRfqVendors(e.target.checked ? [...rfqVendors, s._id] : rfqVendors.filter(x => x !== s._id))} />{s.name}
                  </label>
                ))}
              </div>
              <button disabled={!selectedIndents.length || rfqVendors.length < 2} className={`${btn} btn-primary disabled:opacity-40`}
                onClick={() => run(async () => { await api('/api/rfqs', 'POST', { indentIds: selectedIndents, supplierIds: rfqVendors }); setSelectedIndents([]); setRfqVendors([]); setTab('RFQ'); }, 'RFQ created.')}>
                Create RFQ (min. 2 vendors)
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'RFQ' && (
        <div className="space-y-6">
          {rfqs.map(rfq => {
            const totals = rfq.quotes.map((q: any) => quoteTotal(rfq, q));
            const best = totals.length ? Math.min(...totals) : 0;
            return (
              <div key={rfq._id} className="space-y-3 card">
                <div className="flex items-center justify-between">
                  <div><Link href={`/dashboard/procurement/rfqs/${rfq._id}`} className="font-bold text-[var(--erp-accent)] hover:underline">{rfq.number}</Link> <span className={`ml-2 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge(rfq.status)}`}>{rfq.status}</span>
                    <div className="text-xs text-slate-500">{rfq.items.map((it: any) => `${it.product?.name} × ${it.quantity}`).join(' · ')}</div></div>
                  <div className="flex gap-2"><AttachmentDrawer entityType="RFQ" entityId={rfq._id} label="Vendor quotes" />{rfq.status === 'OPEN' && <button className={`${btn} btn-secondary`} onClick={() => run(() => api(`/api/rfqs/${rfq._id}`, 'PATCH', { action: 'cancel' }), 'RFQ cancelled.')}>Cancel RFQ</button>}</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className=""><tr>
                      <th className="p-2">Vendor</th>{rfq.items.map((it: any) => <th key={it.product?._id} className="p-2">{it.product?.sku} price</th>)}
                      <th className="p-2">Freight</th><th className="p-2">GST</th><th className="p-2">Lead time</th><th className="p-2">Terms</th><th className="p-2">Landed total</th><th className="p-2"></th>
                    </tr></thead>
                    <tbody>
                      {rfq.suppliers.map((s: any) => {
                        const q = rfq.quotes.find((x: any) => String(x.supplier?._id) === String(s._id));
                        const total = q ? quoteTotal(rfq, q) : 0;
                        return (
                          <tr key={s._id} className={`border-t border-slate-100 ${q && total === best ? 'bg-emerald-50' : ''}`}>
                            <td className="p-2 font-semibold">{s.name}</td>
                            {rfq.items.map((it: any) => <td key={it.product?._id} className="p-2">{q ? money(q.unitPrices.find((p: any) => String(p.product?._id || p.product) === String(it.product?._id))?.unitPrice || 0) : '—'}</td>)}
                            <td className="p-2">{q ? money(q.freight) : '—'}</td><td className="p-2">{q ? `${q.gstPercent}%` : '—'}</td>
                            <td className="p-2">{q?.leadTimeDays ? `${q.leadTimeDays} d` : '—'}</td><td className="p-2">{q?.paymentTerms || '—'}</td>
                            <td className="p-2 font-bold">{q ? money(total) : 'Awaiting quote'}{q && total === best && totals.length > 1 && <span className="ml-1 text-xs text-emerald-700">lowest</span>}</td>
                            <td className="space-x-2 p-2">
                              {rfq.status === 'OPEN' && <button className={`${btn} btn-secondary`} onClick={() => openQuote(rfq, s._id)}>{q ? 'Edit quote' : 'Enter quote'}</button>}
                              {rfq.status === 'OPEN' && q && <button className={`${btn} btn-success`} onClick={() => run(() => api(`/api/rfqs/${rfq._id}`, 'PATCH', { action: 'award', supplier: s._id }), 'Awarded — draft PO created.')}>Award</button>}
                              {String(rfq.awardedSupplier) === String(s._id) && <span className="text-xs font-bold text-emerald-700">Awarded</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {!rfqs.length && <p className="empty">No RFQs yet. Approve indents and convert them from the Indents tab.</p>}
        </div>
      )}

      {tab === 'MRN' && (
        <div className="space-y-4">
          <form className="flex gap-3 card" onSubmit={e => { e.preventDefault(); run(async () => { await api('/api/mrn', 'POST', { workOrderId: mrnWo }); setMrnWo(''); }, 'MRN created and stock reserved.'); }}>
            <select required className={field} value={mrnWo} onChange={e => setMrnWo(e.target.value)}>
              <option value="">Work order…</option>{workOrders.filter(w => !['COMPLETED', 'CANCELLED'].includes(w.status)).map(w => <option key={w._id} value={w._id}>{w.woNumber} · {w.product?.name} × {w.quantity}</option>)}
            </select>
            <button className={`${btn} whitespace-nowrap btn-primary`}>Create MRN & reserve stock</button>
          </form>
          {mrns.map(m => (
            <div key={m._id} className="space-y-2 card">
              <div className="flex items-center justify-between">
                <div><span className="font-bold">{m.number}</span> <span className={`ml-2 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge(m.status)}`}>{m.status.replace('_', ' ')}</span>
                  {m.shortfall && <span className="ml-2 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-700">Shortfall</span>}
                  <div className="text-xs text-slate-500">{m.workOrder?.woNumber}</div></div>
                <div className="space-x-2">
                  <span className="inline-flex align-middle"><AttachmentDrawer entityType="MRN" entityId={m._id} label="Files" /></span>
                  {m.status === 'RESERVED' && <>
                    <button className={`${btn} btn-success`} onClick={() => { setScans({}); setIssueMrn(m); }}>Issue from store</button>
                    <button className={`${btn} btn-danger`} onClick={() => run(() => api(`/api/mrn/${m._id}`, 'PATCH', { action: 'cancel' }), 'MRN cancelled, reservation released.')}>Cancel</button>
                  </>}
                  {m.shortfall && m.status !== 'CANCELLED' && <button className={`${btn} btn-warn`} onClick={() => run(() => api('/api/purchase-indents', 'POST', { source: 'MRN_SHORTFALL', remarks: `Shortfall for ${m.number}`, items: m.items.filter((i: any) => i.reservedQty < i.requiredQty).map((i: any) => ({ product: i.product._id, quantity: i.requiredQty - i.reservedQty })) }), 'Shortfall indent raised.')}>Raise shortfall indent</button>}
                </div>
              </div>
              <table className="w-full text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-1">Material</th><th>Required</th><th>Reserved</th><th>Issued</th></tr></thead>
                <tbody>{m.items.map((i: any, n: number) => <tr key={n} className="border-t border-slate-100"><td className="py-1">{i.product?.name}</td><td>{i.requiredQty} {i.uom}</td><td className={i.reservedQty < i.requiredQty ? 'font-bold text-red-600' : ''}>{i.reservedQty}</td><td>{i.issuedQty}</td></tr>)}</tbody></table>
            </div>
          ))}
          {!mrns.length && <p className="empty">No material requisitions yet.</p>}
        </div>
      )}

      {issueMrn && (
        <div className="modal-overlay">
          <form className="w-full max-w-md space-y-3 modal" onSubmit={e => { e.preventDefault(); run(async () => { await api(`/api/mrn/${issueMrn._id}`, 'PATCH', { action: 'issue', scans: Object.values(scans) }); setIssueMrn(null); }, 'Material issued from store.'); }}>
            <h2 className="text-lg font-bold">Store issue slip · {issueMrn.number}</h2>
            <p className="text-xs text-slate-500">Scan the barcode (or type the SKU) of each item to confirm the physical hand-over.</p>
            {issueMrn.items.filter((i: any) => i.reservedQty - i.issuedQty > 0).map((i: any) => (
              <label key={i.product?._id} className="block text-xs font-semibold">{i.product?.name} — {i.reservedQty - i.issuedQty} {i.uom} <span className="font-normal text-slate-400">({i.product?.sku})</span>
                <input required autoComplete="off" className={field} placeholder="Scan barcode / SKU" value={scans[i.product?._id] || ''} onChange={e => setScans({ ...scans, [i.product?._id]: e.target.value })} /></label>))}
            <div className="flex justify-end gap-2"><button type="button" className={`${btn} btn-ghost`} onClick={() => setIssueMrn(null)}>Cancel</button><button className={`${btn} btn-success`}>Confirm issue</button></div>
          </form>
        </div>
      )}

      {quoteRfq && (
        <div className="modal-overlay">
          <form onSubmit={submitQuote} className="w-full max-w-lg space-y-3 modal">
            <h2 className="text-lg font-bold">Vendor quotation · {quoteRfq.number}</h2>
            {quoteRfq.items.map((it: any) => {
              const pid = String(it.product?._id);
              return <label key={pid} className="block text-sm font-semibold">{it.product?.name} — unit price (qty {it.quantity})
                <input required type="number" min="0" step="any" className={field} value={quoteForm.prices[pid] ?? ''} onChange={e => setQuoteForm({ ...quoteForm, prices: { ...quoteForm.prices, [pid]: e.target.value } })} /></label>;
            })}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-semibold">Freight<input type="number" min="0" className={field} value={quoteForm.freight} onChange={e => setQuoteForm({ ...quoteForm, freight: e.target.value })} /></label>
              <label className="text-sm font-semibold">GST %<input type="number" min="0" className={field} value={quoteForm.gstPercent} onChange={e => setQuoteForm({ ...quoteForm, gstPercent: e.target.value })} /></label>
              <label className="text-sm font-semibold">Lead time (days)<input type="number" min="0" className={field} value={quoteForm.leadTimeDays} onChange={e => setQuoteForm({ ...quoteForm, leadTimeDays: e.target.value })} /></label>
              <label className="text-sm font-semibold">Payment terms<input className={field} value={quoteForm.paymentTerms} onChange={e => setQuoteForm({ ...quoteForm, paymentTerms: e.target.value })} /></label>
            </div>
            <div className="flex justify-end gap-2"><button type="button" className={`${btn} btn-ghost`} onClick={() => setQuoteRfq(null)}>Cancel</button><button className={`${btn} btn-primary`}>Save quotation</button></div>
          </form>
        </div>
      )}
      {direct && (
        <div className="modal-overlay">
          <div className="w-full max-w-3xl space-y-3 modal">
            <h2 className="text-lg font-bold">Order {direct.indent.number} on a purchase order</h2>
            <p className="text-sm text-slate-500">Each PO line records the requisition line it orders. Only the quantity still open can be ordered; the product&apos;s source list decides which suppliers are allowed.</p>
            <label className="lbl">Supplier<select className="input" value={direct.supplier} onChange={e => setDirect({ ...direct, supplier: e.target.value })}>
              <option value="">Choose a supplier…</option>{suppliers.map((s: any) => <option key={s._id} value={s._id}>{s.name} ({s.code})</option>)}</select></label>
            <div className="table-wrap"><table className="text-left text-sm"><thead><tr><th /><th>Line</th><th>Item</th><th className="text-right">Open</th><th>Quantity</th><th>Unit price</th><th>Delivery date</th></tr></thead>
              <tbody>{direct.lines.map((l, n) => {
                const upd = (patch: any) => setDirect({ ...direct, lines: direct.lines.map((x, m) => (m === n ? { ...x, ...patch } : x)) });
                return (
                  <tr key={l.lineNo}><td><input type="checkbox" checked={l.use} onChange={e => upd({ use: e.target.checked })} /></td>
                    <td className="num">{l.lineNo}</td><td>{l.product?.name}</td><td className="text-right num">{l.open}</td>
                    <td><input type="number" min="0" step="any" max={l.open} className="input !w-24" value={l.quantity} onChange={e => upd({ quantity: e.target.value })} /></td>
                    <td><input type="number" min="0" step="any" className="input !w-28" value={l.unitPrice} onChange={e => upd({ unitPrice: e.target.value })} /></td>
                    <td><input type="date" className="input !w-40" value={l.deliveryDate} onChange={e => upd({ deliveryDate: e.target.value })} /></td></tr>);
              })}</tbody></table></div>
            <div className="flex justify-end gap-2"><button className={`${btn} btn-ghost`} onClick={() => setDirect(null)}>Cancel</button><button className={`${btn} btn-primary`} disabled={!direct.supplier} onClick={submitDirect}>Raise PO</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
