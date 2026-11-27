'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronDown, ChevronUp, ArrowLeft, PauseCircle, PlayCircle } from 'lucide-react';
import { Field, Section, Tabs, fmtDay, fmtInr, fmtQty } from '@/components/common/ObjectPage';
import { Alert } from '@/components/ui';
import LineageDrawer from '@/components/common/LineageDrawer';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import { PdfButton, pdfUrl } from '@/components/workspace/PdfButton';

// Sales order as an object page: toolbar, header strip of key fields, then collapsible Header (tabs),
// Item Overview (grid table) and Item Detail (tabs for the chosen line). Hold history and the below-MSP
// approval record are on the Header tabs; edits, approval and cancelling stay on the Order Desk.

const inr = fmtInr;
const qty = fmtQty;
const day = fmtDay;
const STATUS_TONE: Record<string, string> = { DRAFT: 'info', APPROVED: 'info', IN_FULFILLMENT: 'critical', FULFILLED: 'positive', CANCELLED: 'negative', ON_HOLD: 'negative' };
const HEADER_TABS = ['Sales', 'Pricing', 'Hold history', 'Shipping', 'Billing', 'Status'];
const ITEM_TABS = ['Material Data', 'Quantities', 'Schedule', 'Pricing'];
const stamp = (d: any) => (d ? new Date(d).toLocaleString('en-GB') : '—');

