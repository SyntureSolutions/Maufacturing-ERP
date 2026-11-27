'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronDown, ChevronUp, Pencil, ArrowLeft } from 'lucide-react';
import { Field, Section, Tabs, fmtDay, fmtInr, fmtQty } from '@/components/common/ObjectPage';
import { Alert } from '@/components/ui';
import LineageDrawer from '@/components/common/LineageDrawer';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import PurchaseOrderModal from '@/components/modals/PurchaseOrderModal';
import { PdfButton, pdfUrl } from '@/components/workspace/PdfButton';

// Purchase order as an object page: toolbar, header strip of key fields, then collapsible Header (tabs),
// Item Overview (grid table) and Item Detail (tabs for the chosen line).

const inr = fmtInr;
const qty = fmtQty;
const day = fmtDay;
const EDITABLE = ['DRAFT', 'PENDING_APPROVAL'];
const STATUS_TONE: Record<string, string> = { DRAFT: 'info', PENDING_APPROVAL: 'critical', ORDERED: 'info', PARTIALLY_RECEIVED: 'critical', RECEIVED: 'positive', CANCELLED: 'negative' };

const HEADER_TABS = ['Delivery/Invoice', 'Conditions', 'Texts', 'Address', 'Communication', 'Org. Data', 'Status', 'Approval'];
const ITEM_TABS = ['Material Data', 'Quantities/Weights', 'Delivery Schedule', 'Invoice', 'Conditions', 'Requisition'];

