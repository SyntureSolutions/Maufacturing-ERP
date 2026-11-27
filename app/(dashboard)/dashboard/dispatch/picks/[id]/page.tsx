'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Field, Section, fmtDay, fmtQty } from '@/components/common/ObjectPage';
import { Alert } from '@/components/ui';
import LineageDrawer from '@/components/common/LineageDrawer';
import { PdfButton, pdfUrl } from '@/components/workspace/PdfButton';

// Pick list as an object page. The warehouse picks the planned batches, enters what was really picked (a short pick needs a reason)
// and confirms. A delivery challan can only go out for confirmed, picked goods.

const TONE: Record<string, string> = { OPEN: 'critical', PICKED: 'positive', CANCELLED: 'negative' };
const WRITERS = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER', 'STAFF'];
const stamp = (d: any) => (d ? new Date(d).toLocaleString('en-GB') : '—');

export default function PickListObjectPage() {
  const { id } = useParams<{ id: string }>();
  const [pl, setPl] = useState<any | null>(null);
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({ lines: true });
  const [qty, setQty] = useState<Record<string, string>>({});
  const [why, setWhy] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch(`/api/pick-lists/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || 'Could not load the pick list.'); return; }
    setPl(data);
    setQty(Object.fromEntries((data.lines || []).map((l: any) => [l._id, String(data.status === 'OPEN' ? l.quantity : l.pickedQty)])));
  }, [id]);
  useEffect(() => { load(); fetch('/api/auth/session').then(r => r.json()).then(s => setRole(s?.user?.role || '')).catch(() => {}); }, [load]);

  const send = async (body: any, done: string) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/pick-lists/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The request failed.');
      setMsg({ ok: true, text: done });
      await load();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };

  if (error) return <div className="ui-page"><Alert ok={false}>{error}</Alert><Link href="/dashboard/dispatch" className="btn btn-secondary btn-sm w-fit">Back to dispatch</Link></div>;
  if (!pl) return <p className="text-sm text-[var(--erp-muted)]">Loading…</p>;

  const lines: any[] = pl.lines || [];
  const canWrite = WRITERS.includes(role);
  const isOpen = pl.status === 'OPEN';
  const planned = lines.reduce((a, l) => a + l.quantity, 0);
  const picked = lines.reduce((a, l) => a + (l.pickedQty || 0), 0);
  const out = lines.reduce((a, l) => a + (l.dispatchedQty || 0), 0);

  const confirm = () => {
    const body = lines.map(l => ({ lineId: l._id, pickedQty: qty[l._id] === '' ? undefined : Number(qty[l._id]), reason: why[l._id] || '' }));
    send({ action: 'confirm', lines: body }, `${pl.number} confirmed.`);
  };
  const cancel = () => {
    const reason = window.prompt(`Why is ${pl.number} being cancelled?`);
    if (reason) send({ action: 'cancel', reason }, `${pl.number} cancelled.`);
  };

  return (
    <div className="ui-page !gap-0">
      <style>{`@media print { body * { visibility: hidden; } .print-root, .print-root * { visibility: visible; } .print-root { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; } }`}</style>
      <div className="obj-toolbar print:hidden">
        <Link href="/dashboard/dispatch" className="btn btn-sm btn-secondary"><ArrowLeft className="h-4 w-4" /> Dispatch</Link>
        {canWrite && isOpen && <button className="btn btn-sm btn-primary" disabled={busy} onClick={confirm}>Confirm picked</button>}
        {canWrite && pl.status !== 'CANCELLED' && out === 0 && <button className="btn btn-sm btn-secondary" disabled={busy} onClick={cancel}>Cancel pick list</button>}
        <PdfButton url={pdfUrl.print('pick-list', pl._id)} title={`Pick list ${pl.number}`} />
        <LineageDrawer type="SALES_ORDER" id={pl.salesOrder} label="Order chain" />
        <span className="ml-auto text-[13px] text-[var(--erp-muted)]">Made {fmtDay(pl.createdAt)} by {pl.createdByName || '—'}</span>
      </div>
      {msg && <div className="print:hidden"><Alert ok={msg.ok}>{msg.text}</Alert></div>}

      <div className="obj-header print:hidden">
        <Field label="Pick List">{pl.number}</Field>
        <Field label="Sales Order"><Link className="text-[var(--erp-accent)] hover:underline" href={`/dashboard/order-desk/${pl.salesOrder}`}>{pl.soNumber}</Link></Field>
        <Field label="Customer">{pl.customerName}</Field>
        <Field label="Planned / Picked / Dispatched">{`${fmtQty(planned)} / ${fmtQty(picked)} / ${fmtQty(out)}`}</Field>
        <div className="field-row"><span className="field-label">Status</span><span className={`status-text status-text--${TONE[pl.status] || 'info'}`}>{pl.status}</span></div>
      </div>
      {pl.status === 'PICKED' && <div className="print:hidden"><Alert ok>Picked by {pl.pickedByName} on {stamp(pl.pickedAt)}. Delivery challans can now be issued for the picked goods{picked < planned ? ` (${fmtQty(picked)} of ${fmtQty(planned)} planned were picked)` : ''}.</Alert></div>}
      {pl.status === 'CANCELLED' && <div className="print:hidden"><Alert ok={false}>Cancelled{pl.cancelReason ? `: ${pl.cancelReason}` : ''}. These goods no longer count as picked.</Alert></div>}

      <Section title={`Lines to pick (${lines.length})`} open={open.lines} onToggle={() => setOpen({ lines: !open.lines })}>
        <div className="print-root">
          <div className="mb-2 hidden print:block"><b>Pick list {pl.number}</b> · SO {pl.soNumber} · {pl.customerName} · {fmtDay(pl.createdAt)}</div>
          <div className="table-wrap !shadow-none"><table className="text-left text-sm">
            <thead><tr><th>Item</th><th>Material</th><th>Batch</th><th>Location</th><th className="text-right">Plan</th><th className="text-right">Picked</th><th>Reason if short</th>{!isOpen && <th className="text-right">Dispatched</th>}</tr></thead>
            <tbody>{lines.map(l => {
              const short = isOpen ? Number(qty[l._id]) < l.quantity : l.pickedQty < l.quantity;
              return (
                <tr key={l._id}>
                  <td className="num">{l.lineNo}</td><td>{l.product?.sku ? `${l.product.sku} ${l.product.name}` : l.product?.name}</td><td className="num">{l.batchNumber}</td><td>{l.location || '—'}</td>
                  <td className="text-right num">{fmtQty(l.quantity)} {l.product?.uom}</td>
                  <td className="text-right">{isOpen && canWrite
                    ? <input type="number" min="0" max={l.quantity} step="any" className="input !w-24 text-right print:hidden" value={qty[l._id] ?? ''} onChange={e => setQty({ ...qty, [l._id]: e.target.value })} />
                    : <span className="num">{isOpen ? '' : fmtQty(l.pickedQty)}</span>}{isOpen && <span className="hidden print:inline">______</span>}</td>
                  <td>{isOpen && canWrite
                    ? (short ? <input className="input print:hidden" placeholder="Why less was picked" value={why[l._id] || ''} onChange={e => setWhy({ ...why, [l._id]: e.target.value })} /> : null)
                    : (l.shortReason || '—')}</td>
                  {!isOpen && <td className="text-right num">{fmtQty(l.dispatchedQty)}</td>}
                </tr>);
            })}</tbody></table></div>
          <div className="mt-6 hidden grid-cols-2 gap-8 text-sm print:grid"><div>Picked by: ______________________</div><div>Checked by: ______________________</div></div>
        </div>
      </Section>
    </div>
  );
}
