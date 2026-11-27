'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Field, Section, Tabs, fmtDay, fmtInr, fmtQty } from '@/components/common/ObjectPage';
import { Alert } from '@/components/ui';
import LineageDrawer from '@/components/common/LineageDrawer';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import TaxItemsTable from '@/components/common/TaxItemsTable';
import { PdfButton, pdfUrl } from '@/components/workspace/PdfButton';

// Vendor bill as an object page: header strip, Header tabs and the item overview.
// Paying the bill, applying an advance and booking a return stay on the Vendor Bills and Purchase screens.

const TONE: Record<string, string> = { DRAFT: 'info', ISSUED: 'info', PARTIAL: 'critical', PAID: 'positive', CANCELLED: 'negative' };
const HEADER_TABS = ['Bill', 'Tax', 'Payment'];

export default function VendorBillObjectPage() {
  const { id } = useParams<{ id: string }>();
  const [bill, setBill] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({ header: true, items: true });
  const [tab, setTab] = useState(HEADER_TABS[0]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/vendor-bills/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setBill(data); else setError(data.error || 'Could not load the vendor bill.');
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="ui-page"><Alert ok={false}>{error}</Alert><Link href="/dashboard/vendor-bills" className="btn btn-secondary btn-sm w-fit">Back to vendor bills</Link></div>;
  if (!bill) return <p className="text-sm text-[var(--erp-muted)]">Loading…</p>;

  const s = bill.supplier || {};
  const returned = (bill.items || []).reduce((a: number, i: any) => a + (i.returnedQty || 0), 0);

  return (
    <div className="ui-page !gap-0">
      <div className="obj-toolbar">
        <Link href="/dashboard/vendor-bills" className="btn btn-sm btn-secondary"><ArrowLeft className="h-4 w-4" /> Vendor Bills</Link>
        <PdfButton url={pdfUrl.print('vendor-bill', bill._id)} title={`Vendor bill ${bill.invoiceNumber}`} />
        <LineageDrawer type="VENDOR_BILL" id={bill._id} label="Document chain" />
        <AttachmentDrawer entityType="VENDOR_BILL" entityId={bill._id} label="Attachments" />
        <span className="ml-auto text-[13px] text-[var(--erp-muted)]">Bill date {fmtDay(bill.date)}</span>
      </div>

      <div className="obj-header">
        <Field label="Document">{bill.invoiceNumber}</Field>
        <Field label="Vendor Bill No.">{bill.vendorBillNumber}</Field>
        <Field label="Vendor">{s.code ? `${s.code} ${s.name}` : s.name}</Field>
        <Field label="Gross Amount">{fmtInr(bill.totalAmount)}</Field>
        <div className="field-row"><span className="field-label">Status</span><span className={`status-text status-text--${TONE[bill.status] || 'info'}`}>{bill.status}</span></div>
      </div>

      <Section title="Header" open={open.header} onToggle={() => setOpen({ ...open, header: !open.header })}>
        <Tabs tabs={HEADER_TABS} active={tab} onChange={setTab} />
        <div className="obj-pane">
          {tab === 'Bill' && <div className="form-grid">
            <Field label="Purchase Order">{bill.purchaseOrder ? <Link className="text-[var(--erp-accent)] hover:underline" href={`/dashboard/purchase/${bill.purchaseOrder._id}`}>{bill.purchaseOrder.poNumber}</Link> : bill.poNumber}</Field>
            <Field label="Goods Receipts">{(bill.grnRefs || []).join(', ')}</Field>
            <Field label="Due Date">{fmtDay(bill.dueDate)}</Field><Field label="Payment Terms">{s.paymentTerms}</Field>
            <Field label="Vendor GSTIN">{s.gstin}</Field><Field label="Vendor PAN">{s.pan}</Field>
            <Field label="Reverse Charge">{bill.reverseCharge ? 'Yes' : 'No'}</Field><Field label="Returned to Vendor">{returned > 0 ? `${fmtQty(returned)} unit(s)` : 'None'}</Field>
          </div>}
          {tab === 'Tax' && <div className="table-wrap !shadow-none"><table className="text-left text-sm"><thead><tr><th>Description</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              <tr><td>Net value</td><td className="text-right num">{fmtInr(bill.subTotal)}</td></tr>
              {bill.totalIGST > 0 ? <tr><td>IGST</td><td className="text-right num">{fmtInr(bill.totalIGST)}</td></tr> : <><tr><td>CGST</td><td className="text-right num">{fmtInr(bill.totalCGST)}</td></tr><tr><td>SGST</td><td className="text-right num">{fmtInr(bill.totalSGST)}</td></tr></>}
              <tr><td className="font-semibold">Gross amount</td><td className="text-right num font-semibold">{fmtInr(bill.totalAmount)}</td></tr>
            </tbody></table></div>}
          {tab === 'Payment' && <div className="form-grid">
            <Field label="Bill Amount">{fmtInr(bill.totalAmount)}</Field><Field label="Paid">{fmtInr(bill.amountPaid || 0)}</Field>
            <Field label="Credit Notes">{fmtInr(bill.creditedAmount || 0)}</Field><Field label="Outstanding"><span className={bill.outstanding > 0.004 ? 'font-semibold text-amber-700' : ''}>{fmtInr(bill.outstanding)}</span></Field>
            <Field label="Vouchers">{(bill.appliedVouchers || []).join(', ')}</Field>
          </div>}
        </div>
      </Section>

      <Section title="Item Overview" open={open.items} onToggle={() => setOpen({ ...open, items: !open.items })}>
        <TaxItemsTable items={bill.items || []} extra={{ head: 'Returned', cell: (i: any) => (i.returnedQty ? fmtQty(i.returnedQty) : '—') }} />
      </Section>
    </div>
  );
}
