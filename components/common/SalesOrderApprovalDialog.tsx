'use client';

import { useEffect, useState } from 'react';

// Approving a sales order: the approver sees each line against its minimum selling price (MSP) and the customer's
// credit position, and gives a reason when accepting a price below MSP or going over the credit limit.
const MSP_ROLES = ['ADMIN', 'MANAGER'];
const CREDIT_ROLES = ['ADMIN', 'MANAGER', 'FINANCE_MANAGER'];
const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function SalesOrderApprovalDialog({ order, role, onClose, onDone }: {
  order: { _id: string; soNumber?: string };
  role: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [view, setView] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mspReason, setMspReason] = useState('');
  const [creditReason, setCreditReason] = useState('');

  useEffect(() => {
    fetch(`/api/sales-orders/${order._id}/approval`).then(async r => {
      const d = await r.json().catch(() => ({}));
      if (r.ok) setView(d); else setError(d.error || 'Could not load the order.');
    }).catch(() => setError('Could not reach the server.'));
  }, [order._id]);

  const overCredit = !!view?.credit?.over;
  const mayMsp = MSP_ROLES.includes(role), mayCredit = CREDIT_ROLES.includes(role);
  const blocked = (view?.belowMsp && !mayMsp) || (overCredit && !mayCredit);

  const approve = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/sales-orders/${order._id}/approval`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approveBelowMsp: !!view?.belowMsp, mspReason, bypassCreditCheck: overCredit, bypassReason: creditReason }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || 'The order was not approved.'); return; }
      onDone(d.allocationWarning ? `${d.message} ${d.allocationWarning}` : d.message || 'Sales order approved.');
    } catch { setError('Could not reach the server. The order was not approved.'); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="card max-h-[90vh] w-full max-w-3xl space-y-3 overflow-y-auto">
        <div className="flex items-start justify-between">
          <div><h2 className="text-[15px] font-bold">Approve {view?.soNumber || order.soNumber}</h2>
            <p className="text-sm text-slate-500">Check prices against the minimum selling price and the customer&apos;s credit before approving. Approval reserves stock.</p></div>
          <button className="text-sm font-bold text-slate-500" onClick={onClose}>Close</button>
        </div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {!view && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {view && <>
          <div className="table-wrap"><table className="text-left text-sm">
            <thead><tr><th>Line</th><th>Item</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">MSP</th><th className="text-right">Margin</th><th /></tr></thead>
            <tbody>{view.lines.map((l: any) => (
              <tr key={l.lineNo} className={l.belowMsp ? 'bg-red-50' : ''}>
                <td className="num">{l.lineNo}</td><td><b>{l.sku}</b> <span className="text-xs">{l.name}</span></td>
                <td className="text-right num">{l.quantity}</td><td className="text-right num">{inr(l.unitPrice)}</td>
                <td className="text-right num">{l.minSellingPrice !== undefined ? inr(l.minSellingPrice) : '—'}</td>
                <td className="text-right num">{l.marginPercent !== undefined ? `${l.marginPercent}%` : '—'}</td>
                <td className="text-xs font-semibold text-red-700">{l.belowMsp ? `Below MSP by ${inr(l.shortfallVsMsp)}` : ''}</td>
              </tr>))}</tbody></table></div>

          {view.credit && (
            <div className={`rounded-xl border p-3 text-sm ${overCredit ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}>
              {view.credit.limited
                ? <>Credit limit <b>{inr(view.credit.limit)}</b> · unpaid invoices {inr(view.credit.receivable)} · open orders {inr(view.credit.openOrders)} · with this order <b>{inr(view.credit.newTotal)}</b>{overCredit && <span className="ml-1 font-semibold text-red-700">— over the limit</span>}</>
                : 'No credit limit is set for this customer.'}
            </div>)}

          {view.belowMsp && (
            <label className="lbl">Why is the price below MSP accepted? {mayMsp ? '' : '(a Manager or Admin must approve this order)'}
              <input className="input" disabled={!mayMsp} placeholder="At least 10 characters" value={mspReason} onChange={e => setMspReason(e.target.value)} /></label>)}
          {overCredit && (
            <label className="lbl">Reason for going over the credit limit {mayCredit ? '' : '(an Admin, Manager or Finance Manager must approve this order)'}
              <input className="input" disabled={!mayCredit} value={creditReason} onChange={e => setCreditReason(e.target.value)} /></label>)}

          <div className="flex justify-end gap-2">
            <button className="btn btn-sm btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-sm btn-primary" disabled={busy || blocked} onClick={approve}>Approve</button>
          </div>
        </>}
      </div>
    </div>
  );
}
