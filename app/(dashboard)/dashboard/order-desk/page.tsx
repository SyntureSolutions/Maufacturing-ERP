'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, Alert } from '@/components/ui';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import LineageDrawer from '@/components/common/LineageDrawer';
import SalesOrderApprovalDialog from '@/components/common/SalesOrderApprovalDialog';

const field = 'input';
const btn = 'btn btn-sm';
const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const pid = (p: any) => String(p?._id || p);
const dayOf = (d: any) => (d ? String(d).slice(0, 10) : '');

async function api(url: string, method = 'GET', body?: any) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const badge = (s: string) => ({
  DRAFT: 'bg-slate-100 text-slate-700', APPROVED: 'bg-blue-100 text-blue-800', IN_FULFILLMENT: 'bg-amber-100 text-amber-800', FULFILLED: 'bg-emerald-100 text-emerald-800', CANCELLED: 'bg-slate-200 text-slate-500', ON_HOLD: 'bg-red-100 text-red-800',
} as Record<string, string>)[s] || 'bg-slate-100 text-slate-700';

export default function OrderDeskPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [role, setRole] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState<'OPEN' | 'ALL'>('OPEN');
  const [edit, setEdit] = useState<{ order: any; qty: Record<string, string>; price: Record<string, string>; lineDate: Record<string, string>; poNumber: string; deliveryDate: string; reason: string } | null>(null);
  const [approveFor, setApproveFor] = useState<any | null>(null);
  const [plan, setPlan] = useState<{ order: any; matrix: any[] | null; runId?: string; log: string[] } | null>(null);
  const [link, setLink] = useState<{ report: any[]; dryRun: boolean } | null>(null);

  const canAct = ['ADMIN', 'MANAGER', 'SALES'].includes(role);
  const canPlan = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'SUPPLY_CHAIN_MANAGER'].includes(role);
  const canOverride = ['ADMIN', 'MANAGER'].includes(role);

  const load = useCallback(async () => {
    const d = await api('/api/sales-orders').catch(() => []);
    setOrders(Array.isArray(d) ? d : []);
  }, []);
  useEffect(() => { load(); api('/api/auth/session').then(s => setRole(s?.user?.role || '')).catch(() => {}); }, [load]);

  const run = async (fn: () => Promise<string | void>) => {
    setMsg(null); setBusy(true);
    try { const text = await fn(); if (text) setMsg({ ok: true, text }); await load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };

  const shown = useMemo(() => orders.filter(o => show === 'ALL' || !['CANCELLED'].includes(o.status)), [orders, show]);

  const openEdit = (o: any) => setEdit({
    order: o, poNumber: o.poNumber || '', deliveryDate: o.deliveryDate ? String(o.deliveryDate).slice(0, 10) : '', reason: '',
    qty: Object.fromEntries((o.items || []).map((i: any) => [pid(i.product), String(i.quantity)])), lineDate: Object.fromEntries((o.items || []).map((i: any) => [pid(i.product), dayOf(i.requiredDeliveryDate)])), price: Object.fromEntries((o.items || []).map((i: any) => [pid(i.product), String(i.unitPrice)])),
  });
  const saveEdit = () => run(async () => {
    if (!edit) return;
    const o = edit.order, draft = o.status === 'DRAFT';
    const dated = Object.values(edit.lineDate).some(Boolean);
    const body: any = { poNumber: edit.poNumber, ...(edit.deliveryDate && !dated ? { deliveryDate: edit.deliveryDate } : {}) };
    if (draft) body.items = (o.items || []).map((i: any) => ({ product: pid(i.product), quantity: Number(edit.qty[pid(i.product)]), unitPrice: Number(edit.price[pid(i.product)]), requiredDeliveryDate: edit.lineDate[pid(i.product)] || null }));
    else if ((o.items || []).some((i: any) => dayOf(i.requiredDeliveryDate) !== edit.lineDate[pid(i.product)])) body.lineDates = (o.items || []).map((i: any) => ({ lineNo: i.lineNo, requiredDeliveryDate: edit.lineDate[pid(i.product)] || null }));
    if (edit.reason.trim()) body.overrideReason = edit.reason.trim();
    await api(`/api/sales-orders/${o._id}`, 'PATCH', body);
    setEdit(null);
    return `${o.soNumber} updated.`;
  });
  const cancel = (o: any) => {
    const reason = window.prompt(`Why is ${o.soNumber} being cancelled?`);
    if (reason) run(async () => { const r = await api(`/api/sales-orders/${o._id}/cancel`, 'POST', { reason }); return `${r.soNumber} cancelled. Stock released: ${r.stockReservationsReleased} reservation(s); work orders cancelled: ${r.workOrdersCancelled.length}.`; });
  };
  const hold = (o: any) => {
    const reason = window.prompt(`Why is ${o.soNumber} being put on hold?`);
    if (reason) run(async () => { await api(`/api/sales-orders/${o._id}/hold`, 'POST', { action: 'hold', reason }); return `${o.soNumber} is on hold. It cannot be approved, reserved, planned or dispatched until it is released.`; });
  };
  const release = (o: any) => {
    const remarks = window.prompt(`Release ${o.soNumber} from hold? Add a note (optional).`, '');
    if (remarks !== null) run(async () => { const r = await api(`/api/sales-orders/${o._id}/hold`, 'POST', { action: 'release', remarks }); return `${o.soNumber} released (${String(r.status).replace('_', ' ').toLowerCase()}).`; });
  };
  const reserve = (o: any) => run(async () => { const r = await api(`/api/sales-orders/${o._id}/reserve`, 'POST', {}); return `${r.reservedNow} more unit(s) reserved for ${r.soNumber}.${r.stillShort.length ? ' Some is still short of stock.' : ''}`; });

  const preview = (o: any) => { setPlan({ order: o, matrix: null, log: [] }); api('/api/mrp/run', 'POST', { salesOrderId: o._id, preview: true }).then(r => setPlan(p => p && { ...p, matrix: r.matrix })).catch(e => { setPlan(null); setMsg({ ok: false, text: e.message }); }); };
  const step = (label: string, fn: () => Promise<string>) => run(async () => { try { const t = await fn(); setPlan(p => p && { ...p, log: [...p.log, t] }); } catch (e: any) { setPlan(p => p && { ...p, log: [...p.log, `${label}: ${e.message}`] }); } });

  const backfill = (dryRun: boolean) => run(async () => { const r = await api('/api/lineage/backfill', 'POST', { dryRun }); setLink({ report: r.report, dryRun: r.dryRun }); return dryRun ? 'Dry run finished. Nothing was changed.' : 'Older records were linked.'; });

  return (
    <div className="ui-page">
      <PageHeader title="Order Desk" subtitle="Everything about a customer order in one place: edit, reserve stock, plan what it needs, cancel, and see the chain from enquiry to payment."
        actions={<>
          <select className={`${field} !w-auto`} value={show} onChange={e => setShow(e.target.value as any)}><option value="OPEN">Hide cancelled</option><option value="ALL">Show all</option></select>
          {role === 'ADMIN' && <button className={`${btn} btn-secondary`} disabled={busy} onClick={() => backfill(true)}>Link older records…</button>}
          {['ADMIN', 'MANAGER', 'SALES'].includes(role) && <Link href="/dashboard/transactions/sales-order?new=1" className={`${btn} btn-primary`}>+ New Sales Order</Link>}
        </>} />
      {msg && <Alert ok={msg.ok}>{msg.text}</Alert>}

      {link && (
        <div className="card space-y-2">
          <div className="flex items-center justify-between"><h2 className="text-[15px] font-bold">{link.dryRun ? 'Older records that can be linked (dry run)' : 'Older records linked'}</h2><button className="text-sm font-bold text-slate-500" onClick={() => setLink(null)}>Close</button></div>
          <table className="text-left text-sm"><thead><tr><th>Link</th><th className="text-right">Checked</th><th className="text-right">{link.dryRun ? 'Can link' : 'Linked'}</th><th className="text-right">Not matched</th></tr></thead>
            <tbody>{link.report.map((r: any) => <tr key={r.link}><td>{r.link}</td><td className="text-right num">{r.checked}</td><td className="text-right num">{r.linked}</td><td className="text-right num">{r.unmatchedCount}{r.unmatched?.length ? <div className="text-[11px] text-slate-500">{r.unmatched.slice(0, 3).join('; ')}</div> : null}</td></tr>)}</tbody></table>
          {link.dryRun && <button className={`${btn} btn-primary`} disabled={busy} onClick={() => backfill(false)}>Link them now</button>}
        </div>)}

      <div className="table-wrap">
        <table className="text-left text-sm">
          <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Progress</th><th className="text-right">Total</th><th /></tr></thead>
          <tbody>
            {shown.map(o => {
              const qty = (o.items || []).reduce((s: number, i: any) => s + i.quantity, 0), sent = (o.items || []).reduce((s: number, i: any) => s + (i.dispatchedQty || 0), 0), billed = (o.items || []).reduce((s: number, i: any) => s + (i.invoicedQty || 0), 0);
              const short = (o.allocationShortfall || []).reduce((s: number, x: any) => s + x.quantity, 0);
              const open = ['DRAFT', 'APPROVED'].includes(o.status);
              return (
                <tr key={o._id}>
                  <td className="whitespace-nowrap"><Link href={`/dashboard/transactions/sales-order?id=${o._id}`} className="font-bold text-[var(--erp-accent)] hover:underline num">{o.soNumber}</Link>{o.priceLocked && <span title="Price and terms are locked" className="ml-1.5 text-xs">🔒</span>}<div className="text-xs text-slate-500">{o.poNumber ? `Customer PO ${o.poNumber}` : ''}</div></td>
                  <td>{o.customer?.name || o.customerName}</td>
                  <td><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge(o.status)}`}>{o.status.replace('_', ' ')}</span>
                    {o.status === 'ON_HOLD' && o.hold && <div className="mt-1 max-w-[220px] text-xs text-red-700">Held by {o.hold.by}: {o.hold.reason}</div>}
                    {o.approvalPending && <div className="mt-1 text-xs text-amber-700">Waiting in the approval matrix</div>}
                    {o.deliveryDate && <div className="mt-1 text-xs text-slate-500">Due {new Date(o.deliveryDate).toLocaleDateString('en-IN')}</div>}</td>
                  <td className="text-xs text-slate-600">Dispatched <b className="num">{sent}</b>/{qty} · Invoiced <b className="num">{billed}</b>/{qty}{short > 0 && <div className="font-semibold text-amber-700">{short} unit(s) not yet covered by stock</div>}</td>
                  <td className="text-right num">{inr(o.totalAmount)}</td>
                  <td><div className="flex flex-wrap justify-end gap-1.5">
                    {canAct && o.status === 'DRAFT' && !o.approvalPending && <button className={`${btn} btn-primary`} onClick={() => setApproveFor(o)}>Approve</button>}
                    {canAct && open && <button className={`${btn} btn-secondary`} onClick={() => openEdit(o)}>Edit</button>}
                    {canOverride && ['DRAFT', 'APPROVED', 'IN_FULFILLMENT'].includes(o.status) && !o.approvalPending && <button className={`${btn} btn-secondary`} disabled={busy} onClick={() => hold(o)}>Hold</button>}
                    {canOverride && o.status === 'ON_HOLD' && <button className={`${btn} btn-primary`} disabled={busy} onClick={() => release(o)}>Release</button>}
                    {canAct && ['APPROVED', 'IN_FULFILLMENT'].includes(o.status) && <button className={`${btn} btn-secondary`} disabled={busy} onClick={() => reserve(o)}>Reserve stock</button>}
                    {canPlan && ['DRAFT', 'APPROVED', 'IN_FULFILLMENT'].includes(o.status) && <button className={`${btn} btn-secondary`} onClick={() => preview(o)}>Plan</button>}
                    <LineageDrawer type="SALES_ORDER" id={o._id} label="Chain" />
                    <AttachmentDrawer entityType="SALES_ORDER" entityId={o._id} label="Files" />
                    {canAct && (open || o.status === 'ON_HOLD') && <button className={`${btn} btn-danger`} disabled={busy} onClick={() => cancel(o)}>Cancel</button>}
                  </div></td>
                </tr>);
            })}
            {!shown.length && <tr><td colSpan={6} className="p-8 text-center text-sm text-slate-400">No sales orders.</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setEdit(null)}>
          <div onClick={e => e.stopPropagation()} className="card w-full max-w-2xl space-y-3">
            <div><h2 className="text-[15px] font-bold">Edit {edit.order.soNumber}</h2>
              <p className="text-sm text-slate-500">{edit.order.status === 'DRAFT' ? (edit.order.priceLocked ? 'Prices and terms were locked when the quotation was won. Quantities can change; a price change needs a Manager or Admin and a written reason.' : 'This order can still be changed freely.') : 'Once approved, items and prices are fixed. Only the customer PO and delivery dates can change.'}</p></div>
            <div className="table-wrap"><table className="text-left text-sm"><thead><tr><th>Line</th><th>Item</th>{edit.order.status === 'DRAFT' && <><th>Quantity</th><th>Unit price</th></>}<th>Line delivery date</th></tr></thead>
                <tbody>{(edit.order.items || []).map((i: any) => { const k = pid(i.product); return (
                  <tr key={k}><td className="num">{i.lineNo}</td><td>{i.product?.name || k}</td>
                    {edit.order.status === 'DRAFT' && <><td><input type="number" min="0" step="any" className={`${field} !w-24`} value={edit.qty[k]} onChange={e => setEdit({ ...edit, qty: { ...edit.qty, [k]: e.target.value } })} /></td>
                    <td><input type="number" min="0" step="any" className={`${field} !w-28`} value={edit.price[k]} onChange={e => setEdit({ ...edit, price: { ...edit.price, [k]: e.target.value } })} /></td></>}
                    <td><input type="date" className={`${field} !w-40`} title="Leave empty to deliver with the order" value={edit.lineDate[k] || ''} onChange={e => setEdit({ ...edit, lineDate: { ...edit.lineDate, [k]: e.target.value } })} /></td></tr>); })}</tbody></table></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="lbl">Customer PO number<input className={field} value={edit.poNumber} onChange={e => setEdit({ ...edit, poNumber: e.target.value })} /></label>
              <label className="lbl">Order delivery date {Object.values(edit.lineDate).some(Boolean) ? '(follows the earliest line date)' : ''}<input type="date" className={field} disabled={Object.values(edit.lineDate).some(Boolean)} value={edit.deliveryDate} onChange={e => setEdit({ ...edit, deliveryDate: e.target.value })} /></label>
              {edit.order.status === 'DRAFT' && edit.order.priceLocked && <label className="lbl sm:col-span-2">Reason for changing a locked price {canOverride ? '' : '(Manager or Admin only)'}<input className={field} disabled={!canOverride} placeholder="At least 10 characters" value={edit.reason} onChange={e => setEdit({ ...edit, reason: e.target.value })} /></label>}
            </div>
            <div className="flex justify-end gap-2"><button className={`${btn} btn-secondary`} onClick={() => setEdit(null)}>Cancel</button><button className={`${btn} btn-primary`} disabled={busy} onClick={saveEdit}>Save</button></div>
          </div>
        </div>)}

      {approveFor && <SalesOrderApprovalDialog order={approveFor} role={role} onClose={() => setApproveFor(null)} onDone={text => { setApproveFor(null); setMsg({ ok: true, text }); load(); }} />}

      {plan && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setPlan(null)}>
          <div onClick={e => e.stopPropagation()} className="card max-h-[90vh] w-full max-w-5xl space-y-3 overflow-y-auto">
            <div className="flex items-start justify-between"><div><h2 className="text-[15px] font-bold">Plan {plan.order.soNumber}</h2><p className="text-sm text-slate-500">What this order needs after the stock on hand, stock reserved for it, and what is already on order for it. Other orders&apos; work is not counted.</p></div><button className="text-sm font-bold text-slate-500" onClick={() => setPlan(null)}>Close</button></div>
            {!plan.matrix ? <p className="text-sm text-slate-500">Working it out…</p> : (
              <div className="table-wrap"><table className="text-left text-sm">
                <thead><tr><th>Item</th><th>Type</th><th className="text-right">Needed</th><th className="text-right">In stock</th><th className="text-right">On order</th><th className="text-right">Open work</th><th className="text-right">To get</th><th>How</th></tr></thead>
                <tbody>{plan.matrix.map((r: any) => (
                  <tr key={r.product} className={r.netIndentQty > 0 ? '' : 'text-slate-400'}><td><b>{r.sku}</b> <span className="text-xs">{r.name}</span></td><td>{r.itemType}</td><td className="text-right num">{r.grossReq}</td><td className="text-right num">{r.inStock}</td><td className="text-right num">{r.poPipeline}</td><td className="text-right num">{r.openWorkOrders}</td><td className="text-right num font-semibold">{r.netIndentQty}</td><td>{r.netIndentQty > 0 ? (r.orderType === 'PURCHASE' ? 'Buy' : 'Make') : 'Covered'}</td></tr>))}</tbody></table></div>)}
            {plan.matrix && !plan.runId && <div className="flex justify-end"><button className={`${btn} btn-primary`} disabled={busy} onClick={() => step('Save plan', async () => { const r = await api('/api/mrp/run', 'POST', { salesOrderId: plan.order._id }); setPlan(p => p && { ...p, runId: r._id }); return 'Plan saved for this order.'; })}>Save this plan</button></div>}
            {plan.runId && (
              <div className="flex flex-wrap justify-end gap-2">
                <button className={`${btn} btn-secondary`} disabled={busy} onClick={() => step('Indents', async () => { const r = await api('/api/mrp/indents', 'POST', { runId: plan.runId }); return r.created?.length ? `Purchase indents raised: ${r.created.map((i: any) => i.number).join(', ')}.` : (r.message || 'Nothing to buy, or already asked for.'); })}>Raise purchase indents</button>
                <button className={`${btn} btn-secondary`} disabled={busy} onClick={() => step('Work orders', async () => { const r = await api('/api/mrp/work-orders', 'POST', { runId: plan.runId }); return r.created?.length ? `Work orders created: ${r.created.map((w: any) => `${w.woNumber}${w.mrn?.shortfall ? ' (material short)' : ''}`).join(', ')}.` : (r.message || 'Nothing to make.'); })}>Create work orders</button>
              </div>)}
            {plan.log.map((l, i) => <p key={i} className="text-sm text-slate-700">{l}</p>)}
          </div>
        </div>)}
    </div>
  );
}
