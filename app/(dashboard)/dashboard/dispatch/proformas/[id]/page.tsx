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

// Pro-forma invoice as an object page: header strip, Header tabs and the item overview.
// Converting it to the tax invoice or cancelling it stays on the Dispatch screen.

const TONE: Record<string, string> = { ISSUED: 'info', CONVERTED: 'positive', CANCELLED: 'negative' };
const HEADER_TABS = ['Billing', 'Tax', 'Bank and terms'];
const party = (p: any) => (p ? [p.name, p.gstin ? `GSTIN ${p.gstin}` : '', [p.address, p.city, p.pincode].filter(Boolean).join(', ')].filter(Boolean).join(' · ') : '');

export default function ProformaObjectPage() {
  const { id } = useParams<{ id: string }>();
  const [pi, setPi] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({ header: true, items: true });
  const [tab, setTab] = useState(HEADER_TABS[0]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/proforma/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setPi(data); else setError(data.error || 'Could not load the pro-forma invoice.');
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="ui-page"><Alert ok={false}>{error}</Alert><Link href="/dashboard/dispatch" className="btn btn-secondary btn-sm w-fit">Back to dispatch</Link></div>;
  if (!pi) return <p className="text-sm text-[var(--erp-muted)]">Loading…</p>;
  const bank = pi.bank || {};

  return (
    <div className="ui-page !gap-0">
      <div className="obj-toolbar">
        <Link href="/dashboard/dispatch" className="btn btn-sm btn-secondary"><ArrowLeft className="h-4 w-4" /> Dispatch</Link>
        <PdfButton url={pdfUrl.print('proforma', pi._id)} title={`Proforma ${pi.number}`} />
        <LineageDrawer type="INVOICE" id={pi._id} label="Document chain" />
        <AttachmentDrawer entityType="PROFORMA" entityId={pi._id} label="Attachments" />
        <span className="ml-auto text-[13px] text-[var(--erp-muted)]">Issued {fmtDay(pi.date)}</span>
      </div>

      <div className="obj-header">
        <Field label="Pro-forma Invoice">{pi.number}</Field>
        <Field label="Sales Order">{pi.salesOrder ? <Link className="text-[var(--erp-accent)] hover:underline" href={`/dashboard/order-desk/${pi.salesOrder}`}>{pi.soNumber}</Link> : pi.soNumber}</Field>
        <Field label="Bill-To Party">{pi.customerName}</Field>
        <Field label="Total">{fmtInr(pi.totalAmount)}</Field>
        <div className="field-row"><span className="field-label">Status</span><span className={`status-text status-text--${TONE[pi.status] || 'info'}`}>{pi.status}</span></div>
      </div>
      {pi.status === 'CONVERTED' && <Alert ok>Converted to tax invoice {pi.invoiceNumber}.</Alert>}

      <Section title="Header" open={open.header} onToggle={() => setOpen({ ...open, header: !open.header })}>
        <Tabs tabs={HEADER_TABS} active={tab} onChange={setTab} />
        <div className="obj-pane">
          {tab === 'Billing' && <div className="form-grid">
            <Field label="Seller">{party(pi.parties?.seller)}</Field><Field label="Buyer">{party(pi.parties?.buyer)}</Field>
            <Field label="Place of Supply">{pi.placeOfSupply}</Field><Field label="Advance Requested">{pi.advanceRequested ? fmtInr(pi.advanceRequested) : 'None'}</Field>
            <Field label="Tax Invoice">{pi.invoiceNumber}</Field>
          </div>}
          {tab === 'Tax' && <div className="table-wrap !shadow-none"><table className="text-left text-sm"><thead><tr><th>Description</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              <tr><td>Sub total</td><td className="text-right num">{fmtInr(pi.subTotal)}</td></tr>
              {pi.totalIGST > 0 ? <tr><td>IGST</td><td className="text-right num">{fmtInr(pi.totalIGST)}</td></tr> : <><tr><td>CGST</td><td className="text-right num">{fmtInr(pi.totalCGST)}</td></tr><tr><td>SGST</td><td className="text-right num">{fmtInr(pi.totalSGST)}</td></tr></>}
              <tr><td className="font-semibold">Total</td><td className="text-right num font-semibold">{fmtInr(pi.totalAmount)}</td></tr>
            </tbody></table></div>}
          {tab === 'Bank and terms' && <div className="space-y-3">
            <div className="form-grid"><Field label="Bank">{bank.name}</Field><Field label="Account No.">{bank.accountNo}</Field><Field label="IFSC">{bank.ifsc}</Field><Field label="Branch">{bank.branch}</Field></div>
            <div className="min-h-12 whitespace-pre-wrap border border-[var(--erp-line)] p-3 text-sm">{pi.terms || <span className="text-[var(--erp-muted)]">No terms.</span>}</div>
          </div>}
        </div>
      </Section>

      <Section title="Item Overview" open={open.items} onToggle={() => setOpen({ ...open, items: !open.items })}>
        <TaxItemsTable items={pi.items || []} />
      </Section>
    </div>
  );
}
