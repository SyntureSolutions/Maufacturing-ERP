'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';
import { Field, Section, Tabs, fmtDay, fmtInr, fmtQty } from '@/components/common/ObjectPage';
import { Alert } from '@/components/ui';
import LineageDrawer from '@/components/common/LineageDrawer';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import { PdfButton, pdfUrl } from '@/components/workspace/PdfButton';

// Quotation as an object page: toolbar, header strip of key fields, then collapsible Header (tabs),
// Item Overview (grid table) and Item Detail. Revising, discount requests and marking a deal won or lost
// stay on the CRM screen; this page shows the document and its history.

const inr = fmtInr;
const STAGE_TONE: Record<string, string> = { ENQUIRY_RECEIVED: 'info', QUOTATION_SENT: 'info', UNDER_REVIEW: 'critical', PO_RECEIVED: 'positive', LOST_DECLINED: 'negative' };
const DISCOUNT_TONE: Record<string, string> = { PENDING: 'critical', APPROVED: 'positive', REJECTED: 'negative' };
const HEADER_TABS = ['Sales', 'Terms', 'Tax', 'Discounts', 'Revisions', 'Status'];
const ITEM_TABS = ['Material Data', 'Pricing'];
const stamp = (d: any) => (d ? new Date(d).toLocaleString('en-GB') : '—');
const words = (v: any) => String(v || '').replace(/_/g, ' ');

