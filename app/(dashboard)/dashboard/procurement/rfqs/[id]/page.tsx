'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Field, Section, Tabs, fmtDay, fmtInr, fmtQty } from '@/components/common/ObjectPage';
import { Alert } from '@/components/ui';
import LineageDrawer from '@/components/common/LineageDrawer';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import { PdfButton, pdfUrl } from '@/components/workspace/PdfButton';

// Request for quotation as an object page: header strip, Header tabs (vendors, rate comparison, award, requisitions)
// and Item Overview with each vendor's price per line. Entering quotes and awarding stay on the Procurement screen.

const TONE: Record<string, string> = { OPEN: 'info', AWARDED: 'positive', CANCELLED: 'negative' };
const HEADER_TABS = ['Rate comparison', 'Vendors', 'Award', 'Requisitions'];
const idOf = (v: any) => String(v?._id || v);

// Total landed cost of a vendor quote for the RFQ items (same working as the Procurement screen)
const quoteTotal = (rfq: any, quote: any) => {
  const subtotal = rfq.items.reduce((sum: number, item: any) => sum + (quote.unitPrices.find((p: any) => idOf(p.product) === idOf(item.product))?.unitPrice || 0) * item.quantity, 0);
  return subtotal * (1 + quote.gstPercent / 100) + quote.freight;
};

