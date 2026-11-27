'use client';

import Link from 'next/link';
import CustomerModal from '@/components/modals/CustomerModal';
import { PageHeader, Alert } from '@/components/ui';
import { useCallback, useEffect, useState } from 'react';
import LineageDrawer from '@/components/common/LineageDrawer';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import { PdfPreview, type PdfRequest } from '@/components/workspace/PdfPreview';
import { pdfUrl } from '@/components/workspace/PdfButton';
import { useUrlTab } from '@/components/workspace/useUrlTab';

const field = 'input';
const btn = 'btn btn-sm';
const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`;

async function api(url: string, method = 'GET', body?: any) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

type Tab = 'PI' | 'PICK' | 'DC' | 'INV' | 'COMPANY' | 'CUSTOMERS';
const status = (s?: string) => ({ NOT_GENERATED: 'bg-slate-100 text-slate-600', JSON_GENERATED: 'bg-amber-100 text-amber-800', REGISTERED: 'bg-emerald-100 text-emerald-800', GENERATED: 'bg-emerald-100 text-emerald-800' } as Record<string, string>)[s || 'NOT_GENERATED'];

export default function DispatchPage() {
  const [tab, setTab] = useState<Tab>('PI');
  useUrlTab(['PI', 'PICK', 'DC', 'INV', 'COMPANY', 'CUSTOMERS'] as Tab[], setTab);
  const [orders, setOrders] = useState<any[]>([]);
  const [pis, setPis] = useState<any[]>([]);
  const [dcs, setDcs] = useState<any[]>([]);
  const [picks, setPicks] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pdf, setPdf] = useState<PdfRequest | null>(null);

  const [soId, setSoId] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({}); // quantity to dispatch now, by product
  const [advance, setAdvance] = useState('');
  const [dc, setDc] = useState({ transporterName: '', vehicleNo: '', lrNo: '', reason: 'SUPPLY' });
  const [company, setCompany] = useState<any>({ bank: {} });
  const [customers, setCustomers] = useState<any[]>([]);
  const [cust, setCust] = useState<any | null>(null);
  const [ewayFor, setEwayFor] = useState<any | null>(null);
  const [eway, setEway] = useState({ distance: '', vehicle: '', transporter: '', transporterId: '', docNo: '' });
  const [recordFor, setRecordFor] = useState<{ inv: any; kind: 'irn' | 'eway' } | null>(null);
  const [rec, setRec] = useState({ irn: '', ackNo: '', signedQr: '', number: '', validUpto: '' });

  const load = useCallback(async () => {
    const get = (u: string) => api(u).then(d => (Array.isArray(d) ? d : [])).catch(() => []);
    get('/api/customers').then(setCustomers);
    get('/api/pick-lists').then(setPicks);
    const [o, p, d, i, c] = await Promise.all([get('/api/sales-orders'), get('/api/proforma'), get('/api/delivery-challans'), get('/api/dispatch/invoices'), api('/api/settings/company').catch(() => ({}))]);
    setOrders(o.filter((x: any) => ['APPROVED', 'IN_FULFILLMENT', 'FULFILLED'].includes(x.status)));
    setPis(p); setDcs(d); setInvoices(i); setCompany({ bank: {}, ...c });
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); await load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };

  const download = async (url: string, filename: string) => {
    setMsg(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not generate the file');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await res.blob()); a.download = filename; a.click();
      setMsg({ ok: true, text: `${filename} downloaded. Upload it on the NIC portal, then record the response here.` }); await load();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };

  const printInvoice = (i: any) => setPdf({ url: pdfUrl.invoice(i._id), title: `Tax invoice ${i.invoiceNumber}` });
  const printPi = (p: any) => setPdf({ url: pdfUrl.print('proforma', p._id), title: `Proforma ${p.number}` });
  const printDc = (d: any) => setPdf({ url: pdfUrl.challan(d._id), title: `Delivery challan ${d.number} (3 copies)` });

  const tabs: [Tab, string][] = [['PI', 'Proforma invoices'], ['PICK', 'Pick lists'], ['DC', 'Delivery challans'], ['INV', 'Tax invoices & e-way bill'], ['CUSTOMERS', 'Customer GST details'], ['COMPANY', 'Company profile']];
  const orderSelect = (
    <select className={field} value={soId} onChange={e => { setSoId(e.target.value); const o = orders.find(x => x._id === e.target.value); setQty(Object.fromEntries((o?.items || []).map((i: any) => [String(i.product?._id || i.product), String(Math.max(0, (i.quantity || 0) - (i.dispatchedQty || 0)))]))); }}>
      <option value="">Sales order…</option>{orders.map(o => <option key={o._id} value={o._id}>{o.soNumber} · {o.customerName} · {inr(o.totalAmount)}{o.taxInvoiceStatus === 'INVOICED' ? ' (invoiced)' : o.taxInvoiceStatus === 'PARTIAL' ? ' (partly invoiced)' : ''}{o.status === 'IN_FULFILLMENT' ? ' · part dispatched' : o.status === 'FULFILLED' ? ' · fully dispatched' : ''}</option>)}
    </select>
  );

  return (
    <div className="ui-page">
      <style>{`@media print { body * { visibility: hidden; } .print-root, .print-root * { visibility: visible; } .print-root { position: absolute; left: 0; top: 0; width: 100%; } .break-after-page { break-after: page; } }`}</style>
      <div className="print:hidden space-y-6">
        <PageHeader title="Dispatch &amp; GST Documents" subtitle="Proforma invoice, Rule 55 delivery challan, GST tax invoice, and NIC e-invoice / e-way bill payloads." />
        <div className="flex flex-wrap gap-2">{tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`${tab === k ? 'tab tab-active' : 'tab'}`}>{l}</button>)}</div>
        {msg && <Alert ok={msg.ok}>{msg.text}</Alert>}

        {tab === 'PI' && <>
          <div className="grid gap-3 card md:grid-cols-[1fr_200px_auto]">
            {orderSelect}<input type="number" min="0" className={field} placeholder="Advance requested (₹)" value={advance} onChange={e => setAdvance(e.target.value)} />
            <button disabled={!soId} className={`${btn} btn-primary disabled:opacity-40`} onClick={() => run(async () => { await api('/api/proforma', 'POST', { salesOrderId: soId, advanceRequested: advance }); }, 'Proforma invoice issued.')}>Issue proforma</button>
          </div>
          {pis.map(p => (
            <div key={p._id} className="flex flex-wrap items-center justify-between gap-2 card">
              <div><Link href={`/dashboard/dispatch/proformas/${p._id}`} className="font-bold text-[var(--erp-accent)] hover:underline">{p.number}</Link> <span className="ml-2 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold">{p.status}</span><div className="text-xs text-slate-500">{p.customerName} · SO {p.soNumber} · {inr(p.totalAmount)}{p.invoiceNumber ? ` → ${p.invoiceNumber}` : ''}</div></div>
              <div className="space-x-2"><span className="inline-flex align-middle"><AttachmentDrawer entityType="PROFORMA" entityId={p._id} label="Files" /></span><button className={`${btn} btn-secondary`} onClick={() => printPi(p)}>View / print</button>
                {p.status === 'ISSUED' && <button className={`${btn} btn-success`} onClick={() => run(async () => { await api(`/api/proforma/${p._id}`, 'PATCH', { action: 'convert' }); }, 'Converted to a final tax invoice.')}>Convert to tax invoice</button>}</div>
            </div>))}
          {!pis.length && <p className="empty">No proforma invoices yet.</p>}
        </>}

        {tab === 'PICK' && <>
          <div className="grid gap-3 card md:grid-cols-[1fr_auto]">
            {orderSelect}
            <button disabled={!soId} className={`${btn} btn-primary disabled:opacity-40`} onClick={() => run(async () => { await api('/api/pick-lists', 'POST', { salesOrderId: soId }); }, 'Pick list made. Open it to confirm what was picked.')}>Make pick list</button>
          </div>
          <p className="text-xs text-slate-500">{company.usePickLists === false ? 'Pick lists are optional: they are turned off in the Company profile, so challans take stock directly (reserved batches first, then the earliest expiry).' : 'A delivery challan can only go out for goods that have been picked and confirmed here.'}</p>
          {picks.map(p => {
            const planned = (p.lines || []).reduce((a: number, l: any) => a + l.quantity, 0), got = (p.lines || []).reduce((a: number, l: any) => a + (l.pickedQty || 0), 0), out = (p.lines || []).reduce((a: number, l: any) => a + (l.dispatchedQty || 0), 0);
            return (
              <div key={p._id} className="flex flex-wrap items-center justify-between gap-2 card">
                <div><Link href={`/dashboard/dispatch/picks/${p._id}`} className="font-bold text-[var(--erp-accent)] hover:underline">{p.number}</Link> <span className="ml-2 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold">{p.status}</span>
                  <div className="text-xs text-slate-500">{p.customerName} · SO {p.soNumber} · planned {planned}{p.status !== 'OPEN' ? ` · picked ${got} · dispatched ${out}` : ''}</div></div>
                <div className="flex gap-2"><LineageDrawer type="SALES_ORDER" id={p.salesOrder} label="Order chain" /><Link href={`/dashboard/dispatch/picks/${p._id}`} className={`${btn} btn-secondary`}>{p.status === 'OPEN' ? 'Pick' : 'Open'}</Link></div>
              </div>);
          })}
          {!picks.length && <p className="p-8 text-center text-sm text-slate-400">No pick lists yet.</p>}
        </>}

        {tab === 'DC' && <>
          <div className="grid gap-3 card md:grid-cols-3">
            <div className="md:col-span-3">{orderSelect}</div>
            <input className={field} placeholder="Transporter name" value={dc.transporterName} onChange={e => setDc({ ...dc, transporterName: e.target.value })} />
            <input className={field} placeholder="Vehicle registration no." value={dc.vehicleNo} onChange={e => setDc({ ...dc, vehicleNo: e.target.value })} />
            <input className={field} placeholder="LR no." value={dc.lrNo} onChange={e => setDc({ ...dc, lrNo: e.target.value })} />
            <select className={field} value={dc.reason} onChange={e => setDc({ ...dc, reason: e.target.value })}><option value="SUPPLY">Supply</option><option value="JOB_WORK">Job work</option><option value="SALE_ON_APPROVAL">Sale on approval</option><option value="OTHER">Other</option></select>
            {soId && (
              <div className="table-wrap md:col-span-3">
                <table className="text-left text-sm">
                  <thead><tr><th>Item</th><th className="text-right">Ordered</th><th className="text-right">Already dispatched</th><th className="text-right">Left</th><th>Dispatch now</th></tr></thead>
                  <tbody>{(orders.find(o => o._id === soId)?.items || []).map((i: any) => {
                    const pid = String(i.product?._id || i.product), left = Math.max(0, (i.quantity || 0) - (i.dispatchedQty || 0));
                    return (<tr key={i._id || pid}><td className="font-medium">{i.product?.name || pid}</td><td className="text-right num">{i.quantity}</td><td className="text-right num text-slate-500">{i.dispatchedQty || 0}</td><td className="text-right num font-semibold">{left}</td>
                      <td>{left > 0 ? <input type="number" min="0" max={left} step="any" className={`${field} !w-28`} value={qty[pid] ?? ''} onChange={e => setQty({ ...qty, [pid]: e.target.value })} /> : <span className="text-xs text-slate-400">all dispatched</span>}</td></tr>);
                  })}</tbody>
                </table>
              </div>)}
            <button disabled={!soId} className={`${btn} btn-primary disabled:opacity-40 md:col-span-2`} onClick={() => run(async () => { await api('/api/delivery-challans', 'POST', { salesOrderId: soId, ...dc, lines: Object.entries(qty).filter(([, q]) => Number(q) > 0).map(([product, q]) => ({ product, quantity: Number(q) })) }); }, 'Delivery challan created. Stock has been reduced by what was dispatched.')}>Create delivery challan</button>
          </div>
          {dcs.map(d => (
            <div key={d._id} className="flex flex-wrap items-center justify-between gap-2 card">
              <div><Link href={`/dashboard/dispatch/challans/${d._id}`} className="font-bold text-[var(--erp-accent)] hover:underline">{d.number}</Link> <span className="ml-2 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold">{d.status}</span><div className="text-xs text-slate-500">{d.customerName} · SO {d.soNumber} · {d.transporterName} · {d.vehicleNo} · LR {d.lrNo}</div>
                {d.stockShortfall?.length > 0 && <div className="mt-1 text-xs font-medium text-amber-700">Not found in stock when dispatched: {d.stockShortfall.map((x: any) => x.qty).join(', ')} unit(s). Check the stock records.</div>}</div>
              <div className="flex flex-wrap gap-2"><AttachmentDrawer entityType="DELIVERY_CHALLAN" entityId={d._id} /><LineageDrawer type="DELIVERY_CHALLAN" id={d._id} label="Chain" />
                {d.status === 'ISSUED' && <button className={`${btn} btn-secondary`} onClick={() => run(async () => { await api('/api/dispatch/invoices', 'POST', { salesOrderId: d.salesOrder, dcId: d._id }); }, `Tax invoice issued for ${d.number} and posted to accounts.`)}>Tax invoice for this challan</button>}
                {d.status === 'ISSUED' && <button className={`${btn} btn-secondary`} onClick={() => { const reason = window.prompt('Why is this challan being cancelled?'); if (reason) run(async () => { await api(`/api/delivery-challans/${d._id}/cancel`, 'POST', { reason }); }, `${d.number} cancelled. The goods are back in stock and can be dispatched again.`); }}>Cancel</button>}
                <button className={`${btn} btn-secondary`} onClick={() => printDc(d)}>View / print 3 copies</button></div>
            </div>))}
          {!dcs.length && <p className="empty">No delivery challans yet.</p>}
        </>}

        {tab === 'INV' && <>
          <div className="grid gap-3 card md:grid-cols-[1fr_auto]">
            {orderSelect}
            <button disabled={!soId} className={`${btn} btn-primary disabled:opacity-40`} onClick={() => run(async () => { await api('/api/dispatch/invoices', 'POST', { salesOrderId: soId }); }, 'Tax invoice issued for everything still to invoice, and posted to accounts.')}>Issue tax invoice for what is left</button>
          </div>
          {invoices.filter(i => i.parties).map(i => (
            <div key={i._id} className="space-y-2 card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><Link href={`/dashboard/dispatch/invoices/${i._id}`} className="font-bold text-[var(--erp-accent)] hover:underline">{i.invoiceNumber}</Link> <span className="ml-2 text-xs text-slate-500">{i.parties.buyer.name} · {inr(i.totalAmount)} · SO {i.soNumber}</span></div>
                <div className="flex gap-2"><AttachmentDrawer entityType="INVOICE" entityId={i._id} /><LineageDrawer type="INVOICE" id={i._id} label="Chain" /><button className={`${btn} btn-secondary`} onClick={() => printInvoice(i)}>View / print</button></div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-bold ${status(i.einvoiceStatus)}`}>E-invoice: {(i.einvoiceStatus || 'NOT_GENERATED').replace('_', ' ')}</span>
                <button className={`${btn} btn-primary`} onClick={() => download(`/api/dispatch/invoices/${i._id}?doc=einvoice`, `einvoice-${i.invoiceNumber}.json`)}>Generate IRN JSON</button>
                {i.einvoiceStatus === 'JSON_GENERATED' && <button className={`${btn} btn-secondary`} onClick={() => { setRecordFor({ inv: i, kind: 'irn' }); setRec({ ...rec, irn: i.irnHash || '' }); }}>Record IRN from portal</button>}
                <span className={`rounded-full px-2 py-0.5 font-bold ${status(i.ewayStatus)}`}>E-way bill: {(i.ewayStatus || 'NOT_GENERATED').replace('_', ' ')}{i.ewayBillNumber ? ` · ${i.ewayBillNumber}` : ''}</span>
                <button className={`${btn} btn-primary`} onClick={() => { setEwayFor(i); setEway({ distance: String(i.transport?.distanceKm ?? ''), vehicle: i.transport?.vehicleNo || '', transporter: i.transport?.transporterName || '', transporterId: i.transport?.transporterId || '', docNo: i.transport?.docNo || '' }); }}>Generate E-way bill JSON</button>
                {i.ewayStatus === 'JSON_GENERATED' && <button className={`${btn} btn-secondary`} onClick={() => setRecordFor({ inv: i, kind: 'eway' })}>Record E-way bill no.</button>}
              </div>
            </div>))}
          {!invoices.length && <p className="empty">No tax invoices yet.</p>}
          <p className="text-xs text-slate-500">The JSON follows NIC schemas for upload on the e-invoice (IRP) and e-way bill portals. IRN acknowledgement, signed QR and the e-way bill number are issued by those portals; record them here after upload.</p>
        </>}

        {tab === 'CUSTOMERS' && (
          <div className="space-y-3">
            <button className={`${btn} btn-primary`} onClick={() => setCust({ name: '', billingAddress: '', gstin: '', city: '', pincode: '' })}>New customer</button>
            {customers.map(c => (
              <div key={c._id} className="flex flex-wrap items-center justify-between gap-2 card">
                <div><Link href={`/dashboard/customers/${c._id}`} className="font-bold text-[var(--erp-accent)] hover:underline">{c.name}</Link> <span className="text-xs text-slate-500">{c.code}</span><div className="text-xs text-slate-500">{c.gstin || 'No GSTIN'} · State {c.stateCode || '—'} · {c.city || 'no city'} {c.pincode || ''}</div>
                  <div className="text-xs text-slate-500">{String(c.accountGroup || 'SOLD_TO').replace(/_/g, ' ')} · {(c.salesAreas || []).length} sales area(s){c.creditLimit ? ` · credit limit ₹${Number(c.creditLimit).toLocaleString('en-IN')}` : ''}{c.isActive === false ? ' · inactive' : ''}</div></div>
                <button className={`${btn} btn-secondary`} onClick={() => setCust(c)}>Edit</button>
              </div>))}
            <CustomerModal isOpen={!!cust} customer={cust?._id ? cust : undefined} onClose={() => setCust(null)} onSuccess={() => { setMsg({ ok: true, text: 'Customer saved.' }); load(); }} />
          </div>
        )}

        {tab === 'COMPANY' && (
          <form className="grid max-w-3xl gap-3 card md:grid-cols-2" onSubmit={e => { e.preventDefault(); run(async () => { await api('/api/settings/company', 'PUT', company); }, 'Company profile saved.'); }}>
            {([['legalName', 'Legal name'], ['gstin', 'GSTIN'], ['pan', 'PAN'], ['address1', 'Address line 1'], ['address2', 'Address line 2'], ['city', 'City'], ['pincode', 'Pincode'], ['phone', 'Phone'], ['email', 'Email']] as const).map(([k, l]) => (
              <label key={k} className="lbl">{l}<input className={field} value={company[k] || ''} onChange={e => setCompany({ ...company, [k]: e.target.value })} /></label>))}
            {([['name', 'Bank name'], ['accountNo', 'Account no.'], ['ifsc', 'IFSC'], ['branch', 'Branch']] as const).map(([k, l]) => (
              <label key={k} className="lbl">{l}<input className={field} value={company.bank?.[k] || ''} onChange={e => setCompany({ ...company, bank: { ...company.bank, [k]: e.target.value } })} /></label>))}
            <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={company.usePickLists !== false} onChange={e => setCompany({ ...company, usePickLists: e.target.checked })} />Use pick lists before dispatch (goods must be picked and confirmed before a delivery challan; untick to make challans straight from the order)</label>
            <label className="text-xs font-semibold md:col-span-2">Invoice terms<textarea className={field} value={company.invoiceTerms || ''} onChange={e => setCompany({ ...company, invoiceTerms: e.target.value })} /></label>
            <button className={`${btn} btn-primary md:col-span-2`}>Save company profile</button>
          </form>
        )}
      </div>

      {pdf && <PdfPreview req={pdf} onClose={() => setPdf(null)} />}

      {ewayFor && (
        <div className="modal-overlay print:hidden">
          <form className="w-full max-w-md space-y-3 modal" onSubmit={e => { e.preventDefault(); const q = new URLSearchParams({ doc: 'eway', distance: eway.distance, vehicle: eway.vehicle, transporter: eway.transporter, transporterId: eway.transporterId, docNo: eway.docNo }); download(`/api/dispatch/invoices/${ewayFor._id}?${q}`, `ewaybill-${ewayFor.invoiceNumber}.json`); setEwayFor(null); }}>
            <h2 className="text-lg font-bold">E-way bill details · {ewayFor.invoiceNumber}</h2>
            <input required type="number" min="0" className={field} placeholder="Approx. distance (km)" value={eway.distance} onChange={e => setEway({ ...eway, distance: e.target.value })} />
            <input className={field} placeholder="Vehicle no. (or transporter ID below)" value={eway.vehicle} onChange={e => setEway({ ...eway, vehicle: e.target.value })} />
            <input className={field} placeholder="Transporter name" value={eway.transporter} onChange={e => setEway({ ...eway, transporter: e.target.value })} />
            <input className={field} placeholder="Transporter GSTIN / ID" value={eway.transporterId} onChange={e => setEway({ ...eway, transporterId: e.target.value })} />
            <input className={field} placeholder="Transport doc / LR no." value={eway.docNo} onChange={e => setEway({ ...eway, docNo: e.target.value })} />
            <div className="flex justify-end gap-2"><button type="button" className={`${btn} btn-ghost`} onClick={() => setEwayFor(null)}>Cancel</button><button className={`${btn} btn-primary`}>Download JSON</button></div>
          </form>
        </div>
      )}

      {recordFor && (
        <div className="modal-overlay print:hidden">
          <form className="w-full max-w-md space-y-3 modal" onSubmit={e => { e.preventDefault(); run(async () => { await api(`/api/dispatch/invoices/${recordFor.inv._id}`, 'PATCH', recordFor.kind === 'irn' ? { action: 'record-irn', irn: rec.irn, ackNo: rec.ackNo, signedQr: rec.signedQr } : { action: 'record-eway', number: rec.number, validUpto: rec.validUpto }); setRecordFor(null); }, 'Portal response recorded.'); }}>
            <h2 className="text-lg font-bold">{recordFor.kind === 'irn' ? 'Record IRP response' : 'Record e-way bill'} · {recordFor.inv.invoiceNumber}</h2>
            {recordFor.kind === 'irn' ? <>
              <input required className={field} placeholder="IRN (64 hex characters)" value={rec.irn} onChange={e => setRec({ ...rec, irn: e.target.value })} />
              <input className={field} placeholder="Acknowledgement no." value={rec.ackNo} onChange={e => setRec({ ...rec, ackNo: e.target.value })} />
              <textarea className={field} placeholder="Signed QR code data" value={rec.signedQr} onChange={e => setRec({ ...rec, signedQr: e.target.value })} />
            </> : <>
              <input required className={field} placeholder="E-way bill no. (12 digits)" value={rec.number} onChange={e => setRec({ ...rec, number: e.target.value })} />
              <input type="date" className={field} value={rec.validUpto} onChange={e => setRec({ ...rec, validUpto: e.target.value })} />
            </>}
            <div className="flex justify-end gap-2"><button type="button" className={`${btn} btn-ghost`} onClick={() => setRecordFor(null)}>Cancel</button><button className={`${btn} btn-primary`}>Save</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
