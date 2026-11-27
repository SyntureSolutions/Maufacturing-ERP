'use client';

import { useEffect, useState } from 'react';

// Scrap and by-products of a work order, as its BOM lists them: expected for what was made, and the actual quantities
// recorded once when the work is done (0 allowed). The work order cannot be completed until they are recorded.

const KIND: Record<string, [string, string]> = { SCRAP: ['Scrap', 'bg-slate-100 text-slate-700'], BY_PRODUCT: ['By-product', 'bg-blue-50 text-blue-800'] };
const n = (v: number) => String(Math.round((v || 0) * 1000) / 1000);

export default function OtherOutputsPanel({ workOrder, onDone }: { workOrder: { _id: string; status: string; woNumber: string; fgReceivedQty?: number }; onDone?: (msg: string) => void }) {
  const [data, setData] = useState<any | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let gone = false;
    setData(null); setError('');
    fetch(`/api/production/${workOrder._id}/outputs`, { cache: 'no-store' })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load scrap and by-products.'); return d; })
      .then(d => { if (!gone) { setData(d); setQty(Object.fromEntries(d.lines.map((l: any) => [l.product, d.recorded ? '' : n(l.expectedQty)]))); } })
      .catch(e => { if (!gone) setError(e.message); });
    return () => { gone = true; };
  }, [workOrder._id, workOrder.status, workOrder.fgReceivedQty]);

  if (error) return <div className="card text-sm text-red-700">{error}</div>;
  if (!data || !data.lines.length) return null;

  const record = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/production/${workOrder._id}/outputs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: data.lines.map((l: any) => ({ product: l.product, quantity: qty[l.product] })), notes }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not record.');
      setData(d);
      onDone?.('Scrap and by-products recorded. Scrap is in the SCRAP store; by-products wait for QC in the FG store.');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const canRecord = !data.recorded && workOrder.status === 'IN_PROGRESS';
  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-bold">Scrap &amp; by-products</h3>
        <span className="text-xs text-slate-500">
          {data.recorded
            ? <>Recorded by {data.recordedBy}{data.recordedAt ? ` on ${new Date(data.recordedAt).toLocaleString('en-IN')}` : ''}</>
            : <>Expected for {n(data.basis)} {data.basisIs === 'MADE' ? 'made so far' : 'planned'} · must be recorded before the work order is completed</>}
        </span>
      </div>
      <div className="table-wrap">
        <table className="w-full text-left text-sm">
          <thead><tr><th className="p-2">Item</th><th>Type</th><th className="text-right">Expected</th><th className="text-right">Actual</th><th className="text-right">Difference</th><th>Batch</th></tr></thead>
          <tbody>{data.lines.map((l: any) => {
            const actual = data.recorded ? l.actualQty : qty[l.product] === '' ? NaN : Number(qty[l.product]);
            const diff = Number.isFinite(actual) ? actual - l.expectedQty : NaN;
            const pct = l.expectedQty > 0 && Number.isFinite(diff) ? (diff / l.expectedQty) * 100 : 0;
            const [label, tone] = KIND[l.kind] || [l.kind, ''];
            return (
              <tr key={l.product} className="border-t border-slate-100">
                <td className="p-2">{l.name} <span className="text-xs text-slate-400">{l.sku}</span></td>
                <td><span className={`badge ${tone}`}>{label}</span></td>
                <td className="text-right">{n(l.expectedQty)} {l.uom}</td>
                <td className="text-right">{data.recorded ? <b>{n(l.actualQty)} {l.uom}</b> : (
                  <input type="number" min="0" step="any" className="input w-28 text-right" value={qty[l.product] ?? ''} onChange={e => setQty({ ...qty, [l.product]: e.target.value })} aria-label={`Actual ${l.name}`} disabled={!canRecord} />)}</td>
                <td className={`text-right text-xs font-semibold ${Math.abs(pct) > 10 ? 'text-amber-700' : 'text-slate-500'}`}>{Number.isFinite(diff) && (diff !== 0 || data.recorded) ? `${diff > 0 ? '+' : ''}${n(diff)} (${pct > 0 ? '+' : ''}${Math.round(pct)}%)` : ''}</td>
                <td className="text-xs text-slate-500">{l.batchNumber || ''}</td>
              </tr>);
          })}</tbody>
        </table>
      </div>
      {data.recorded ? (data.notes && <p className="text-sm text-slate-600">{data.notes}</p>) : canRecord ? (
        <div className="flex flex-wrap items-center gap-2">
          <input className="input flex-1 min-w-[16rem]" placeholder="Notes (why scrap was high or low…)" value={notes} onChange={e => setNotes(e.target.value)} />
          <button className="btn btn-sm btn-primary" onClick={record} disabled={busy}>{busy ? 'Recording…' : 'Record scrap & by-products'}</button>
        </div>
      ) : <p className="text-xs text-slate-500">Start the work order to record what it gave.</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
