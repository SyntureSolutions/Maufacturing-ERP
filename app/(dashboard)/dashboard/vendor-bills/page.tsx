'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CHARGE_LABELS } from '@/lib/gst';
import { PageHeader, Alert } from '@/components/ui';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import LineageDrawer from '@/components/common/LineageDrawer';
import { useUrlTab } from '@/components/workspace/useUrlTab';

const field = 'input';
const btn = 'btn btn-sm';
const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function api(url: string, method = 'GET', body?: any) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function VendorBillsPage() {
  const [open, setOpen] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [poId, setPoId] = useState('');
  const [lines, setLines] = useState<Record<string, { quantity: string; rate: string }>>({});
  const [billNo, setBillNo] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [unregistered, setUnregistered] = useState(false);
  const [charges, setCharges] = useState<{ label: string; amount: string }[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState('');
  const [payFor, setPayFor] = useState<any | null>(null);
  const [requestId, setRequestId] = useState('');
  const [advances, setAdvances] = useState<any[]>([]);
  const [view, setView] = useState<'BILLS' | 'PAYABLES'>('BILLS');
  useUrlTab(['BILLS', 'PAYABLES'] as const, setView);
  const [pay, setPay] = useState<{ rows: any[]; totals: any } | null>(null);
  const [asOf, setAsOf] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', mode: 'BANK', utr: '', date: new Date().toISOString().slice(0, 10), narration: '' });
  const canPay = role === 'ADMIN' || role === 'FINANCE_MANAGER';

  const load = useCallback(async () => {
    const get = (u: string) => api(u).then(d => (Array.isArray(d) ? d : [])).catch(() => []);
    const [o, b] = await Promise.all([get('/api/vendor-bills/open'), get('/api/vendor-bills')]);
    setOpen(o); setBills(b);
  }, []);
  useEffect(() => { load(); }, [load]);
  const loadPayables = useCallback(async () => {
    const q = new URLSearchParams(); if (asOf) q.set('asOf', asOf); if (overdueOnly) q.set('overdue', '1');
    setPay(await api(`/api/vendor-bills/payables?${q}`).catch(() => ({ rows: [], totals: {} })));
  }, [asOf, overdueOnly]);
  useEffect(() => { if (view === 'PAYABLES') loadPayables(); }, [view, loadPayables]);
  useEffect(() => { api('/api/auth/session').then(s => setRole(s?.user?.role || s?.role || '')).catch(() => {}); }, []);

  const openPay = (b: any) => { setMsg(null); setPayFor(b); setAdvances([]); api(`/api/vendor-bills/advances?supplier=${b.supplier?._id || b.supplier}`).then(a => setAdvances(Array.isArray(a) ? a : [])).catch(() => {}); setRequestId(crypto.randomUUID()); setPayForm({ amount: String(b.outstanding), mode: 'BANK', utr: '', date: new Date().toISOString().slice(0, 10), narration: '' }); };
  const useAdvance = async (adv: any) => {
    setBusy(true);
    try {
      const r = await api(`/api/vendor-bills/${payFor._id}/apply-advance`, 'POST', { voucherId: adv._id });
      setMsg({ ok: true, text: `Applied ${inr(r.amount)} of advance ${r.advanceNumber} to ${r.billNumber}. The bill now owes ${inr(r.billOutstanding)}.` });
      setPayFor(null); await load();
    } catch (err: any) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };
  const submitPay = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const res = await fetch(`/api/vendor-bills/${payFor._id}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payForm, amount: Number(payForm.amount), requestId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Payment failed');
      setMsg({ ok: true, text: data.pendingApproval ? `Payment of ${inr(data.amount)} for ${data.billNumber} was sent for approval. ${data.message}` : `Paid ${inr(data.amount)} against ${data.billNumber} (voucher ${data.voucher?.number}).` });
      setPayFor(null); await load();
    } catch (err: any) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };

  const po = open.find(p => p._id === poId);
  const choose = (id: string) => {
    setPoId(id);
    const p = open.find(x => x._id === id);
    // default: bill everything received and not yet billed, at the order price
    setLines(Object.fromEntries((p?.items || []).filter((i: any) => i.unbilled > 0).map((i: any) => [i.product._id, { quantity: String(i.unbilled), rate: String(i.price) }])));
    setUnregistered(!!p && !p.supplier?.gstin);
    setCharges((p?.chargesLeft || []).map((c: any) => ({ label: c.label, amount: String(c.amount) })));
  };

  const totals = useMemo(() => {
    let base = 0, variance = 0;
    for (const i of po?.items || []) {
      const l = lines[i.product._id]; if (!l) continue;
      const q = Number(l.quantity) || 0, rate = Number(l.rate);
      base += q * (Number.isFinite(rate) ? rate : i.price);
      variance += q * ((Number.isFinite(rate) ? rate : i.price) - i.price);
    }
    const extra = charges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    return { base: Math.round((base + extra) * 100) / 100, charges: Math.round(extra * 100) / 100, variance: Math.round(variance * 100) / 100 };
  }, [po, lines, charges]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null); setBusy(true);
    try {
      const b = await api('/api/vendor-bills', 'POST', {
        poId, vendorBillNumber: billNo, billDate, unregistered,
        charges: charges.filter(c => c.label.trim() || c.amount.trim()).map(c => ({ label: c.label.trim(), amount: c.amount.trim() === '' ? 0 : Number(c.amount) })),
        lines: Object.entries(lines).filter(([, l]) => Number(l.quantity) > 0).map(([product, l]) => ({ product, quantity: Number(l.quantity), rate: l.rate === '' ? undefined : Number(l.rate) })),
      });
      setMsg({ ok: true, text: `Bill ${b.vendorBillNumber} booked as ${b.invoiceNumber} for ${inr(b.totalAmount)} (GST ${inr(b.totalCGST + b.totalSGST + b.totalIGST)}).` });
      setBillNo(''); setPoId(''); setLines({}); setCharges([]); await load();
    } catch (err: any) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };

  return (
    <div className="ui-page">
      <PageHeader title="Vendor Bills" subtitle="Book a supplier's bill against goods you have received. You can only bill goods that have passed inspection and have not been billed yet." />
      {msg && <Alert ok={msg.ok}>{msg.text}</Alert>}

      <form onSubmit={submit} className="card space-y-4">
        <h2 className="text-[15px] font-bold">Book a bill</h2>
        <select required className={`${field} md:w-[28rem]`} value={poId} onChange={e => choose(e.target.value)}>
          <option value="">Purchase order with goods received, not billed…</option>
          {open.map(p => <option key={p._id} value={p._id}>{p.poNumber} · {p.supplier?.name} · {p.items.reduce((s: number, i: any) => s + i.unbilled, 0)} units unbilled</option>)}
        </select>
        {!open.length && <p className="text-sm text-slate-500">No purchase order has goods waiting to be billed. Receive goods through a GRN first.</p>}

        {po && <>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="lbl">Supplier's bill number<input required className={field} value={billNo} onChange={e => setBillNo(e.target.value)} /></label>
            <label className="lbl">Bill date<input required type="date" max={new Date().toISOString().slice(0, 10)} className={field} value={billDate} onChange={e => setBillDate(e.target.value)} /></label>
            <label className="flex items-end gap-2 pb-2 text-sm font-semibold"><input type="checkbox" checked={unregistered} onChange={e => setUnregistered(e.target.checked)} />Unregistered supplier (no GST)</label>
          </div>
          {!po.supplier?.gstin && !unregistered && <Alert ok={false}>{po.supplier?.name} has no GSTIN. Add it on the supplier record, or tick "Unregistered supplier".</Alert>}
          <div className="table-wrap">
            <table className="text-left text-sm">
              <thead><tr><th>Item</th><th className="text-right">Ordered</th><th className="text-right">Received</th><th className="text-right">Already billed</th><th className="text-right">Not billed</th><th>On this bill</th><th>Rate</th></tr></thead>
              <tbody>{po.items.map((i: any) => {
                const l = lines[i.product._id];
                const diff = l && Number(l.rate) !== i.price && l.rate !== '' ? Number(l.rate) - i.price : 0;
                return (
                  <tr key={i.product._id}>
                    <td className="font-medium">{i.product.name} <span className="text-xs text-slate-400">{i.product.sku}</span></td>
                    <td className="text-right num">{i.ordered}</td><td className="text-right num">{i.received}{i.awaitingQc > 0 && <div className="text-[11px] font-medium text-amber-700">{i.awaitingQc} awaiting QC</div>}</td><td className="text-right num text-slate-500">{i.billed}</td><td className="text-right num font-semibold text-amber-700">{i.unbilled}</td>
                    <td>{i.unbilled > 0 ? <input type="number" min="0" max={i.unbilled} step="any" className={`${field} !w-28`} value={l?.quantity ?? ''} onChange={e => setLines({ ...lines, [i.product._id]: { quantity: e.target.value, rate: l?.rate ?? String(i.price) } })} /> : <span className="text-xs text-slate-400">fully billed</span>}</td>
                    <td>{i.unbilled > 0 && <div><input type="number" min="0" step="any" className={`${field} !w-28`} value={l?.rate ?? ''} onChange={e => setLines({ ...lines, [i.product._id]: { quantity: l?.quantity ?? '', rate: e.target.value } })} />
                      <div className={`mt-1 text-[11px] ${diff ? (diff > 0 ? 'text-red-600' : 'text-emerald-700') : 'text-slate-400'}`}>PO price {inr(i.price)}{diff ? ` · ${diff > 0 ? '+' : ''}${inr(diff)} per unit` : ''}</div></div>}</td>
                  </tr>);
              })}</tbody>
            </table>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold">Freight and other charges on the bill <span className="font-normal text-slate-400">· taxed with the goods, booked to Freight &amp; Charges Inward</span></div>
            {charges.map((c, n) => (
              <div key={n} className="flex flex-wrap items-center gap-2">
                <input list="bill-charge-labels" className={`${field} !w-56`} placeholder="e.g. Freight" value={c.label} onChange={e => setCharges(charges.map((x, k) => (k === n ? { ...x, label: e.target.value } : x)))} aria-label={`Charge ${n + 1}`} />
                <input type="number" min="0" step="0.01" className={`${field} !w-36`} value={c.amount} onChange={e => setCharges(charges.map((x, k) => (k === n ? { ...x, amount: e.target.value } : x)))} aria-label={`Charge ${n + 1} amount`} />
                <button type="button" className="text-xs font-semibold text-red-700" onClick={() => setCharges(charges.filter((_, k) => k !== n))}>Remove</button>
              </div>))}
            <button type="button" className="text-xs font-semibold text-blue-700" onClick={() => setCharges([...charges, { label: charges.length ? '' : 'Freight', amount: '' }])}>+ Add charge</button>
            <datalist id="bill-charge-labels">{CHARGE_LABELS.map(l => <option key={l} value={l} />)}</datalist>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>Taxable value <b className="num">{inr(totals.base)}</b>{totals.charges > 0 && <span className="ml-1 text-slate-500">(incl. charges {inr(totals.charges)})</span>}{totals.variance !== 0 && <span className={totals.variance > 0 ? 'ml-3 text-red-600' : 'ml-3 text-emerald-700'}>price difference vs PO {totals.variance > 0 ? '+' : ''}{inr(totals.variance)}</span>} <span className="text-slate-400">· GST is added when booked</span></span>
            <button className={`${btn} btn-primary`} disabled={busy}>Book bill</button>
          </div>
        </>}
      </form>

      <div className="flex gap-2">{([['BILLS', 'Booked bills'], ['PAYABLES', 'Accounts payable']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setView(k)} className={view === k ? 'tab tab-active' : 'tab'}>{l}</button>)}</div>

      {view === 'PAYABLES' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="lbl">As of<input type="date" className={field} value={asOf} max={new Date().toISOString().slice(0, 10)} onChange={e => setAsOf(e.target.value)} /></label>
            <label className="flex items-center gap-2 pb-2 text-sm font-semibold"><input type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)} />Overdue only</label>
            <a className={`${btn} btn-secondary mb-0.5`} href={`/api/vendor-bills/payables?format=csv${asOf ? `&asOf=${asOf}` : ''}${overdueOnly ? '&overdue=1' : ''}`}>Export CSV</a>
          </div>
          {pay && <p className="text-sm">Outstanding <b className="num">{inr(pay.totals.outstanding)}</b> · Overdue <b className="num text-red-700">{inr(pay.totals.overdue)}</b> · Waiting for approval <b className="num">{inr(pay.totals.pendingApproval)}</b></p>}
          <div className="table-wrap"><table className="text-left text-sm">
            <thead><tr><th>Bill</th><th>Supplier</th><th>For</th><th>Due</th><th className="text-right">Days overdue</th><th className="text-right">Outstanding</th><th>Approval</th><th /></tr></thead>
            <tbody>{(pay?.rows || []).map((b: any) => (
              <tr key={b._id}><td className="num font-semibold"><Link href={`/dashboard/vendor-bills/${b._id}`} className="font-bold text-[var(--erp-accent)] hover:underline">{b.invoiceNumber}</Link><div className="text-xs font-normal text-slate-500">{b.vendorBillNumber}</div></td><td>{b.supplier?.name}</td><td className="text-xs">{b.poNumber}{b.note ? <div className="text-slate-500">{b.note}</div> : null}</td>
                <td className="num whitespace-nowrap">{b.dueDate ? new Date(b.dueDate).toLocaleDateString('en-IN') : '—'}</td><td className={`text-right num ${b.overdueDays > 0 ? 'font-semibold text-red-700' : ''}`}>{b.overdueDays || '—'}</td><td className="text-right num font-semibold">{inr(b.outstanding)}</td>
                <td className="text-xs">{b.pendingApproval > 0 ? <span className="font-semibold text-amber-700">{inr(b.pendingApproval)} with {b.waitingFor.map((r: string) => r.replace(/_/g, ' ').toLowerCase()).join(' / ')}</span> : '—'}</td>
                <td>{canPay && <button className={`${btn} btn-secondary`} onClick={() => openPay(b)}>Release payment</button>}</td></tr>))}
              {pay && !pay.rows.length && <tr><td colSpan={8} className="p-8 text-center text-sm text-slate-400">Nothing is owed.</td></tr>}</tbody>
          </table></div>
        </div>)}

      {view === 'BILLS' && <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold">Booked bills</h2>
          {canPay && <a className={`${btn} btn-secondary`} href="/api/vendor-bills/payables?format=csv">Export payables (CSV)</a>}
        </div>
        <div className="table-wrap">
          <table className="text-left text-sm">
            <thead><tr><th>Bill</th><th>Supplier's no.</th><th>Supplier</th><th>PO</th><th>Date</th><th>Due</th><th className="text-right">Total</th><th className="text-right">Outstanding</th><th /></tr></thead>
            <tbody>{bills.map(b => (
              <tr key={b._id}><td className="num font-semibold"><Link href={`/dashboard/vendor-bills/${b._id}`} className="font-bold text-[var(--erp-accent)] hover:underline">{b.invoiceNumber}</Link></td><td className="num">{b.vendorBillNumber || '—'}</td><td>{b.supplier?.name}</td><td className="num">{b.poNumber || '—'}</td>
                <td className="num whitespace-nowrap">{new Date(b.date).toLocaleDateString('en-IN')}</td><td className="num whitespace-nowrap">{new Date(b.dueDate).toLocaleDateString('en-IN')}</td>
                <td className="text-right num">{inr(b.totalAmount)}</td><td className={`text-right num font-semibold ${b.outstanding > 0 ? '' : 'text-emerald-700'}`}>{b.outstanding > 0 ? inr(b.outstanding) : 'Paid'}</td><td className="text-right"><div className="flex flex-wrap justify-end gap-1.5"><LineageDrawer type="VENDOR_BILL" id={b._id} label="Chain" /><AttachmentDrawer entityType="VENDOR_BILL" entityId={b._id} label="Files" />{canPay && b.outstanding > 0 && <button className={`${btn} btn-secondary`} onClick={() => openPay(b)}>Release payment</button>}</div></td></tr>))}
              {!bills.length && <tr><td colSpan={9} className="p-8 text-center text-sm text-slate-400">No vendor bills booked yet.</td></tr>}</tbody>
          </table>
        </div>
      </div>}

      {payFor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => !busy && setPayFor(null)}>
          <form onSubmit={submitPay} onClick={e => e.stopPropagation()} className="card w-full max-w-md space-y-4">
            <div>
              <h2 className="text-[15px] font-bold">Release payment</h2>
              <p className="text-sm text-slate-500">{payFor.invoiceNumber} · {payFor.supplier?.name} · outstanding <b className="num">{inr(payFor.outstanding)}</b></p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="lbl">Amount<input required type="number" min="0.01" step="0.01" max={payFor.outstanding} className={field} value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} /></label>
              <label className="lbl">Mode<select className={field} value={payForm.mode} onChange={e => setPayForm({ ...payForm, mode: e.target.value })}><option value="BANK">Bank transfer</option><option value="CASH">Cash</option></select></label>
              {payForm.mode === 'BANK' && <label className="lbl sm:col-span-2">UTR / reference<input required className={field} value={payForm.utr} onChange={e => setPayForm({ ...payForm, utr: e.target.value })} /></label>}
              <label className="lbl">Payment date<input required type="date" max={new Date().toISOString().slice(0, 10)} className={field} value={payForm.date} onChange={e => setPayForm({ ...payForm, date: e.target.value })} /></label>
              <label className="lbl">Narration<input className={field} value={payForm.narration} onChange={e => setPayForm({ ...payForm, narration: e.target.value })} /></label>
            </div>
            {advances.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <div className="mb-2 font-semibold text-amber-900">Advances already paid to this supplier</div>
                {advances.map(a => (
                  <div key={a._id} className="flex items-center justify-between gap-2 py-1">
                    <span>{a.number} · <b className="num">{inr(a.remaining)}</b> left{a.utr ? ` · ${a.utr}` : ''}</span>
                    <button type="button" className={`${btn} btn-secondary`} disabled={busy} onClick={() => useAdvance(a)}>Apply to this bill</button>
                  </div>))}
              </div>)}
            <p className="text-xs text-slate-500">Large payments go to the approval inbox first; nothing is posted until they are approved.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className={`${btn} btn-secondary`} disabled={busy} onClick={() => setPayFor(null)}>Cancel</button>
              <button className={`${btn} btn-primary`} disabled={busy}>Release payment</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
