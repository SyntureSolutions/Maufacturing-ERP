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

// Delivery challan (CGST Rule 55) as an object page: header strip, Header tabs and the item overview.
// Issuing, cancelling and invoicing stay on the Dispatch screen.

const TONE: Record<string, string> = { ISSUED: 'info', INVOICED: 'positive', CANCELLED: 'negative' };
const REASON: Record<string, string> = { SUPPLY: 'Supply of goods', JOB_WORK: 'Job work', SALE_ON_APPROVAL: 'Sale on approval', OTHER: 'Other' };
const HEADER_TABS = ['Transport', 'Parties', 'Stock', 'Cost'];
const stamp = (d: any) => (d ? new Date(d).toLocaleString('en-GB') : '—');
const party = (p: any) => (p ? [p.name, p.gstin ? `GSTIN ${p.gstin}` : '', [p.address, p.city, p.pincode].filter(Boolean).join(', ')].filter(Boolean).join(' · ') : '');

export default function ChallanObjectPage() {
  const { id } = useParams<{ id: string }>();
  const [dc, setDc] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({ header: true, items: true });
  const [tab, setTab] = useState(HEADER_TABS[0]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/delivery-challans/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setDc(data); else setError(data.error || 'Could not load the delivery challan.');
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="ui-page"><Alert ok={false}>{error}</Alert><Link href="/dashboard/dispatch" className="btn btn-secondary btn-sm w-fit">Back to dispatch</Link></div>;
  if (!dc) return <p className="text-sm text-[var(--erp-muted)]">Loading…</p>;

  const moves: any[] = dc.stockMovements || [];
  const short: any[] = dc.stockShortfall || [];

  return (
    <div className="ui-page !gap-0">
      <div className="obj-toolbar">
        <Link href="/dashboard/dispatch" className="btn btn-sm btn-secondary"><ArrowLeft className="h-4 w-4" /> Dispatch</Link>
        <PdfButton url={pdfUrl.challan(dc._id)} title={`Delivery challan ${dc.number}`} />
        <LineageDrawer type="DELIVERY_CHALLAN" id={dc._id} label="Document chain" />
        <AttachmentDrawer entityType="DELIVERY_CHALLAN" entityId={dc._id} label="Attachments" />
        <span className="ml-auto text-[13px] text-[var(--erp-muted)]">Issued {fmtDay(dc.date)}</span>
      </div>

      <div className="obj-header">
        <Field label="Delivery Challan">{dc.number}</Field>
        <Field label="Sales Order">{dc.salesOrder ? <Link className="text-[var(--erp-accent)] hover:underline" href={`/dashboard/order-desk/${dc.salesOrder}`}>{dc.soNumber}</Link> : dc.soNumber}</Field>
        <Field label="Ship-To Party">{dc.customerName}</Field>
        <Field label="Reason">{REASON[dc.reason] || dc.reason}</Field>
        <div className="field-row"><span className="field-label">Status</span><span className={`status-text status-text--${TONE[dc.status] || 'info'}`}>{dc.status}</span></div>
      </div>
      {dc.status === 'CANCELLED' && <Alert ok={false}>Cancelled {stamp(dc.cancelledAt)}{dc.cancelReason ? `: ${dc.cancelReason}` : ''}. The stock it took was put back.</Alert>}
      {short.length > 0 && <Alert ok={false}>{short.reduce((a, x) => a + (x.qty || 0), 0)} unit(s) were not found in stock when this challan was issued. Check the stock records.</Alert>}

      <Section title="Header" open={open.header} onToggle={() => setOpen({ ...open, header: !open.header })}>
        <Tabs tabs={HEADER_TABS} active={tab} onChange={setTab} />
        <div className="obj-pane">
          {tab === 'Transport' && <div className="form-grid">
            <Field label="Transporter">{dc.transporterName}</Field><Field label="Vehicle No.">{dc.vehicleNo}</Field>
            <Field label="LR / GR No.">{dc.lrNo}</Field><Field label="Place of Supply">{dc.placeOfSupply}</Field>
            <Field label="Invoice">{dc.invoiceNumber}</Field><Field label="Taxable Value">{fmtInr(dc.totalTaxable)}</Field>
          </div>}
          {tab === 'Parties' && <div className="form-grid">
            <Field label="Consignor">{party(dc.parties?.seller)}</Field><Field label="Consignee">{party(dc.parties?.buyer)}</Field>
          </div>}
          {tab === 'Stock' && <div className="space-y-3">
            {moves.length
              ? <div className="table-wrap !shadow-none"><table className="text-left text-sm"><thead><tr><th>Material</th><th>Batch</th><th className="text-right">Quantity</th><th>From</th></tr></thead>
                  <tbody>{moves.map((m, k) => <tr key={k}><td>{m.product?.sku ? `${m.product.sku} ${m.product.name}` : m.product?.name}</td><td className="num">{m.batch?.batchNumber}</td><td className="text-right num">{fmtQty(m.qty)}</td><td>{m.reserved ? 'Reserved for the order' : 'Free stock'}</td></tr>)}</tbody></table></div>
              : <p className="text-sm text-[var(--erp-muted)]">No stock was taken by this challan.</p>}
            {short.length > 0 && <div><h4 className="mb-1 text-sm font-semibold text-amber-700">Not found in stock</h4>
              <div className="table-wrap !shadow-none"><table className="text-left text-sm"><thead><tr><th>Material</th><th className="text-right">Quantity</th></tr></thead>
                <tbody>{short.map((m, k) => <tr key={k}><td>{m.product?.sku ? `${m.product.sku} ${m.product.name}` : m.product?.name}</td><td className="text-right num">{fmtQty(m.qty)}</td></tr>)}</tbody></table></div></div>}
          </div>}
          {tab === 'Cost' && (dc.cogsValue != null
            ? <div className="form-grid"><Field label="Cost of Goods Dispatched">{fmtInr(dc.cogsValue)}</Field><Field label="Booked">{dc.cogsJournal ? 'Yes, as cost of goods sold' : 'No'}</Field></div>
            : <p className="text-sm text-[var(--erp-muted)]">No cost was booked for this challan, or your role cannot see it.</p>)}
        </div>
      </Section>

      <Section title="Item Overview" open={open.items} onToggle={() => setOpen({ ...open, items: !open.items })}>
        <TaxItemsTable items={dc.items || []} />
      </Section>
    </div>
  );
}