export default function PurchaseOrderObjectPage() {
  const { id } = useParams<{ id: string }>();
  const [po, setPo] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({ header: true, items: true, detail: true });
  const [headerTab, setHeaderTab] = useState(HEADER_TABS[0]);
  const [itemTab, setItemTab] = useState(ITEM_TABS[0]);
  const [lineIdx, setLineIdx] = useState(0);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/purchase/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setPo(data); else setError(data.error || 'Could not load the purchase order.');
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="ui-page"><Alert ok={false}>{error}</Alert><Link href="/dashboard/purchase" className="btn btn-secondary btn-sm w-fit">Back to purchase orders</Link></div>;
  if (!po) return <p className="text-sm text-[var(--erp-muted)]">Loading…</p>;

  const s = po.supplier || {};
  const items: any[] = po.items || [];
  const line = items[Math.min(lineIdx, items.length - 1)];
  const p = line?.product || {};
  const ordered = items.reduce((a, i) => a + i.quantity, 0);
  const received = items.reduce((a, i) => a + (i.receivedQuantity || 0), 0);
  const billed = items.reduce((a, i) => a + (i.billedQuantity || 0), 0);
  const valueOf = (q: number, i: any) => q * (i.unitPrice || 0);
  const net = items.reduce((a, i) => a + (i.totalPrice || 0), 0);
  const origin = items.reduce((a, i) => a + (i.originalUnitPrice ?? i.unitPrice) * i.quantity, 0);
  const orderType = po.sourceType === 'MRP_AUTO' || po.mrpRun ? 'Planned PO (from MRP)' : 'Standard PO';
  const lineDate = (i: any) => i.deliveryDate || po.expectedDeliveryDate;

  return (
    <div className="ui-page !gap-0">
      {/* Toolbar */}
      <div className="obj-toolbar">
        <Link href="/dashboard/purchase" className="btn btn-sm btn-secondary"><ArrowLeft className="h-4 w-4" /> Document Overview</Link>
        {EDITABLE.includes(po.status) && <button className="btn btn-sm btn-secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Change</button>}
        <PdfButton url={pdfUrl.purchaseOrder(po._id)} title={`Purchase order ${po.poNumber}`} />
        <LineageDrawer type="PURCHASE_ORDER" id={po._id} label="Document chain" />
        <AttachmentDrawer entityType="PURCHASE_ORDER" entityId={po._id} label="Attachments" />
        <span className="ml-auto text-[13px] text-[var(--erp-muted)]">Created {day(po.createdAt)}{po.approvedBy?.name ? ` · released by ${po.approvedBy.name}` : ''}</span>
      </div>

      {/* Header strip */}
      <div className="obj-header">
        <Field label="Order Type">{orderType}</Field>
        <Field label="Purchasing Document">{po.poNumber}</Field>
        <Field label="Supplier">{s.code ? `${s.code} ${s.name}` : s.name}</Field>
        <Field label="Doc. Date">{day(po.orderDate || po.createdAt)}</Field>
        <div className="field-row"><span className="field-label">Status</span><span className={`status-text status-text--${STATUS_TONE[po.status] || 'info'}`}>{String(po.status).replace(/_/g, ' ')}</span></div>
      </div>

      {/* Header */}
      <Section title="Header" open={open.header} onToggle={() => setOpen({ ...open, header: !open.header })}>
        <Tabs tabs={HEADER_TABS} active={headerTab} onChange={setHeaderTab} />
        <div className="obj-pane">
          {headerTab === 'Delivery/Invoice' && <div className="form-grid">
            <Field label="Payment Terms">{s.paymentTerms}</Field><Field label="Currency">{s.orderCurrency || 'INR'}</Field>
            <Field label="Expected Delivery">{day(po.expectedDeliveryDate)}</Field><Field label="Incoterms">{s.incoterm}</Field>
            <Field label="Payment Method">{s.paymentMethod}</Field><Field label="QC on Receipt">{po.qualityCheckRequired ? 'Required' : 'Standard inward QC'}</Field>
          </div>}
          {headerTab === 'Conditions' && <div className="table-wrap !shadow-none"><table className="text-left text-sm">
            <thead><tr><th>Item</th><th>Description</th><th className="text-right">Amount</th><th>Per</th><th className="text-right">Condition Value</th></tr></thead>
            <tbody>
              {items.map(i => <tr key={i.lineNo}><td className="num">{i.lineNo}</td><td>Gross price · {i.product?.sku}</td><td className="text-right num">{inr(i.unitPrice)}</td><td>1 {i.product?.uom}</td><td className="text-right num">{inr(i.totalPrice)}</td></tr>)}
              <tr><td /><td className="font-semibold">Gross Value</td><td /><td /><td className="text-right num font-semibold">{inr(origin)}</td></tr>
              {origin - net > 0.004 && <tr><td /><td>Negotiated discount</td><td /><td /><td className="text-right num">−{inr(origin - net)}</td></tr>}
              <tr><td /><td className="font-semibold">Net Value</td><td /><td /><td className="text-right num font-semibold">{inr(net)}</td></tr>
              <tr><td /><td className="font-semibold">Total Value (PO)</td><td /><td /><td className="text-right num font-semibold">{inr(po.totalAmount)}</td></tr>
            </tbody></table></div>}
          {headerTab === 'Texts' && <div className="grid gap-3 md:grid-cols-[12rem_1fr]">
            <div className="border border-[var(--erp-line)] text-sm"><div className="bg-[var(--erp-table-head)] px-3 py-1.5">Header Texts</div><div className="px-3 py-1.5 text-[var(--erp-accent)]">Header Note</div>{po.negotiationNotes && <div className="px-3 py-1.5">Negotiation Note</div>}</div>
            <div className="min-h-24 whitespace-pre-wrap border border-[var(--erp-line)] p-3 text-sm">{po.notes || <span className="text-[var(--erp-muted)]">No header note.</span>}{po.negotiationNotes ? `\n\nNegotiation: ${po.negotiationNotes}` : ''}</div>
          </div>}
          {headerTab === 'Address' && <div className="form-grid">
            <Field label="Street">{s.address}</Field><Field label="Postal Code / City">{[s.pincode, s.city].filter(Boolean).join(' ')}</Field>
            <Field label="Country / Region">{[s.country, s.region].filter(Boolean).join(' / ')}</Field><Field label="Telephone">{s.phone}</Field>
            <Field label="GSTIN / VAT">{s.gstin || s.vatNumber}</Field><Field label="PAN / Tax ID">{s.pan || s.taxId}</Field>
          </div>}
          {headerTab === 'Communication' && <div className="form-grid">
            <Field label="Salesperson">{s.contactPerson}</Field><Field label="Email">{s.email}</Field>
            <Field label="Sent to Supplier">{po.dispatch?.at ? `${day(po.dispatch.at)} by ${po.dispatch.by || '—'}` : 'Not sent'}</Field>
            <Field label="Acknowledged">{po.dispatch?.ackAt ? `${day(po.dispatch.ackAt)}${po.dispatch.ackBy ? ` by ${po.dispatch.ackBy}` : ''}` : 'Not yet'}</Field>
          </div>}
          {headerTab === 'Org. Data' && <div className="form-grid">
            <Field label="Purch. Org.">{s.purchasingOrg}</Field><Field label="Company Code">{s.companyCode}</Field>
            <Field label="For Sales Order">{po.salesOrder ? 'Yes (see document chain)' : 'Stock'}</Field><Field label="Source">{po.mrpRun ? 'MRP run' : po.sourceType === 'MRP_AUTO' ? 'Auto-replenishment' : 'Manual'}</Field>
          </div>}
          {headerTab === 'Status' && <div className="grid gap-x-10 gap-y-1 text-sm md:grid-cols-[14rem_10rem_10rem]">
            <span className={`status-text status-text--${STATUS_TONE[po.status] || 'info'}`}>{po.approvedBy?.name ? 'Release completed' : 'Not released'}</span><span className="text-right text-[var(--erp-muted)]">Quantity</span><span className="text-right text-[var(--erp-muted)]">Value</span>
            <span>Ordered</span><span className="text-right num">{qty(ordered)}</span><span className="text-right num">{inr(net)}</span>
            <span>Delivered</span><span className="text-right num">{qty(received)}</span><span className="text-right num">{inr(items.reduce((a, i) => a + valueOf(i.receivedQuantity || 0, i), 0))}</span>
            <span>Still to deliver</span><span className="text-right num">{qty(Math.max(0, ordered - received))}</span><span className="text-right num">{inr(items.reduce((a, i) => a + valueOf(Math.max(0, i.quantity - (i.receivedQuantity || 0)), i), 0))}</span>
            <span>Invoiced</span><span className="text-right num">{qty(billed)}</span><span className="text-right num">{inr(items.reduce((a, i) => a + valueOf(i.billedQuantity || 0, i), 0))}</span>
          </div>}
          {headerTab === 'Approval' && <div className="table-wrap !shadow-none"><table className="text-left text-sm">
            <thead><tr><th>Step</th><th>Status</th><th>Required Role</th><th>Processor</th><th>Date</th></tr></thead>
            <tbody><tr><td>{String(po.approvalTier || '').replace(/_/g, ' ')}</td>
              <td><span className={`status-text status-text--${po.approvedBy?.name ? 'positive' : 'critical'}`}>{po.approvedBy?.name ? 'Purchase order released' : 'Waiting for release'}</span></td>
              <td>{String(po.approvalRequiredRole || '').replace(/_/g, ' ')}</td><td>{po.approvedBy?.name || '—'}</td><td>{day(po.approvedBy?.date)}</td></tr></tbody></table></div>}
        </div>
      </Section>

      {/* Item Overview */}
      <Section title="Item Overview" open={open.items} onToggle={() => setOpen({ ...open, items: !open.items })}>
        <div className="table-wrap !shadow-none"><table className="text-left text-sm">
          <thead><tr><th>Item</th><th>Material</th><th>Short Text</th><th className="text-right">PO Quantity</th><th>OUn</th><th>Deliv. Date</th><th className="text-right">Net Price</th><th>Curr.</th><th className="text-right">Received</th><th className="text-right">Invoiced</th><th>Purchase Req.</th></tr></thead>
          <tbody>{items.map((i, n) => (
            <tr key={i.lineNo ?? n} onClick={() => setLineIdx(n)} className={`cursor-pointer ${n === lineIdx ? '!bg-[var(--erp-accent-soft)]' : ''}`}>
              <td className="num">{i.lineNo}</td><td className="text-[var(--erp-accent)]">{i.product?.sku}</td><td className="max-w-[16rem] truncate">{i.product?.name}</td>
              <td className="text-right num">{qty(i.quantity)}</td><td>{i.product?.uom}</td><td className="num">{day(lineDate(i))}</td>
              <td className="text-right num">{inr(i.unitPrice)}</td><td>{s.orderCurrency || 'INR'}</td>
              <td className="text-right num">{qty(i.receivedQuantity)}</td><td className="text-right num">{qty(i.billedQuantity)}</td>
              <td className="num">{(i.sources || []).map((src: any) => `${src.indent?.number || 'Req.'} / ${src.lineNo}`).join(', ') || '—'}</td>
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
            <Field label="Material">{p.sku}</Field><Field label="Short Text">{p.name}</Field>
            <Field label="Material Type">{String(p.productType || '').replace(/_/g, ' ')}</Field><Field label="HSN Code">{p.hsnCode}</Field>
            <Field label="OEM / Part No.">{[p.oemName, p.oemPartNumber].filter(Boolean).join(' · ')}</Field><Field label="Batch Managed">{p.batchManaged === false ? 'No' : 'Yes'}</Field>
          </div>}
          {itemTab === 'Quantities/Weights' && <div className="form-grid">
            <Field label="PO Quantity">{`${qty(line.quantity)} ${p.uom || ''}`}</Field><Field label="Order Unit">{p.uom}</Field>
            <Field label="Net Weight">{p.netWeight != null ? `${qty(p.netWeight * line.quantity)} KG (${qty(p.netWeight)} / ${p.uom})` : '—'}</Field>
            <Field label="Gross Weight">{p.grossWeight != null ? `${qty(p.grossWeight * line.quantity)} KG (${qty(p.grossWeight)} / ${p.uom})` : '—'}</Field>
          </div>}
          {itemTab === 'Delivery Schedule' && <div className="table-wrap !shadow-none"><table className="text-left text-sm">
            <thead><tr><th>Delivery Date</th><th className="text-right">Scheduled Qty</th><th className="text-right">Received</th><th className="text-right">Open</th></tr></thead>
            <tbody><tr><td className="num">{day(lineDate(line))}{line.deliveryDate ? '' : ' (with the PO)'}</td><td className="text-right num">{qty(line.quantity)}</td><td className="text-right num">{qty(line.receivedQuantity)}</td><td className="text-right num">{qty(Math.max(0, line.quantity - (line.receivedQuantity || 0)))}</td></tr></tbody></table></div>}
          {itemTab === 'Invoice' && <div className="form-grid">
            <Field label="GST Rate">{p.gstRate != null ? `${p.gstRate}%` : '—'}</Field><Field label="Invoiced Quantity">{qty(line.billedQuantity)}</Field>
            <Field label="GR-Based Invoice">Yes (three-way match)</Field><Field label="Still to Invoice">{qty(Math.max(0, (line.receivedQuantity || 0) - (line.billedQuantity || 0)))}</Field>
          </div>}
          {itemTab === 'Conditions' && <div className="form-grid">
            <Field label="Net Price">{inr(line.unitPrice)}</Field><Field label="Original Price">{inr(line.originalUnitPrice ?? line.unitPrice)}</Field>
            <Field label="Net Value">{inr(line.totalPrice)}</Field><Field label="Price Unit">{`1 ${p.uom || ''}`}</Field>
          </div>}
          {itemTab === 'Requisition' && ((line.sources || []).length
            ? <div className="table-wrap !shadow-none"><table className="text-left text-sm"><thead><tr><th>Purchase Req.</th><th>Item</th><th className="text-right">Quantity</th><th>Status</th></tr></thead>
                <tbody>{line.sources.map((src: any, k: number) => <tr key={k}><td className="num">{src.indent?.number}</td><td className="num">{src.lineNo}</td><td className="text-right num">{qty(src.quantity)}</td><td>{String(src.indent?.status || '').replace(/_/g, ' ')}</td></tr>)}</tbody></table></div>
            : <p className="text-sm text-[var(--erp-muted)]">This line does not order a purchase requisition.</p>)}
        </div>
      </Section>}

      <PurchaseOrderModal isOpen={editing} po={po} onClose={() => setEditing(false)} onSuccess={() => { setEditing(false); load(); }} />
    </div>
  );
}
