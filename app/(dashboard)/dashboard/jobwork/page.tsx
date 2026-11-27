'use client';

import { PageHeader, Alert } from '@/components/ui';
import { useCallback, useEffect, useState } from 'react';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import LineageDrawer from '@/components/common/LineageDrawer';
import { PdfPreview, type PdfRequest } from '@/components/workspace/PdfPreview';
import { pdfUrl } from '@/components/workspace/PdfButton';
import { heldQty } from '@/lib/jobwork';
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

const STATUS_STYLE: Record<string, string> = { OVERDUE: 'bg-red-100 text-red-700', DUE_SOON: 'bg-amber-100 text-amber-800', ON_TRACK: 'bg-emerald-100 text-emerald-700', CLOSED: 'bg-slate-100 text-slate-600' };

export default function JobWorkPage() {
  const [tab, setTab] = useState<'OUT' | 'IN' | 'ITC'>('OUT');
  useUrlTab(['OUT', 'IN', 'ITC'] as const, setTab);
  const [jobs, setJobs] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [itc, setItc] = useState<any>({ rows: [], quarters: [], summary: {} });
  const [quarter, setQuarter] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pdf, setPdf] = useState<PdfRequest | null>(null);

  const [out, setOut] = useState<any>({ party: '', goodsType: 'INPUT', natureOfJob: '', vehicleNo: '', outputProduct: '', expectedOutputQty: '', items: [{ product: '', quantity: '' }] });
  const [inn, setInn] = useState<any>({ party: '', natureOfJob: '', serviceRate: '', gstRate: '18', items: [{ description: '', quantity: '', uom: 'pcs' }] });
  const [recv, setRecv] = useState<any | null>(null);
  const [inwardAction, setInwardAction] = useState<{ job: any; kind: 'process' | 'return'; qty: string; vehicle: string } | null>(null);

  const load = useCallback(async () => {
    const get = (u: string) => api(u).then(d => (Array.isArray(d) ? d : [])).catch(() => []);
    const [j, s, c, p, i] = await Promise.all([get('/api/jobwork'), get('/api/suppliers'), get('/api/customers'), get('/api/products'), api(`/api/jobwork/itc04${quarter ? `?quarter=${encodeURIComponent(quarter)}` : ''}`).catch(() => ({ rows: [], quarters: [], summary: {} }))]);
    setJobs(j); setSuppliers(s); setCustomers(c); setProducts(p); setItc(i);
  }, [quarter]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<void | string>, ok: string) => {
    setMsg(null);
    try { const custom = await fn(); setMsg({ ok: true, text: typeof custom === 'string' ? custom : ok }); await load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };

  const printOutward = (j: any) => setPdf({ url: pdfUrl.print('jobwork-challan', j._id), title: `Job work challan ${j.number}` });
  const printPo = (j: any) => setPdf({ url: pdfUrl.print('jobwork-po', j._id), title: `Job work PO ${j.poNumber}` });
  const printReturn = (j: any, r: any) => setPdf({ url: pdfUrl.print('jobwork-return', j._id, `challan=${encodeURIComponent(r.challanNo)}`), title: `Return challan ${r.challanNo}` });

  const outItems: any[] = out.items;

  return (
    <div className="ui-page">
      <style>{`@media print { body * { visibility: hidden; } .print-root, .print-root * { visibility: visible; } .print-root { position: absolute; left: 0; top: 0; width: 100%; } .break-after-page { break-after: page; } }`}</style>
      <div className="space-y-6 print:hidden">
        <PageHeader title="Job Work / Subcontracting" subtitle="Outward challans to subcontractors, customer material we process, and ITC-04 return tracking." />
        <div className="flex gap-2">{([['OUT', 'Outward (we outsource)'], ['IN', 'Inward (we process)'], ['ITC', 'ITC-04 compliance']] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`${tab === k ? 'tab tab-active' : 'tab'}`}>{l}</button>)}</div>
        {msg && <Alert ok={msg.ok}>{msg.text}</Alert>}

        {tab === 'OUT' && <>
          <form className="grid gap-3 card md:grid-cols-3" onSubmit={e => { e.preventDefault(); run(async () => { const r = await api('/api/jobwork', 'POST', { kind: 'OUTWARD', ...out }); setOut({ ...out, items: [{ product: '', quantity: '' }] }); if (r.pendingApproval) return r.message; }, 'Outward challan issued; stock deducted from stores.'); }}>
            <select required className={field} value={out.party} onChange={e => setOut({ ...out, party: e.target.value })}><option value="">Subcontractor…</option>{suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select>
            <select className={field} value={out.goodsType} onChange={e => setOut({ ...out, goodsType: e.target.value })}><option value="INPUT">Inputs (return in 1 year)</option><option value="CAPITAL">Capital goods (return in 3 years)</option></select>
            <input required className={field} placeholder="Nature of job (e.g. powder coating)" value={out.natureOfJob} onChange={e => setOut({ ...out, natureOfJob: e.target.value })} />
            {outItems.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_110px] gap-2 md:col-span-3">
                <select className={field} value={it.product} onChange={e => setOut({ ...out, items: outItems.map((x, n) => (n === i ? { ...x, product: e.target.value } : x)) })}><option value="">Material to send…</option>{products.map(p => <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>)}</select>
                <input type="number" min="0" step="any" placeholder="Qty" className={field} value={it.quantity} onChange={e => setOut({ ...out, items: outItems.map((x, n) => (n === i ? { ...x, quantity: e.target.value } : x)) })} />
              </div>))}
            <button type="button" className={`${btn} btn-secondary`} onClick={() => setOut({ ...out, items: [...outItems, { product: '', quantity: '' }] })}>Add item</button>
            <select className={field} value={out.outputProduct} onChange={e => setOut({ ...out, outputProduct: e.target.value })}><option value="">Expected SFG output (optional)…</option>{products.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select>
            <input type="number" min="0" placeholder="Expected output qty" className={field} value={out.expectedOutputQty} onChange={e => setOut({ ...out, expectedOutputQty: e.target.value })} />
            <input className={field} placeholder="Vehicle no." value={out.vehicleNo} onChange={e => setOut({ ...out, vehicleNo: e.target.value })} />
            <button className={`${btn} btn-primary md:col-span-3`}>Issue outward challan</button>
          </form>

          {jobs.filter(j => j.kind === 'OUTWARD').map(j => {
            const held = j.items.reduce((s: number, i: any) => s + heldQty(i), 0);
            return (
              <div key={j._id} className="space-y-2 card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><b>Challan {j.number}</b> <span className="ml-2 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold">{j.status}</span>
                    <div className="text-xs text-slate-500">{j.partyName} · {j.natureOfJob} · {j.goodsType} · due {j.dueDate ? new Date(j.dueDate).toLocaleDateString('en-IN') : '—'} · output received {j.outputReceivedQty}{j.expectedOutputQty ? ` / ${j.expectedOutputQty}` : ''}</div></div>
                  <div className="flex flex-wrap items-center gap-2"><AttachmentDrawer entityType="JOBWORK" entityId={j._id} /><button className={`${btn} btn-secondary`} onClick={() => printOutward(j)}>Print challan</button>
                    {j.poNumber ? <button className={`${btn} btn-secondary`} onClick={() => printPo(j)}>Print PO {j.poNumber}</button> : <button className={`${btn} btn-secondary`} onClick={() => { const c = window.prompt('Agreed processing charge per unit (₹)?'); if (c) run(async () => { const r = await api(`/api/jobwork/${j._id}/po`, 'POST', { processingCharge: Number(c) }); return `Purchase order ${r.poNumber} issued to ${r.partyName}.`; }, ''); }}>Issue PO to job worker</button>}
                    {j.status !== 'CLOSED' && <button className={`${btn} btn-success`} onClick={() => setRecv({ job: j, items: j.items.map((_: any, index: number) => ({ index, consumed: '', returned: '', scrap: '' })), outputQty: '', note: '' })}>Receive back</button>}
                    {j.status !== 'CLOSED' && <button className={`${btn} btn-danger`} onClick={() => { const reason = window.prompt('Reason to write off the quantity still held by the job worker?'); if (reason) run(async () => { await api(`/api/jobwork/${j._id}`, 'PATCH', { action: 'writeoff', reason }); }, 'Written off and closed.'); }}>Write off</button>}</div>
                </div>
                <table className="w-full text-left text-xs"><thead className="uppercase text-slate-500"><tr><th>Material</th><th>Sent</th><th>Consumed</th><th>Returned</th><th>Scrap</th><th>With job worker</th><th>Value</th></tr></thead>
                  <tbody>{j.items.map((i: any, n: number) => <tr key={n} className="border-t border-slate-100"><td className="py-1">{i.description}</td><td>{i.quantity}</td><td>{i.consumed}</td><td>{i.returned}</td><td>{i.scrap}</td><td className="font-bold">{heldQty(i)}</td><td>{inr(i.value)}</td></tr>)}</tbody></table>
                {j.poNumber && <div className="text-xs text-slate-600">PO <b>{j.poNumber}</b> · ₹{j.processingCharge}/unit + {j.poGstRate}% GST{j.poTerms ? ` · ${j.poTerms}` : ''}</div>}
                {(j.receipts || []).filter((r: any) => r.challanNo).length > 0 && <div className="text-xs text-slate-600">Received challans: {(j.receipts || []).filter((r: any) => r.challanNo).map((r: any) => `${r.challanNo} (${new Date(r.at).toLocaleDateString('en-IN')})`).join(', ')}</div>}
                {held === 0 && j.status === 'CLOSED' && <div className="text-xs font-semibold text-emerald-700">Reconciled.</div>}
              </div>);
          })}
        </>}

        {tab === 'IN' && <>
          <form className="grid gap-3 card md:grid-cols-3" onSubmit={e => { e.preventDefault(); run(async () => { await api('/api/jobwork', 'POST', { kind: 'INWARD', ...inn }); setInn({ ...inn, items: [{ description: '', quantity: '', uom: 'pcs' }] }); }, 'Customer material received into custody.'); }}>
            <select required className={field} value={inn.party} onChange={e => setInn({ ...inn, party: e.target.value })}><option value="">Customer…</option>{customers.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
            <input className={field} placeholder="Service (e.g. machining)" value={inn.natureOfJob} onChange={e => setInn({ ...inn, natureOfJob: e.target.value })} />
            <div className="grid grid-cols-2 gap-2"><input required type="number" min="0" step="any" className={field} placeholder="Charge / unit ₹" value={inn.serviceRate} onChange={e => setInn({ ...inn, serviceRate: e.target.value })} /><input type="number" min="0" className={field} placeholder="GST %" value={inn.gstRate} onChange={e => setInn({ ...inn, gstRate: e.target.value })} /></div>
            {inn.items.map((it: any, i: number) => (
              <div key={i} className="grid grid-cols-[1fr_110px_80px] gap-2 md:col-span-3">
                <input className={field} placeholder="Customer material description" value={it.description} onChange={e => setInn({ ...inn, items: inn.items.map((x: any, n: number) => (n === i ? { ...x, description: e.target.value } : x)) })} />
                <input type="number" min="0" step="any" className={field} placeholder="Qty" value={it.quantity} onChange={e => setInn({ ...inn, items: inn.items.map((x: any, n: number) => (n === i ? { ...x, quantity: e.target.value } : x)) })} />
                <input className={field} value={it.uom} onChange={e => setInn({ ...inn, items: inn.items.map((x: any, n: number) => (n === i ? { ...x, uom: e.target.value } : x)) })} />
              </div>))}
            <button type="button" className={`${btn} btn-secondary`} onClick={() => setInn({ ...inn, items: [...inn.items, { description: '', quantity: '', uom: 'pcs' }] })}>Add line</button>
            <button className={`${btn} btn-primary md:col-span-2`}>Receive customer material</button>
          </form>
          {jobs.filter(j => j.kind === 'INWARD').map(j => {
            const received = j.items.reduce((s: number, i: any) => s + i.quantity, 0);
            const returned = j.returns.reduce((s: number, r: any) => s + r.quantity, 0);
            return (
              <div key={j._id} className="space-y-2 card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><b>{j.number}</b> <span className="ml-2 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold">{j.status}</span>
                    <div className="text-xs text-slate-500">{j.partyName} · {j.natureOfJob} · {inr(j.serviceRate)}/unit + {j.gstRate}% GST · customer property, not valued</div></div>
                  <div className="flex flex-wrap items-center gap-2">
                    <AttachmentDrawer entityType="JOBWORK" entityId={j._id} />
                    {j.salesOrder ? <LineageDrawer type="SALES_ORDER" id={String(j.salesOrder)} label="Sales order chain" /> : <button className={`${btn} btn-secondary`} onClick={() => { const po = window.prompt("Customer's purchase order number?"); if (po) run(async () => { const r = await api(`/api/jobwork/${j._id}/sales-order`, 'POST', { customerPoNumber: po }); return `Sales order ${r.salesOrder.soNumber} prepared for ${j.number}.`; }, ''); }}>Prepare sales order</button>}
                    {j.status !== 'CLOSED' && <button className={`${btn} btn-secondary`} onClick={() => setInwardAction({ job: j, kind: 'process', qty: '', vehicle: '' })}>Log processing</button>}
                    {j.status !== 'CLOSED' && <button className={`${btn} btn-secondary`} onClick={() => setInwardAction({ job: j, kind: 'return', qty: '', vehicle: '' })}>Return challan</button>}
                    <button className={`${btn} btn-success`} onClick={() => run(async () => { await api(`/api/jobwork/${j._id}`, 'PATCH', { action: 'invoice' }); }, 'Service invoice issued and posted.')}>Service invoice</button>
                  </div>
                </div>
                {j.customerPoNumber && <div className="text-xs text-slate-600">Customer PO <b>{j.customerPoNumber}</b> · sales order prepared</div>}
                <div className="text-xs">Held in custody <b>{received - returned}</b> of {received} · processed {j.processedQty} · returned {returned} · invoiced {j.invoicedQty}{j.invoiceNumbers.length ? ` (${j.invoiceNumbers.join(', ')})` : ''}</div>
                {j.returns.map((r: any) => <div key={r.challanNo} className="flex items-center justify-between rounded-lg bg-slate-50 p-2 text-xs"><span>Return challan {r.challanNo} · {r.quantity} units · {r.vehicleNo}</span><button className={`${btn} btn-secondary`} onClick={() => printReturn(j, r)}>Print</button></div>)}
              </div>);
          })}
        </>}

        {tab === 'ITC' && <>
          <div className="grid gap-3 md:grid-cols-4">
            {[['Open challans', itc.summary.open], ['Overdue', itc.summary.overdue], ['Due within 60 days', itc.summary.dueSoon], ['Value with job workers', inr(itc.summary.outstandingValue)]].map(([l, v]) => (
              <div key={String(l)} className="card"><div className="text-xs font-semibold text-slate-500">{l}</div><div className="text-2xl font-extrabold">{v ?? 0}</div></div>))}
          </div>
          <select className={`${field} md:w-64`} value={quarter} onChange={e => setQuarter(e.target.value)}><option value="">All quarters</option>{itc.quarters.map((q: string) => <option key={q}>{q}</option>)}</select>
          <div className="table-wrap">
            <table className="w-full text-left text-xs"><thead className=""><tr><th className="p-2">Challan</th><th>Date</th><th>Quarter</th><th>Job worker</th><th>Goods</th><th>Description</th><th>HSN</th><th>Sent</th><th>Returned</th><th>Held</th><th>Value</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>{itc.rows.map((r: any, i: number) => <tr key={i} className="border-t border-slate-100"><td className="p-2 font-semibold">{r.challanNo}</td><td>{new Date(r.date).toLocaleDateString('en-IN')}</td><td>{r.quarter}</td><td>{r.jobWorker}</td><td>{r.goodsType}</td><td>{r.description}</td><td>{r.hsnCode}</td><td>{r.sent}</td><td>{r.returned}</td><td className="font-bold">{r.held}</td><td>{inr(r.value)}</td>
                <td>{r.dueDate ? new Date(r.dueDate).toLocaleDateString('en-IN') : ''}{r.daysToDue !== null ? ` (${r.daysToDue}d)` : ''}</td><td><span className={`rounded-full px-2 py-0.5 font-bold ${STATUS_STYLE[r.status]}`}>{r.status.replace('_', ' ')}</span></td></tr>)}
                {!itc.rows.length && <tr><td colSpan={13} className="p-8 text-center text-sm text-slate-400">No outward job work yet.</td></tr>}</tbody></table>
          </div>
        </>}
      </div>

      {pdf && <PdfPreview req={pdf} onClose={() => setPdf(null)} />}

      {recv && (
        <div className="modal-overlay print:hidden">
          <form className="w-full max-w-2xl space-y-3 modal" onSubmit={e => { e.preventDefault(); run(async () => { await api(`/api/jobwork/${recv.job._id}`, 'PATCH', { action: 'receive', outputQty: recv.outputQty, note: recv.note, items: recv.items }); setRecv(null); }, 'Receipt recorded and stock updated.'); }}>
            <h2 className="text-lg font-bold">Receive back · {recv.job.number}</h2>
            {recv.job.items.map((it: any, i: number) => (
              <div key={i} className="grid grid-cols-[1fr_90px_90px_90px] items-center gap-2 text-xs">
                <span className="font-semibold">{it.description} <span className="text-slate-400">(held {heldQty(it)})</span></span>
                {(['consumed', 'returned', 'scrap'] as const).map(k => <input key={k} type="number" min="0" step="any" placeholder={k} className={field} value={recv.items[i][k]} onChange={e => setRecv({ ...recv, items: recv.items.map((x: any, n: number) => (n === i ? { ...x, [k]: e.target.value } : x)) })} />)}
              </div>))}
            <input type="number" min="0" step="any" className={field} placeholder={`Finished SFG output received${recv.job.expectedOutputQty ? ` (expected ${recv.job.expectedOutputQty})` : ''}`} value={recv.outputQty} onChange={e => setRecv({ ...recv, outputQty: e.target.value })} />
            <input className={field} placeholder="Note" value={recv.note} onChange={e => setRecv({ ...recv, note: e.target.value })} />
            <div className="flex justify-end gap-2"><button type="button" className={`${btn} btn-ghost`} onClick={() => setRecv(null)}>Cancel</button><button className={`${btn} btn-success`}>Record receipt</button></div>
          </form>
        </div>
      )}

      {inwardAction && (
        <div className="modal-overlay print:hidden">
          <form className="w-full max-w-sm space-y-3 modal" onSubmit={e => { e.preventDefault(); run(async () => { await api(`/api/jobwork/${inwardAction.job._id}`, 'PATCH', { action: inwardAction.kind, quantity: inwardAction.qty, vehicleNo: inwardAction.vehicle }); setInwardAction(null); }, inwardAction.kind === 'process' ? 'Processing logged.' : 'Return challan created.'); }}>
            <h2 className="text-lg font-bold">{inwardAction.kind === 'process' ? 'Log processed quantity' : 'Return challan'} · {inwardAction.job.number}</h2>
            <input required type="number" min="0" step="any" className={field} placeholder="Quantity" value={inwardAction.qty} onChange={e => setInwardAction({ ...inwardAction, qty: e.target.value })} />
            {inwardAction.kind === 'return' && <input required className={field} placeholder="Vehicle no." value={inwardAction.vehicle} onChange={e => setInwardAction({ ...inwardAction, vehicle: e.target.value })} />}
            <div className="flex justify-end gap-2"><button type="button" className={`${btn} btn-ghost`} onClick={() => setInwardAction(null)}>Cancel</button><button className={`${btn} btn-primary`}>Save</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