export default function RfqObjectPage() {
  const { id } = useParams<{ id: string }>();
  const [rfq, setRfq] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({ header: true, items: true });
  const [tab, setTab] = useState(HEADER_TABS[0]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/rfqs/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setRfq(data); else setError(data.error || 'Could not load the RFQ.');
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="ui-page"><Alert ok={false}>{error}</Alert><Link href="/dashboard/procurement" className="btn btn-secondary btn-sm w-fit">Back to procurement</Link></div>;
  if (!rfq) return <p className="text-sm text-[var(--erp-muted)]">Loading…</p>;

  const items: any[] = rfq.items || [];
  const quotes: any[] = rfq.quotes || [];
  const totals = quotes.map(q => quoteTotal(rfq, q));
  const best = totals.length ? Math.min(...totals) : 0;
  const quotedBy = new Set(quotes.map(q => idOf(q.supplier)));
  const waiting = (rfq.suppliers || []).filter((s: any) => !quotedBy.has(idOf(s)));
  const priceOf = (q: any, item: any) => q.unitPrices.find((p: any) => idOf(p.product) === idOf(item.product))?.unitPrice;

  return (
    <div className="ui-page !gap-0">
      <div className="obj-toolbar">
        <Link href="/dashboard/procurement" className="btn btn-sm btn-secondary"><ArrowLeft className="h-4 w-4" /> Procurement</Link>
        <PdfButton url={pdfUrl.print('rfq', rfq._id)} title={`RFQ ${rfq.number}`} />
        <LineageDrawer type="RFQ" id={rfq._id} label="Document chain" />
        <AttachmentDrawer entityType="RFQ" entityId={rfq._id} label="Vendor quotes" />
        <span className="ml-auto text-[13px] text-[var(--erp-muted)]">Created {fmtDay(rfq.createdAt)}</span>
      </div>

      <div className="obj-header">
        <Field label="RFQ">{rfq.number}</Field>
        <Field label="Quotation Deadline">{fmtDay(rfq.dueDate)}</Field>
        <Field label="Vendors">{String((rfq.suppliers || []).length)}</Field>
        <Field label="Quotes Received">{`${quotes.length} of ${(rfq.suppliers || []).length}`}</Field>
        <div className="field-row"><span className="field-label">Status</span><span className={`status-text status-text--${TONE[rfq.status] || 'info'}`}>{rfq.status}</span></div>
      </div>

      <Section title="Header" open={open.header} onToggle={() => setOpen({ ...open, header: !open.header })}>
        <Tabs tabs={HEADER_TABS} active={tab} onChange={setTab} />
        <div className="obj-pane">
          {tab === 'Rate comparison' && (quotes.length
            ? <div className="table-wrap !shadow-none"><table className="text-left text-sm">
                <thead><tr><th>Vendor</th><th className="text-right">Freight</th><th className="text-right">GST %</th><th className="text-right">Lead Time</th><th>Payment Terms</th><th className="text-right">Landed Total</th><th>Remarks</th></tr></thead>
                <tbody>{quotes.map((q, k) => (
                  <tr key={k} className={totals[k] === best ? '!bg-[var(--erp-accent-soft)]' : ''}>
                    <td>{q.supplier?.code ? `${q.supplier.code} ${q.supplier.name}` : q.supplier?.name}{totals[k] === best && quotes.length > 1 && <span className="ml-1.5 text-[11px] font-semibold text-emerald-700">lowest</span>}</td>
                    <td className="text-right num">{fmtInr(q.freight)}</td><td className="text-right num">{q.gstPercent}%</td>
                    <td className="text-right num">{q.leadTimeDays != null ? `${q.leadTimeDays} days` : '—'}</td><td>{q.paymentTerms || '—'}</td>
                    <td className="text-right num font-semibold">{fmtInr(totals[k])}</td><td>{q.remarks || '—'}</td>
                  </tr>))}</tbody></table></div>
            : <p className="text-sm text-[var(--erp-muted)]">No vendor has quoted yet.</p>)}

          {tab === 'Vendors' && <div className="table-wrap !shadow-none"><table className="text-left text-sm">
            <thead><tr><th>Vendor</th><th>Quote</th></tr></thead>
            <tbody>{(rfq.suppliers || []).map((s: any) => <tr key={idOf(s)}><td>{s.code} {s.name}</td><td>{quotedBy.has(idOf(s)) ? 'Received' : <span className="text-amber-700">Waiting</span>}</td></tr>)}</tbody></table>
            {waiting.length > 0 && rfq.status === 'OPEN' && <p className="px-3 py-2 text-xs text-[var(--erp-muted)]">{waiting.length} vendor(s) have not quoted yet.</p>}</div>}

          {tab === 'Award' && (rfq.status === 'AWARDED'
            ? <div className="form-grid">
                <Field label="Awarded To">{rfq.awardedSupplier?.code ? `${rfq.awardedSupplier.code} ${rfq.awardedSupplier.name}` : rfq.awardedSupplier?.name}</Field>
                <Field label="Purchase Order">{rfq.purchaseOrder ? <Link className="text-[var(--erp-accent)] hover:underline" href={`/dashboard/purchase/${idOf(rfq.purchaseOrder)}`}>{rfq.purchaseOrder.poNumber}</Link> : 'Waiting for approval'}</Field>
                <Field label="Remarks">{rfq.awardRemarks}</Field>
              </div>
            : <p className="text-sm text-[var(--erp-muted)]">{rfq.status === 'CANCELLED' ? 'This RFQ was cancelled.' : 'Not awarded yet. Award it from the Procurement screen once the quotes are in.'}</p>)}

          {tab === 'Requisitions' && ((rfq.indents || []).length
            ? <div className="table-wrap !shadow-none"><table className="text-left text-sm"><thead><tr><th>Purchase Req.</th><th>Status</th></tr></thead>
                <tbody>{rfq.indents.map((i: any) => <tr key={idOf(i)}><td><Link className="num text-[var(--erp-accent)] hover:underline" href={`/dashboard/procurement/indents/${idOf(i)}`}>{i.number}</Link></td><td>{String(i.status || '').replace(/_/g, ' ')}</td></tr>)}</tbody></table></div>
            : <p className="text-sm text-[var(--erp-muted)]">No requisition is linked.</p>)}
        </div>
      </Section>

      <Section title="Item Overview" open={open.items} onToggle={() => setOpen({ ...open, items: !open.items })}>
        <div className="table-wrap !shadow-none"><table className="text-left text-sm">
          <thead><tr><th>Item</th><th>Material</th><th>Short Text</th><th className="text-right">Quantity</th><th>Unit</th><th>Delivery Date</th><th>Requisition</th>
            {quotes.map((q, k) => <th key={k} className="text-right">{q.supplier?.code || q.supplier?.name}</th>)}</tr></thead>
          <tbody>{items.map((i, n) => {
            const prices = quotes.map(q => priceOf(q, i)).filter((x: any) => x != null && x > 0);
            const low = prices.length ? Math.min(...prices) : null;
            return <tr key={i.lineNo ?? n}>
              <td className="num">{i.lineNo}</td><td className="text-[var(--erp-accent)]">{i.product?.sku}</td><td className="max-w-[16rem] truncate">{i.product?.name}</td>
              <td className="text-right num">{fmtQty(i.quantity)}</td><td>{i.uom || i.product?.uom}</td><td className="num">{fmtDay(i.requiredBy)}</td>
              <td className="num">{(i.sources || []).map((s: any) => `${s.lineNo}`).join(', ') || '—'}</td>
              {quotes.map((q, k) => { const p = priceOf(q, i); return <td key={k} className={`text-right num ${p != null && p === low && quotes.length > 1 ? 'font-semibold text-emerald-700' : ''}`}>{p != null ? fmtInr(p) : '—'}</td>; })}
            </tr>;
          })}</tbody></table></div>
      </Section>
    </div>
  );
}
