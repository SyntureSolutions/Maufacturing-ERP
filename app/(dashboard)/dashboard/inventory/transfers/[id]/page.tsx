'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Send, PackageCheck } from 'lucide-react';
import { Alert } from '@/components/ui';
import { Field, Section, StatusField, Tabs, fmtDay, fmtInr, fmtQty } from '@/components/common/ObjectPage';
import { PdfButton, pdfUrl } from '@/components/workspace/PdfButton';

// Stock transfer as an object page: toolbar (dispatch / receive), header strip, Header tabs and Item Overview.

const TONE: Record<string, 'positive' | 'negative' | 'critical' | 'info'> = { DRAFT: 'info', DISPATCHED: 'critical', RECEIVED: 'positive', CANCELLED: 'negative' };
const MOVERS = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER', 'STAFF'];
const HEADER_TABS = ['Transport', 'Dates', 'Texts'];

export default function StockTransferObjectPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({ header: true, items: true });
  const [headerTab, setHeaderTab] = useState(HEADER_TABS[0]);
  const [receiving, setReceiving] = useState<string[] | null>(null); // quantities typed per line while receiving

  const load = useCallback(async () => {
    const res = await fetch(`/api/inventory/transfers/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setDoc(data); else setError(data.error || 'Could not load the transfer.');
  }, [id]);
  useEffect(() => { load(); fetch('/api/auth/session').then(r => r.json()).then(s => setRole(s?.user?.role || '')).catch(() => {}); }, [load]);

  const act = async (action: 'DISPATCH' | 'RECEIVE') => {
    setMsg(null); setBusy(true);
    const body: any = { transferId: id, action };
    if (action === 'RECEIVE' && receiving) body.receivedItems = receiving.map(q => ({ receivedQuantity: Number(q) }));
    const res = await fetch('/api/inventory/transfers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: data.error || 'Not saved.' }); return; }
    setReceiving(null);
    setMsg({ ok: true, text: action === 'DISPATCH' ? 'Stock taken out of the source batches; the transfer is in transit.' : 'Receipt booked at the destination.' });
    load();
  };

  if (error) return <div className="ui-page"><Alert ok={false}>{error}</Alert><Link href="/dashboard/inventory?tab=transfers" className="btn btn-secondary btn-sm w-fit">Back to transfers</Link></div>;
  if (!doc) return <p className="text-sm text-[var(--erp-muted)]">Loading…</p>;

  const items: any[] = doc.items || [];
  const value = items.reduce((a, i) => a + (i.dispatchedQuantity || 0) * (i.unitCost || 0), 0);
  const mayMove = MOVERS.includes(role);

  return (
    <div className="ui-page !gap-0">
      <div className="obj-toolbar">
        <Link href="/dashboard/inventory?tab=transfers" className="btn btn-sm btn-secondary"><ArrowLeft className="h-4 w-4" /> Document Overview</Link>
        <PdfButton url={pdfUrl.print('stock-transfer', doc._id)} title={`Stock transfer ${doc.transferNumber}`} />
        {mayMove && doc.status === 'DRAFT' && <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => act('DISPATCH')}><Send className="h-4 w-4" /> Dispatch</button>}
        {mayMove && doc.status === 'DISPATCHED' && !receiving && <button className="btn btn-sm btn-primary" onClick={() => setReceiving(items.map(i => String(i.dispatchedQuantity)))}><PackageCheck className="h-4 w-4" /> Receive</button>}
        {receiving && <>
          <button className="btn btn-sm btn-success" disabled={busy} onClick={() => act('RECEIVE')}>Post receipt</button>
          <button className="btn btn-sm btn-secondary" onClick={() => setReceiving(null)}>Cancel</button></>}
        <span className="ml-auto text-[13px] text-[var(--erp-muted)]">Value in transit {fmtInr(value)}</span>
      </div>

      <div className="obj-header">
        <Field label="Movement">Transfer between locations</Field>
        <Field label="Transfer">{doc.transferNumber}</Field>
        <Field label="From → To">{`${doc.fromWarehouse} → ${doc.toWarehouse}`}</Field>
        <Field label="Created">{fmtDay(doc.createdAt)}</Field>
        <StatusField label="Status" tone={TONE[doc.status] || 'info'}>{doc.status === 'DISPATCHED' ? 'IN TRANSIT' : doc.status}</StatusField>
      </div>
      {msg && <div className="mt-3"><Alert ok={msg.ok}>{msg.text}</Alert></div>}
      {receiving && <div className="mt-3 message-strip message-strip--info">Enter the quantity that arrived on each line (it cannot be more than was sent; any difference is recorded as a shortage), then post the receipt.</div>}

      <Section title="Header" open={open.header} onToggle={() => setOpen({ ...open, header: !open.header })}>
        <Tabs tabs={HEADER_TABS} active={headerTab} onChange={setHeaderTab} />
        <div className="obj-pane">
          {headerTab === 'Transport' && <div className="form-grid">
            <Field label="Carrier">{doc.carrier}</Field><Field label="Vehicle">{doc.vehicleNumber}</Field>
            <Field label="Driver">{doc.driverName}</Field><Field label="Driver Phone">{doc.driverPhone}</Field>
            <Field label="E-Way Bill">{doc.ewayBillNumber}</Field>
          </div>}
          {headerTab === 'Dates' && <div className="form-grid">
            <Field label="Created">{`${fmtDay(doc.createdAt)} by ${doc.createdByName || '—'}`}</Field>
            <Field label="Dispatched">{doc.dispatchDate ? fmtDay(doc.dispatchDate) : ''}</Field>
            <Field label="Received">{doc.deliveryDate ? `${fmtDay(doc.deliveryDate)}${doc.receivedByName ? ` by ${doc.receivedByName}` : ''}` : ''}</Field>
          </div>}
          {headerTab === 'Texts' && <div className="min-h-20 whitespace-pre-wrap border border-[var(--erp-line)] p-3 text-sm">{doc.notes || <span className="text-[var(--erp-muted)]">No note.</span>}</div>}
        </div>
      </Section>

      <Section title="Item Overview" open={open.items} onToggle={() => setOpen({ ...open, items: !open.items })}>
        <div className="table-wrap !shadow-none"><table className="text-left text-sm">
          <thead><tr><th>Line</th><th>Material</th><th>Short Text</th><th>Batch</th><th>Source Location</th><th className="text-right">Requested</th><th className="text-right">Sent</th><th className="text-right">Received</th><th className="text-right">Shortage</th><th className="text-right">Unit Cost</th><th className="text-right">Value</th></tr></thead>
          <tbody>{items.map((i, n) => (
            <tr key={n}>
              <td className="num">{(n + 1) * 10}</td>
              <td className="text-[var(--erp-accent)]">{i.productSku || i.batch?.product?.sku}</td>
              <td className="max-w-[14rem] truncate">{i.productName}</td>
              <td className="num">{i.batchNumber}</td>
              <td className="num">{i.batch?.location || i.batch?.store || '—'}</td>
              <td className="text-right num">{fmtQty(i.requestedQuantity)}</td>
              <td className="text-right num">{fmtQty(i.dispatchedQuantity)}</td>
              <td className="text-right num">{receiving
                ? <input type="number" min="0" max={i.dispatchedQuantity} step="any" className="input !h-7 !w-24 text-right" value={receiving[n]} onChange={e => setReceiving(receiving.map((q, k) => (k === n ? e.target.value : q)))} />
                : i.receivedQuantity != null ? fmtQty(i.receivedQuantity) : '—'}</td>
              <td className={`text-right num ${i.shortageQuantity > 0 ? 'text-[var(--erp-negative)] font-semibold' : ''}`}>{fmtQty(i.shortageQuantity)}</td>
              <td className="text-right num">{fmtInr(i.unitCost)}</td>
              <td className="text-right num">{fmtInr((i.dispatchedQuantity || 0) * (i.unitCost || 0))}</td>
            </tr>))}</tbody></table></div>
      </Section>
    </div>
  );
}