export default function QuotationObjectPage() {
  const { id } = useParams<{ id: string }>();
  const [q, setQ] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({ header: true, items: true, detail: true });
  const [headerTab, setHeaderTab] = useState(HEADER_TABS[0]);
  const [itemTab, setItemTab] = useState(ITEM_TABS[0]);
  const [lineIdx, setLineIdx] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/quotations/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setQ(data); else setError(data.error || 'Could not load the quotation.');
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="ui-page"><Alert ok={false}>{error}</Alert><Link href="/dashboard/crm" className="btn btn-secondary btn-sm w-fit">Back to CRM</Link></div>;
  if (!q) return <p className="text-sm text-[var(--erp-muted)]">Loading…</p>;

  const c = q.customer || {};
  const items: any[] = q.items || [];
  const line = items[Math.min(lineIdx, items.length - 1)];
  const p = line?.product || {};
  const tax = q.taxSummary;
  const discounts: any[] = [...(q.discountRequests || [])].reverse();
  const revisions: any[] = [...(q.revisions || [])].reverse();
  const currency = q.currency || 'INR';

  return (
    <div className="ui-page !gap-0">
      <div className="obj-toolbar">
        <Link href="/dashboard/crm" className="btn btn-sm btn-secondary"><ArrowLeft className="h-4 w-4" /> CRM</Link>
        <PdfButton url={pdfUrl.quotation(q._id)} title={`Quotation ${q.quoteNumber}`} />
        <LineageDrawer type="QUOTATION" id={q._id} label="Document chain" />
        <AttachmentDrawer entityType="QUOTATION" entityId={q._id} label="Attachments" />
        <span className="ml-auto text-[13px] text-[var(--erp-muted)]">Created {fmtDay(q.createdAt)} · revision {q.revision || 1}</span>
      </div>

      <div className="obj-header">
        <Field label="Order Type">{q.orderType === 'EXPORT' ? 'Export quotation' : 'Standard quotation'}</Field>
        <Field label="Quotation">{q.quoteNumber}</Field>
        <Field label="Sold-To Party">{c.code ? `${c.code} ${c.name}` : q.customerName}</Field>
        <Field label="Net Value">{`${currency} ${inr(q.totalAmount).replace('₹', '')}`}</Field>
        <div className="field-row"><span className="field-label">Stage</span><span className={`status-text status-text--${STAGE_TONE[q.stage] || 'info'}`}>{words(q.stage)}</span></div>
      </div>

      <Section title="Header" open={open.header} onToggle={() => setOpen({ ...open, header: !open.header })}>
        <Tabs tabs={HEADER_TABS} active={headerTab} onChange={setHeaderTab} />
        <div className="obj-pane">
          {headerTab === 'Sales' && <div className="form-grid">
            <Field label="Enquiry">{q.enquiryRef}</Field><Field label="Valid To">{fmtDay(q.validUntil)}</Field>
            <Field label="Payment Terms">{q.paymentTerms || c.paymentTerms}</Field><Field label="Currency">{currency}{q.exchangeRate ? ` (rate ${q.exchangeRate})` : ''}</Field>
            <Field label="Customer PO">{q.poNumber}</Field><Field label="Sales Order">{q.salesOrderRef}</Field>
            <Field label="Pro-forma">{q.proformaNumber ? `${q.proformaNumber} (${fmtDay(q.proformaIssuedAt)})` : 'Not issued'}</Field>
          </div>}

          {headerTab === 'Terms' && <div className="space-y-3">
            <div className="form-grid">
              <Field label="Incoterms">{q.incoterm}</Field><Field label="Country">{q.country || c.country}</Field>
              {q.orderType === 'EXPORT' && <><Field label="Port of Loading">{q.portOfLoading}</Field><Field label="Port of Discharge">{q.portOfDischarge}</Field></>}
              <Field label="Place of Supply">{q.placeOfSupply}</Field>
            </div>
            <div className="min-h-16 whitespace-pre-wrap border border-[var(--erp-line)] p-3 text-sm">{q.terms || <span className="text-[var(--erp-muted)]">No terms and conditions text.</span>}</div>
          </div>}

          {headerTab === 'Tax' && (tax
            ? <div className="table-wrap !shadow-none"><table className="text-left text-sm"><thead><tr><th>Description</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  <tr><td>Sub total</td><td className="text-right num">{inr(tax.subTotal)}</td></tr>
                  {tax.totalIGST > 0 ? <tr><td>IGST</td><td className="text-right num">{inr(tax.totalIGST)}</td></tr> : <><tr><td>CGST</td><td className="text-right num">{inr(tax.totalCGST)}</td></tr><tr><td>SGST</td><td className="text-right num">{inr(tax.totalSGST)}</td></tr></>}
                  <tr><td className="font-semibold">Grand total</td><td className="text-right num font-semibold">{inr(tax.grandTotal)}</td></tr>
                </tbody></table></div>
            : <p className="text-sm text-[var(--erp-muted)]">GST has not been worked out for this quotation.</p>)}

          {headerTab === 'Discounts' && (discounts.length
            ? <div className="table-wrap !shadow-none"><table className="text-left text-sm">
                <thead><tr><th>Status</th><th className="text-right">Discount</th><th>Asked by</th><th>When</th><th>Needs</th><th>Decided by</th><th>Reason / remarks</th></tr></thead>
                <tbody>{discounts.map((d, k) => <tr key={k}>
                  <td><span className={`status-text status-text--${DISCOUNT_TONE[d.status] || 'info'}`}>{words(d.status)}</span></td>
                  <td className="text-right num">{d.percent}% ({inr(d.amount)})</td><td>{d.requestedBy}</td><td className="num">{stamp(d.requestedAt)}</td>
                  <td>{words(d.requiredRole)}</td><td>{d.decidedBy ? `${d.decidedBy} · ${stamp(d.decidedAt)}` : '—'}</td>
                  <td>{d.reason}{d.remarks ? ` — ${d.remarks}` : ''}</td></tr>)}</tbody></table></div>
            : <p className="text-sm text-[var(--erp-muted)]">No discount was asked for on this quotation.</p>)}

          {headerTab === 'Revisions' && (revisions.length
            ? <div className="table-wrap !shadow-none"><table className="text-left text-sm">
                <thead><tr><th>Revision</th><th>Changed by</th><th>When</th><th className="text-right">Value then</th><th>Note</th></tr></thead>
                <tbody>{revisions.map((r, k) => <tr key={k}><td className="num">{r.rev}</td><td>{r.changedBy || '—'}</td><td className="num">{stamp(r.at)}</td><td className="text-right num">{inr(r.totalAmount)}</td><td>{r.note || '—'}</td></tr>)}</tbody></table></div>
            : <p className="text-sm text-[var(--erp-muted)]">This quotation has not been revised.</p>)}

          {headerTab === 'Status' && <div className="form-grid">
            <Field label="Stage">{words(q.stage)}</Field><Field label="Credit Check">{q.creditCheckPassed ? 'Passed' : 'Not run or not passed'}</Field>
            <Field label="Credit Check Note">{q.creditCheckNotes}</Field>
            {q.stage === 'LOST_DECLINED' && <><Field label="Loss Category">{words(q.lossCategory)}</Field><Field label="Loss Reason">{q.lossReason}</Field></>}
          </div>}
        </div>
      </Section>

      <Section title="Item Overview" open={open.items} onToggle={() => setOpen({ ...open, items: !open.items })}>
        <div className="table-wrap !shadow-none"><table className="text-left text-sm">
          <thead><tr><th>Item</th><th>Material</th><th>Description</th><th className="text-right">Quantity</th><th>Unit</th><th className="text-right">Net Price</th><th className="text-right">Net Value</th></tr></thead>
          <tbody>{items.map((i, n) => (
            <tr key={n} onClick={() => setLineIdx(n)} className={`cursor-pointer ${n === lineIdx ? '!bg-[var(--erp-accent-soft)]' : ''}`}>
              <td className="num">{(n + 1) * 10}</td><td className="text-[var(--erp-accent)]">{i.product?.sku || '—'}</td><td className="max-w-[18rem] truncate">{i.productName || i.product?.name}</td>
              <td className="text-right num">{fmtQty(i.quantity)}</td><td>{i.product?.uom}</td><td className="text-right num">{inr(i.unitPrice)}</td><td className="text-right num">{inr(i.totalPrice)}</td>
            </tr>))}
            <tr><td colSpan={6} className="text-right font-semibold">Net value</td><td className="text-right num font-semibold">{inr(q.totalAmount)}</td></tr>
          </tbody></table></div>
      </Section>

      {line && <Section title="Item Detail" open={open.detail} onToggle={() => setOpen({ ...open, detail: !open.detail })}>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 text-sm">
          <span className="text-[var(--erp-muted)]">Item:</span>
          <select className="input !w-auto min-w-[18rem]" value={lineIdx} onChange={e => setLineIdx(Number(e.target.value))}>
            {items.map((i, n) => <option key={n} value={n}>{n + 1} {i.product?.sku || ''} , {i.productName || i.product?.name}</option>)}
          </select>
          <button className="btn btn-sm btn-secondary" disabled={lineIdx === 0} onClick={() => setLineIdx(lineIdx - 1)} aria-label="Previous item"><ChevronUp className="h-4 w-4" /></button>
          <button className="btn btn-sm btn-secondary" disabled={lineIdx >= items.length - 1} onClick={() => setLineIdx(lineIdx + 1)} aria-label="Next item"><ChevronDown className="h-4 w-4" /></button>
        </div>
        <Tabs tabs={ITEM_TABS} active={itemTab} onChange={setItemTab} />
        <div className="obj-pane">
          {itemTab === 'Material Data' && <div className="form-grid">
            <Field label="Material">{p.sku}</Field><Field label="Description">{line.productName || p.name}</Field>
            <Field label="HSN Code">{p.hsnCode}</Field><Field label="GST Rate">{p.gstRate != null ? `${p.gstRate}%` : '—'}</Field>
          </div>}
          {itemTab === 'Pricing' && <div className="form-grid">
            <Field label="Quantity">{`${fmtQty(line.quantity)} ${p.uom || ''}`}</Field><Field label="Net Price">{inr(line.unitPrice)}</Field>
            <Field label="Net Value">{inr(line.totalPrice)}</Field>
          </div>}
        </div>
      </Section>}
    </div>
  );
}