export default function SalesOrderObjectPage() {
  const { id } = useParams<{ id: string }>();
  const [so, setSo] = useState<any | null>(null);
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({ header: true, items: true, detail: true });
  const [headerTab, setHeaderTab] = useState(HEADER_TABS[0]);
  const [itemTab, setItemTab] = useState(ITEM_TABS[0]);
  const [lineIdx, setLineIdx] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sales-orders/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setSo(data); else setError(data.error || 'Could not load the sales order.');
  }, [id]);
  useEffect(() => {
    load();
    fetch('/api/auth/session').then(r => r.json()).then(s => setRole(s?.user?.role || '')).catch(() => {});
  }, [load]);

  const holdAction = async (action: 'hold' | 'release') => {
    const text = action === 'hold' ? window.prompt(`Why is ${so.soNumber} being put on hold?`) : window.prompt(`Release ${so.soNumber} from hold? Add a note (optional).`, '');
    if (text === null || (action === 'hold' && !text)) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/sales-orders/${id}/hold`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action === 'hold' ? { action, reason: text } : { action, remarks: text }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The request failed.');
      setMsg({ ok: true, text: action === 'hold' ? `${so.soNumber} is on hold.` : `${so.soNumber} was released.` });
      await load();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };

  if (error) return <div className="ui-page"><Alert ok={false}>{error}</Alert><Link href="/dashboard/order-desk" className="btn btn-secondary btn-sm w-fit">Back to the Order Desk</Link></div>;
  if (!so) return <p className="text-sm text-[var(--erp-muted)]">Loading…</p>;

  const c = so.customer || {};
  const items: any[] = so.items || [];
  const line = items[Math.min(lineIdx, items.length - 1)];
  const p = line?.product || {};
  const ordered = items.reduce((a, i) => a + i.quantity, 0);
  const sent = items.reduce((a, i) => a + (i.dispatchedQty || 0), 0);
  const billed = items.reduce((a, i) => a + (i.invoicedQty || 0), 0);
  const short = (so.allocationShortfall || []).reduce((a: number, x: any) => a + x.quantity, 0);
  const lineDate = (i: any) => i.requiredDeliveryDate || so.deliveryDate;
  const history: any[] = [...(so.holdHistory || [])].reverse();
  const belowMsp = (i: any) => (so.mspOverride?.lines || []).includes(i.lineNo);
  const canOverride = ['ADMIN', 'MANAGER'].includes(role);
  const canHold = canOverride && ['DRAFT', 'APPROVED', 'IN_FULFILLMENT'].includes(so.status) && !so.approvalPending;

  return (
    <div className="ui-page !gap-0">
      {/* Toolbar */}
      <div className="obj-toolbar">
        <Link href="/dashboard/order-desk" className="btn btn-sm btn-secondary"><ArrowLeft className="h-4 w-4" /> Order Desk</Link>
        {canHold && <button className="btn btn-sm btn-secondary" disabled={busy} onClick={() => holdAction('hold')}><PauseCircle className="h-4 w-4" /> Hold</button>}
        {canOverride && so.status === 'ON_HOLD' && <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => holdAction('release')}><PlayCircle className="h-4 w-4" /> Release</button>}
        <PdfButton url={pdfUrl.salesOrder(so._id)} title={`Sales order ${so.soNumber}`} />
        <LineageDrawer type="SALES_ORDER" id={so._id} label="Document chain" />
        <AttachmentDrawer entityType="SALES_ORDER" entityId={so._id} label="Attachments" />
        <span className="ml-auto text-[13px] text-[var(--erp-muted)]">Created {day(so.createdAt)}</span>
      </div>
      {msg && <Alert ok={msg.ok}>{msg.text}</Alert>}

      {/* Header strip */}
      <div className="obj-header">
        <Field label="Order Type">{so.orderType === 'EXPORT' ? 'Export order' : 'Standard order'}</Field>
        <Field label="Sales Order">{so.soNumber}{so.priceLocked ? ' 🔒' : ''}</Field>
        <Field label="Sold-To Party">{c.code ? `${c.code} ${c.name}` : so.customerName}</Field>
        <Field label="Customer PO">{so.poNumber}</Field>
        <div className="field-row"><span className="field-label">Status</span><span className={`status-text status-text--${STATUS_TONE[so.status] || 'info'}`}>{String(so.status).replace(/_/g, ' ')}</span></div>
      </div>
      {so.status === 'ON_HOLD' && so.hold && <Alert ok={false}>On hold since {stamp(so.hold.at)} by {so.hold.by}: {so.hold.reason}. It cannot be approved, reserved, planned or dispatched until it is released.</Alert>}
      {so.approvalPending && <Alert ok={false}>Waiting in the approval matrix.</Alert>}

      {/* Header */}
      <Section title="Header" open={open.header} onToggle={() => setOpen({ ...open, header: !open.header })}>
        <Tabs tabs={HEADER_TABS} active={headerTab} onChange={setHeaderTab} />
        <div className="obj-pane">
          {headerTab === 'Sales' && <div className="form-grid">
            <Field label="Net Value">{inr(so.totalAmount)}</Field><Field label="Currency">{so.currency || 'INR'}</Field>
            <Field label="Customer PO No.">{so.poNumber}</Field><Field label="Quotation">{so.quotationRef}</Field>
            <Field label="Payment Terms">{so.paymentTerms || c.paymentTerms}</Field><Field label="Req. Delivery Date">{day(so.deliveryDate)}</Field>
            <Field label="Credit Check">{so.creditCheckPassed ? 'Passed' : 'Not passed'}</Field><Field label="Credit Limit">{c.creditLimit ? inr(c.creditLimit) : 'None set'}</Field>
            <Field label="Incoterms">{so.incoterm}</Field><Field label="Terms">{so.terms}</Field>
          </div>}

          {headerTab === 'Pricing' && <div className="space-y-4">
            <div className="form-grid">
              <Field label="Price and Terms">{so.priceLocked ? `Locked${so.lockedAt ? ` on ${day(so.lockedAt)}` : ''}` : 'Not locked'}</Field>
              <Field label="Discounts">{so.discounts ? inr(so.discounts) : 'None'}</Field>
            </div>
            <div>
              <h4 className="mb-1 text-sm font-semibold">Approved below the minimum selling price</h4>
              {so.mspOverride
                ? <div className="table-wrap !shadow-none"><table className="text-left text-sm">
                    <thead><tr><th>Accepted by</th><th>Role</th><th>When</th><th>Item(s)</th><th>Reason</th></tr></thead>
                    <tbody><tr><td>{so.mspOverride.by}</td><td>{String(so.mspOverride.role || '').replace(/_/g, ' ')}</td><td className="num">{stamp(so.mspOverride.at)}</td><td className="num">{(so.mspOverride.lines || []).join(', ') || '—'}</td><td>{so.mspOverride.reason}</td></tr></tbody></table></div>
                : <p className="text-sm text-[var(--erp-muted)]">No line was approved below its minimum selling price.</p>}
            </div>
            <div>
              <h4 className="mb-1 text-sm font-semibold">Changes to locked prices</h4>
              {(so.priceOverrides || []).length
                ? <div className="table-wrap !shadow-none"><table className="text-left text-sm">
                    <thead><tr><th>Changed by</th><th>When</th><th>What</th><th>Reason</th></tr></thead>
                    <tbody>{so.priceOverrides.map((o: any, k: number) => <tr key={k}><td>{o.by}</td><td className="num">{stamp(o.at)}</td><td>{(o.changes || []).join(', ')}</td><td>{o.reason}</td></tr>)}</tbody></table></div>
                : <p className="text-sm text-[var(--erp-muted)]">The locked price has not been changed.</p>}
            </div>
          </div>}

          {headerTab === 'Hold history' && <div className="space-y-3">
            {so.status === 'ON_HOLD' && so.hold && <p className="text-sm font-semibold text-red-700">Currently on hold: {so.hold.reason} (by {so.hold.by}, {stamp(so.hold.at)}). Releasing returns it to {String(so.hold.fromStatus || '').replace(/_/g, ' ').toLowerCase()}.</p>}
            {history.length
              ? <div className="table-wrap !shadow-none"><table className="text-left text-sm">
                  <thead><tr><th>Action</th><th>By</th><th>Role</th><th>When</th><th>Reason / note</th></tr></thead>
                  <tbody>{history.map((h, k) => <tr key={k}><td><span className={`status-text status-text--${h.action === 'HOLD' ? 'negative' : 'positive'}`}>{h.action === 'HOLD' ? 'Put on hold' : 'Released'}</span></td><td>{h.by}</td><td>{String(h.role || '').replace(/_/g, ' ')}</td><td className="num">{stamp(h.at)}</td><td>{h.reason || '—'}</td></tr>)}</tbody></table></div>
              : <p className="text-sm text-[var(--erp-muted)]">This order has never been put on hold.</p>}
          </div>}

          {headerTab === 'Shipping' && <div className="form-grid">
            <Field label="Ship-To Address">{c.billingAddress}</Field><Field label="City / Postal Code">{[c.city, c.pincode].filter(Boolean).join(' ')}</Field>
            <Field label="Country">{so.country || c.country}</Field><Field label="Contact">{[c.contactPerson, c.phone].filter(Boolean).join(' · ')}</Field>
            {so.orderType === 'EXPORT' && <><Field label="Port of Loading">{so.portOfLoading}</Field><Field label="Port of Discharge">{so.portOfDischarge}</Field></>}
          </div>}

          {headerTab === 'Billing' && <div className="form-grid">
            <Field label="GSTIN">{c.gstin}</Field><Field label="PAN">{c.pan}</Field>
            <Field label="Pro-forma">{so.proformaNumber ? `${so.proformaNumber} (${day(so.proformaIssuedAt)})` : 'Not issued'}</Field>
            <Field label="Tax Invoice">{so.taxInvoiceNumber || String(so.taxInvoiceStatus || 'UNINVOICED').replace(/_/g, ' ')}</Field>
          </div>}

          {headerTab === 'Status' && <div className="grid gap-x-10 gap-y-1 text-sm md:grid-cols-[14rem_10rem]">
            <span className={`status-text status-text--${STATUS_TONE[so.status] || 'info'}`}>{String(so.status).replace(/_/g, ' ')}</span><span className="text-right text-[var(--erp-muted)]">Quantity</span>
            <span>Ordered</span><span className="text-right num">{qty(ordered)}</span>
            <span>Dispatched</span><span className="text-right num">{qty(sent)}</span>
            <span>Invoiced</span><span className="text-right num">{qty(billed)}</span>
            <span>Still to dispatch</span><span className="text-right num">{qty(Math.max(0, ordered - sent))}</span>
            <span>Not covered by stock</span><span className={`text-right num ${short > 0 ? 'font-semibold text-amber-700' : ''}`}>{qty(short)}</span>
          </div>}
        </div>
      </Section>

      {/* Item Overview */}
      <Section title="Item Overview" open={open.items} onToggle={() => setOpen({ ...open, items: !open.items })}>
        <div className="table-wrap !shadow-none"><table className="text-left text-sm">
          <thead><tr><th>Item</th><th>Material</th><th>Description</th><th className="text-right">Order Qty</th><th>SU</th><th>Req. Date</th><th className="text-right">Net Price</th><th className="text-right">Net Value</th><th className="text-right">Dispatched</th><th className="text-right">Invoiced</th></tr></thead>
          <tbody>{items.map((i, n) => (
            <tr key={i.lineNo ?? n} onClick={() => setLineIdx(n)} className={`cursor-pointer ${n === lineIdx ? '!bg-[var(--erp-accent-soft)]' : ''}`}>
              <td className="num">{i.lineNo}</td><td className="text-[var(--erp-accent)]">{i.product?.sku}</td><td className="max-w-[16rem] truncate">{i.product?.name}{belowMsp(i) && <span className="ml-1.5 text-[11px] font-semibold text-amber-700" title="Approved below the minimum selling price">below MSP</span>}</td>
              <td className="text-right num">{qty(i.quantity)}</td><td>{i.product?.uom}</td><td className="num">{day(lineDate(i))}</td>
              <td className="text-right num">{inr(i.unitPrice)}</td><td className="text-right num">{inr(i.totalPrice)}</td>
              <td className="text-right num">{qty(i.dispatchedQty)}</td><td className="text-right num">{qty(i.invoicedQty)}</td>
            </tr>))}</tbody></table></div>
      </Section>

      {/* Item Detail */}
      {line && <Section title="Item Detail" open={open.detail} onToggle={() => setOpen({ ...open, detail: !open.detail })}>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 text-sm">
          <span className="text-[var(--erp-muted)]">Item:</span>
          <select className="input !w-auto min-w-[18rem]" value={lineIdx} onChange={e => setLineIdx(Number(e.target.value))}>
            {items.map((i, n) => <option key={n} value={n}>{n + 1} [ {i.lineNo} ] {i.product?.sku} , {i.product?.name}</option>)}
          </select>
          <button className="btn btn-sm btn-secondary" disabled={lineIdx === 0} onClick={() => setLineIdx(lineIdx - 1)} aria-label="Previous item"><ChevronUp className="h-4 w-4" /></button>
          <button className="btn btn-sm btn-secondary" disabled={lineIdx >= items.length - 1} onClick={() => setLineIdx(lineIdx + 1)} aria-label="Next item"><ChevronDown className="h-4 w-4" /></button>
        </div>
        <Tabs tabs={ITEM_TABS} active={itemTab} onChange={setItemTab} />
        <div className="obj-pane">
          {itemTab === 'Material Data' && <div className="form-grid">
            <Field label="Material">{p.sku}</Field><Field label="Description">{p.name}</Field>
            <Field label="HSN Code">{p.hsnCode}</Field><Field label="GST Rate">{p.gstRate != null ? `${p.gstRate}%` : '—'}</Field>
          </div>}
          {itemTab === 'Quantities' && <div className="form-grid">
            <Field label="Order Quantity">{`${qty(line.quantity)} ${p.uom || ''}`}</Field><Field label="Dispatched">{qty(line.dispatchedQty)}</Field>
            <Field label="Invoiced">{qty(line.invoicedQty)}</Field><Field label="Still to Dispatch">{qty(Math.max(0, line.quantity - (line.dispatchedQty || 0)))}</Field>
          </div>}
          {itemTab === 'Schedule' && <div className="table-wrap !shadow-none"><table className="text-left text-sm">
            <thead><tr><th>Requested Date</th><th className="text-right">Order Qty</th><th className="text-right">Dispatched</th><th className="text-right">Open</th></tr></thead>
            <tbody><tr><td className="num">{day(lineDate(line))}{line.requiredDeliveryDate ? '' : ' (with the order)'}</td><td className="text-right num">{qty(line.quantity)}</td><td className="text-right num">{qty(line.dispatchedQty)}</td><td className="text-right num">{qty(Math.max(0, line.quantity - (line.dispatchedQty || 0)))}</td></tr></tbody></table></div>}
          {itemTab === 'Pricing' && <div className="form-grid">
            <Field label="Net Price">{inr(line.unitPrice)}</Field><Field label="Net Value">{inr(line.totalPrice)}</Field>
            <Field label="Minimum Selling Price">{belowMsp(line) ? `Approved below the minimum by ${so.mspOverride?.by}` : 'At or above the minimum'}</Field>
          </div>}
        </div>
      </Section>}
    </div>
  );
}
