'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Field, Section, Tabs, fmtDay, fmtInr } from '@/components/common/ObjectPage';
import { Alert } from '@/components/ui';
import LineageDrawer from '@/components/common/LineageDrawer';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import TaxItemsTable from '@/components/common/TaxItemsTable';
import { PdfButton, pdfUrl } from '@/components/workspace/PdfButton';

// Tax invoice (sales) as an object page: header strip, Header tabs and the item overview.
// E-invoice, e-way bill and payment recording stay on the Dispatch and Vouchers screens.

const TONE: Record<string, string> = { DRAFT: 'info', ISSUED: 'info', PARTIAL: 'critical', PAID: 'positive', CANCELLED: 'negative' };
const HEADER_TABS = ['Billing', 'Tax', 'Payment', 'E-invoice / E-way'];
const words = (v: any) => String(v || '').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
const party = (p: any) => (p ? [p.name, p.gstin ? `GSTIN ${p.gstin}` : '', [p.address, p.city, p.pincode].filter(Boolean).join(', ')].filter(Boolean).join(' · ') : '');

export default function TaxInvoiceObjectPage() {
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({ header: true, items: true });
  const [tab, setTab] = useState(HEADER_TABS[0]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/dispatch/invoices/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setInv(data); else setError(data.error || 'Could not load the invoice.');
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="ui-page"><Alert ok={false}>{error}</Alert><Link href="/dashboard/dispatch" className="btn btn-secondary btn-sm w-fit">Back to dispatch</Link></div>;
  if (!inv) return <p className="text-sm text-[var(--erp-muted)]">Loading…</p>;

  const credited = inv.creditedAmount || 0;
  const outstanding = Math.round((inv.totalAmount - (inv.amountPaid || 0) - credited) * 100) / 100;
  const t = inv.transport || {};

  return (
    <div className="ui-page !gap-0">
      <div className="obj-toolbar">
        <Link href="/dashboard/dispatch" className="btn btn-sm btn-secondary"><ArrowLeft className="h-4 w-4" /> Dispatch</Link>
        <PdfButton url={pdfUrl.invoice(inv._id)} title={`Invoice ${inv.invoiceNumber}`} />
        <LineageDrawer type="INVOICE" id={inv._id} label="Document chain" />
        <AttachmentDrawer entityType="INVOICE" entityId={inv._id} label="Attachments" />
        <span className="ml-auto text-[13px] text-[var(--erp-muted)]">Invoice date {fmtDay(inv.date)}</span>
      </div>

      <div className="obj-header">
        <Field label="Tax Invoice">{inv.invoiceNumber}</Field>
        <Field label="Sales Order">{inv.salesOrder ? <Link className="text-[var(--erp-accent)] hover:underline" href={`/dashboard/order-desk/${inv.salesOrder}`}>{inv.soNumber}</Link> : inv.soNumber}</Field>
        <Field label="Bill-To Party">{inv.customer?.code ? `${inv.customer.code} ${inv.customer.name}` : inv.customer?.name}</Field>
        <Field label="Total">{fmtInr(inv.totalAmount)}</Field>
        <div className="field-row"><span className="field-label">Status</span><span className={`status-text status-text--${TONE[inv.status] || 'info'}`}>{inv.status}</span></div>
      </div>

      <Section title="Header" open={open.header} onToggle={() => setOpen({ ...open, header: !open.header })}>
        <Tabs tabs={HEADER_TABS} active={tab} onChange={setTab} />
        <div className="obj-pane">
          {tab === 'Billing' && <div className="form-grid">
            <Field label="Seller">{party(inv.parties?.seller)}</Field><Field label="Buyer">{party(inv.parties?.buyer)}</Field>
            <Field label="Place of Supply">{inv.placeOfSupply}</Field><Field label="Due Date">{fmtDay(inv.dueDate)}</Field>
            <Field label="Customer PO">{inv.poNumber}</Field><Field label="Delivery Challan">{inv.dcRef}</Field>
            <Field label="Pro-forma">{inv.proformaRef}</Field><Field label="Quotation">{inv.quotationRef}</Field>
            <Field label="Reverse Charge">{inv.reverseCharge ? 'Yes' : 'No'}</Field>
          </div>}
          {tab === 'Tax' && <div className="space-y-3">
            <div className="table-wrap !shadow-none"><table className="text-left text-sm"><thead><tr><th>Description</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                <tr><td>Sub total</td><td className="text-right num">{fmtInr(inv.subTotal)}</td></tr>
                {inv.totalIGST > 0 ? <tr><td>IGST</td><td className="text-right num">{fmtInr(inv.totalIGST)}</td></tr> : <><tr><td>CGST</td><td className="text-right num">{fmtInr(inv.totalCGST)}</td></tr><tr><td>SGST</td><td className="text-right num">{fmtInr(inv.totalSGST)}</td></tr></>}
                <tr><td className="font-semibold">Total</td><td className="text-right num font-semibold">{fmtInr(inv.totalAmount)}</td></tr>
              </tbody></table></div>
            {(inv.hsnSummary || []).length > 0 && <div className="table-wrap !shadow-none"><table className="text-left text-sm"><thead><tr><th>HSN</th><th className="text-right">Taxable Value</th><th className="text-right">Tax</th></tr></thead>
              <tbody>{inv.hsnSummary.map((h: any, k: number) => <tr key={k}><td className="num">{h.hsnCode}</td><td className="text-right num">{fmtInr(h.taxableValue)}</td><td className="text-right num">{fmtInr((h.cgstAmount || 0) + (h.sgstAmount || 0) + (h.igstAmount || 0))}</td></tr>)}</tbody></table></div>}
          </div>}
          {tab === 'Payment' && <div className="form-grid">
            <Field label="Invoice Total">{fmtInr(inv.totalAmount)}</Field><Field label="Received">{fmtInr(inv.amountPaid || 0)}</Field>
            <Field label="Credit Notes">{fmtInr(credited)}</Field><Field label="Outstanding"><span className={outstanding > 0.004 ? 'font-semibold text-amber-700' : ''}>{fmtInr(outstanding)}</span></Field>
            <Field label="Receipts Applied">{(inv.appliedVouchers || []).join(', ')}</Field>
          </div>}
          {tab === 'E-invoice / E-way' && <div className="form-grid">
            <Field label="E-invoice">{words(inv.einvoiceStatus || 'NOT_GENERATED')}</Field><Field label="IRN">{inv.irn || inv.irnHash}</Field>
            <Field label="Ack. No. / Date">{[inv.ackNo, inv.ackDate ? fmtDay(inv.ackDate) : ''].filter(Boolean).join(' · ')}</Field>
            <Field label="E-way Bill">{inv.ewayBillNumber || words(inv.ewayStatus || 'NOT_GENERATED')}</Field><Field label="E-way Valid Up To">{fmtDay(inv.ewayBillValidUpto || inv.ewayValidUpto)}</Field>
            <Field label="Transport">{[t.transporterName, t.vehicleNo, t.distanceKm ? `${t.distanceKm} km` : ''].filter(Boolean).join(' · ')}</Field>
          </div>}
        </div>
      </Section>

      <Section title="Item Overview" open={open.items} onToggle={() => setOpen({ ...open, items: !open.items })}>
        <TaxItemsTable items={inv.items || []} />
      </Section>
    </div>
  );
}
