'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Alert } from '@/components/ui';
import LineageDrawer from '@/components/common/LineageDrawer';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import { Field, Section, StatusField, Tabs, fmtDay, fmtInr, fmtQty } from '@/components/common/ObjectPage';
import { PdfButton, pdfUrl } from '@/components/workspace/PdfButton';

// Purchase requisition (indent) as an object page: header strip, Header tabs, Item Overview and Item Detail.

const TONE: Record<string, 'positive' | 'negative' | 'critical' | 'info'> = { PENDING: 'critical', APPROVED: 'positive', REJECTED: 'negative', RFQ_CREATED: 'info' };
const SOURCE: Record<string, string> = { MRP: 'From MRP run', MRN_SHORTFALL: 'Material requisition shortfall', MANUAL: 'Manual' };
const APPROVERS = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER'];
const HEADER_TABS = ['Texts', 'Approval Details', 'Reference'];
const ITEM_TABS = ['Material Data', 'Quantities/Dates', 'Valuation', 'Source of Supply', 'Purchase Orders'];

export default function RequisitionObjectPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [role, setRole] = useState('');
  const [open, setOpen] = useState({ header: true, items: true, detail: true });
  const [headerTab, setHeaderTab] = useState(HEADER_TABS[0]);
  const [itemTab, setItemTab] = useState(ITEM_TABS[0]);
  const [lineIdx, setLineIdx] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/purchase-indents/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setDoc(data); else setError(data.error || 'Could not load the requisition.');
  }, [id]);
  useEffect(() => { load(); fetch('/api/auth/session').then(r => r.json()).then(s => setRole(s?.user?.role || '')).catch(() => {}); }, [load]);

  const decide = async (action: 'approve' | 'reject') => {
    setMsg(null);
    const res = await fetch(`/api/purchase-indents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? { ok: true, text: action === 'approve' ? 'Requisition approved.' : 'Requisition rejected.' } : { ok: false, text: data.error || 'Not saved.' });
    if (res.ok) load();
  };

  if (error) return <div className="ui-page"><Alert ok={false}>{error}</Alert><Link href="/dashboard/procurement" className="btn btn-secondary btn-sm w-fit">Back to procurement</Link></div>;
  if (!doc) return <p className="text-sm text-[var(--erp-muted)]">Loading…</p>;

  const items: any[] = doc.items || [];
  const line = items[Math.min(lineIdx, items.length - 1)];
  const p = line?.product || {};
  const price = (i: any) => Number(i.product?.purchasePrice) || 0;
  const total = items.reduce((a, i) => a + price(i) * i.quantity, 0);
  const lineOrders = (doc.orderedBy || []).filter((o: any) => o.reqLine === line?.lineNo);

  return (
    <div className="ui-page !gap-0">
      <div className="obj-toolbar">
        <Link href="/dashboard/procurement" className="btn btn-sm btn-secondary"><ArrowLeft className="h-4 w-4" /> Document Overview</Link>
        {doc.status === 'PENDING' && APPROVERS.includes(role) && <>
          <button className="btn btn-sm btn-success" onClick={() => decide('approve')}><Check className="h-4 w-4" /> Approve</button>
          <button className="btn btn-sm btn-danger" onClick={() => decide('reject')}><X className="h-4 w-4" /> Reject</button></>}
        <PdfButton url={pdfUrl.print('purchase-requisition', doc._id)} title={`Purchase requisition ${doc.number}`} />
        <LineageDrawer type="PURCHASE_INDENT" id={doc._id} label="Document chain" />
        <AttachmentDrawer entityType="PURCHASE_INDENT" entityId={doc._id} label="Attachments" />
        <span className="ml-auto text-[13px] text-[var(--erp-muted)]">Total value {fmtInr(total)}</span>
      </div>

      <div className="obj-header">
        <Field label="Document Type">Purchase Requisition</Field>
        <Field label="Requisition">{doc.number}</Field>
        <Field label="Source">{SOURCE[doc.source] || doc.source}</Field>
        <Field label="Created">{fmtDay(doc.createdAt)}</Field>
        <StatusField label="Status" tone={TONE[doc.status] || 'info'}>{String(doc.status).replace(/_/g, ' ')}</StatusField>
      </div>
      {msg && <div className="mt-3"><Alert ok={msg.ok}>{msg.text}</Alert></div>}

      <Section title="Header" open={open.header} onToggle={() => setOpen({ ...open, header: !open.header })}>
        <Tabs tabs={HEADER_TABS} active={headerTab} onChange={setHeaderTab} />
        <div className="obj-pane">
          {headerTab === 'Texts' && <div className="grid gap-3 md:grid-cols-[12rem_1fr]">
            <div className="border border-[var(--erp-line)] text-sm"><div className="bg-[var(--erp-table-head)] px-3 py-1.5">Header Texts</div><div className="px-3 py-1.5 text-[var(--erp-accent)]">Header Note</div></div>
            <div className="min-h-24 whitespace-pre-wrap border border-[var(--erp-line)] p-3 text-sm">{doc.remarks || <span className="text-[var(--erp-muted)]">No header note.</span>}</div>
          </div>}
          {headerTab === 'Approval Details' && <div className="table-wrap !shadow-none"><table className="text-left text-sm">
            <thead><tr><th>Step</th><th>Status</th><th>Requested By</th><th>Processor</th></tr></thead>
            <tbody><tr><td>Release</td><td><span className={`status-text status-text--${TONE[doc.status] || 'info'}`}>{doc.status === 'PENDING' ? 'Waiting for approval' : String(doc.status).replace(/_/g, ' ')}</span></td>
              <td>{doc.requestedBy || '—'}</td><td>{doc.approvedBy || '—'}</td></tr></tbody></table></div>}
          {headerTab === 'Reference' && <div className="form-grid">
            <Field label="Category">{doc.category}</Field>
            <Field label="For Sales Order">{doc.salesOrder ? `${doc.salesOrder.soNumber} · ${doc.salesOrder.customerName || ''}` : 'Stock'}</Field>
            <Field label="RFQ">{doc.rfq ? `${doc.rfq.number} (${String(doc.rfq.status).toLowerCase()})` : ''}</Field>
            <Field label="MRP Run">{doc.mrpRun ? 'Yes (see document chain)' : 'No'}</Field>
          </div>}
        </div>
      </Section>

      <Section title="Item Overview" open={open.items} onToggle={() => setOpen({ ...open, items: !open.items })}>
        <div className="table-wrap !shadow-none"><table className="text-left text-sm">
          <thead><tr><th>Item</th><th>Material</th><th>Short Text</th><th className="text-right">Quantity</th><th>Unit</th><th>Deliv. Date</th><th className="text-right">Ordered</th><th className="text-right">Open</th><th>Des. Supplier</th><th className="text-right">Valuation Price</th></tr></thead>
          <tbody>{items.map((i, n) => (
            <tr key={i.lineNo ?? n} onClick={() => setLineIdx(n)} className={`cursor-pointer ${n === lineIdx ? '!bg-[var(--erp-accent-soft)]' : ''}`}>
              <td className="num">{i.lineNo ?? '—'}</td><td className="text-[var(--erp-accent)]">{i.product?.sku}</td><td className="max-w-[16rem] truncate">{i.product?.name}</td>
              <td className="text-right num">{fmtQty(i.quantity)}</td><td>{i.uom || i.product?.uom}</td><td className="num">{fmtDay(i.requiredBy)}</td>
              <td className="text-right num">{fmtQty(i.orderedQty)}</td><td className="text-right num">{fmtQty(i.openQty)}</td>
              <td>{i.preferredSupplier?.name || '—'}</td><td className="text-right num">{price(i) ? fmtInr(price(i)) : '—'}</td>
            </tr>))}</tbody></table></div>
      </Section>

      {line && <Section title="Item Detail" open={open.detail} onToggle={() => setOpen({ ...open, detail: !open.detail })}>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 text-sm">
          <span className="text-[var(--erp-muted)]">Item:</span>
          <select className="input !w-auto min-w-[18rem]" value={lineIdx} onChange={e => setLineIdx(Number(e.target.value))}>
            {items.map((i, n) => <option key={n} value={n}>{n + 1} [ {i.lineNo ?? '—'} ] {i.product?.sku} , {i.product?.name}</option>)}
          </select>
          <button className="btn btn-sm btn-secondary" disabled={lineIdx === 0} onClick={() => setLineIdx(lineIdx - 1)} aria-label="Previous item"><ChevronUp className="h-4 w-4" /></button>
          <button className="btn btn-sm btn-secondary" disabled={lineIdx >= items.length - 1} onClick={() => setLineIdx(lineIdx + 1)} aria-label="Next item"><ChevronDown className="h-4 w-4" /></button>
        </div>
        <Tabs tabs={ITEM_TABS} active={itemTab} onChange={setItemTab} />
        <div className="obj-pane">
          {itemTab === 'Material Data' && <div className="form-grid">
            <Field label="Material">{p.sku}</Field><Field label="Short Text">{p.name}</Field>
            <Field label="Material Type">{String(p.productType || '').replace(/_/g, ' ')}</Field><Field label="HSN Code">{p.hsnCode}</Field>
          </div>}
          {itemTab === 'Quantities/Dates' && <div className="form-grid">
            <Field label="Quantity">{`${fmtQty(line.quantity)} ${line.uom || p.uom || ''}`}</Field><Field label="Delivery Date">{fmtDay(line.requiredBy)}</Field>
            <Field label="Quantity Ordered">{fmtQty(line.orderedQty)}</Field><Field label="Request Date">{fmtDay(doc.createdAt)}</Field>
            <Field label="Open Quantity">{fmtQty(line.openQty)}</Field><Field label="Release Date">{doc.status === 'PENDING' ? '' : fmtDay(doc.updatedAt)}</Field>
          </div>}
          {itemTab === 'Valuation' && <div className="form-grid">
            <Field label="Valuation Price">{price(line) ? `${fmtInr(price(line))} / 1 ${p.uom || ''}` : ''}</Field>
            <Field label="Total Value">{price(line) ? fmtInr(price(line) * line.quantity) : ''}</Field>
          </div>}
          {itemTab === 'Source of Supply' && <div className="form-grid">
            <Field label="Desired Supplier">{line.preferredSupplier ? `${line.preferredSupplier.code || ''} ${line.preferredSupplier.name}` : ''}</Field>
            <Field label="RFQ">{doc.rfq?.number}</Field>
          </div>}
          {itemTab === 'Purchase Orders' && (lineOrders.length
            ? <div className="table-wrap !shadow-none"><table className="text-left text-sm"><thead><tr><th>Purchase Order</th><th>Item</th><th>Supplier</th><th className="text-right">Quantity</th><th>Status</th></tr></thead>
                <tbody>{lineOrders.map((o: any, k: number) => <tr key={k}><td><Link href={`/dashboard/purchase/${o.poId}`} className="text-[var(--erp-accent)] hover:underline">{o.poNumber}</Link></td><td className="num">{o.poLine}</td><td>{o.supplier}</td><td className="text-right num">{fmtQty(o.quantity)}</td><td>{String(o.status).replace(/_/g, ' ')}</td></tr>)}</tbody></table></div>
            : <p className="text-sm text-[var(--erp-muted)]">No purchase order orders this line yet.</p>)}
        </div>
      </Section>}
    </div>
  );
}
