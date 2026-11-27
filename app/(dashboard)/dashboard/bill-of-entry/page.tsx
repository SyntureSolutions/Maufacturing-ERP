'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, Alert } from '@/components/ui';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import LineageDrawer from '@/components/common/LineageDrawer';

const field = 'input';
const btn = 'btn btn-sm';
const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

async function api(url: string, method = 'GET', body?: any) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const blank = { number: '', date: today(), port: '', grnId: '', assessableValue: '', bcd: '', sws: '', igst: '', otherCharges: '', mode: 'BANK', paymentRef: '' };

export default function BillOfEntryPage() {
  const [boes, setBoes] = useState<any[]>([]);
  const [grns, setGrns] = useState<any[]>([]);
  const [form, setForm] = useState<any>(blank);
  const [role, setRole] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const canWrite = ['ADMIN', 'FINANCE_MANAGER', 'SUPPLY_CHAIN_MANAGER'].includes(role);
  const load = useCallback(async () => {
    const get = (u: string) => api(u).then(d => (Array.isArray(d) ? d : [])).catch(() => []);
    const [b, g] = await Promise.all([get('/api/bill-of-entry'), get('/api/grn')]);
    setBoes(b); setGrns(g);
  }, []);
  useEffect(() => { load(); api('/api/auth/session').then(s => setRole(s?.user?.role || '')).catch(() => {}); }, [load]);

  // receipts that have been through inspection and have no live Bill of Entry yet
  const free = useMemo(() => {
    const used = new Set(boes.filter(b => b.status === 'POSTED').map(b => String(b.grn)));
    return grns.filter(g => !used.has(String(g._id)) && g.items.some((i: any) => i.inspection !== 'PENDING'));
  }, [grns, boes]);

  const num = (k: string) => Number(form[k]) || 0;
  const duty = num('bcd') + num('sws') + num('otherCharges'), total = duty + num('igst');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null); setBusy(true);
    try {
      const b = await api('/api/bill-of-entry', 'POST', { ...form, assessableValue: num('assessableValue'), bcd: num('bcd'), sws: num('sws'), igst: num('igst'), otherCharges: num('otherCharges') });
      setMsg({ ok: true, text: `Bill of Entry ${b.number} recorded: ${inr(b.dutyForCost)} added to the goods' cost, ${inr(b.igst)} claimed as input tax, ${inr(b.totalPaid)} paid.` });
      setForm(blank); await load();
    } catch (err: any) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };
  const cancel = async (b: any) => {
    const reason = window.prompt(`Why is Bill of Entry ${b.number} being cancelled?`);
    if (!reason) return;
    setMsg(null);
    try { await api(`/api/bill-of-entry/${b._id}/cancel`, 'POST', { reason }); setMsg({ ok: true, text: `${b.number} cancelled. The entry was reversed and the goods' cost restored.` }); await load(); } catch (err: any) { setMsg({ ok: false, text: err.message }); }
  };

  return (
    <div className="ui-page">
      <PageHeader title="Bill of Entry (Imports)" subtitle="Record the customs Bill of Entry for imported goods received. Duty and charges become part of the goods' cost; IGST is claimed as input tax." />
      {msg && <Alert ok={msg.ok}>{msg.text}</Alert>}

      {canWrite && (
        <form onSubmit={submit} className="card space-y-4">
          <h2 className="text-[15px] font-bold">Record a Bill of Entry</h2>
          <label className="lbl md:w-[32rem]">Goods received (inspected)<select required className={field} value={form.grnId} onChange={e => setForm({ ...form, grnId: e.target.value })}>
            <option value="">Choose the goods receipt…</option>{free.map(g => <option key={g._id} value={g._id}>{g.number} · PO {g.poNumber} · {g.supplier?.name}</option>)}</select></label>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="lbl">Bill of Entry no.<input required className={field} value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} /></label>
            <label className="lbl">Date<input required type="date" max={today()} className={field} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
            <label className="lbl">Port of import<input required className={field} value={form.port} onChange={e => setForm({ ...form, port: e.target.value })} /></label>
            <label className="lbl">Assessable value (₹)<input type="number" min="0" step="0.01" className={field} value={form.assessableValue} onChange={e => setForm({ ...form, assessableValue: e.target.value })} /></label>
            <label className="lbl">Customs duty (BCD)<input type="number" min="0" step="0.01" className={field} value={form.bcd} onChange={e => setForm({ ...form, bcd: e.target.value })} /></label>
            <label className="lbl">Surcharge (SWS)<input type="number" min="0" step="0.01" className={field} value={form.sws} onChange={e => setForm({ ...form, sws: e.target.value })} /></label>
            <label className="lbl">IGST<input type="number" min="0" step="0.01" className={field} value={form.igst} onChange={e => setForm({ ...form, igst: e.target.value })} /></label>
            <label className="lbl">Other charges (CHA, port)<input type="number" min="0" step="0.01" className={field} value={form.otherCharges} onChange={e => setForm({ ...form, otherCharges: e.target.value })} /></label>
            <label className="lbl">Paid by<select className={field} value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}><option value="BANK">Bank</option><option value="CASH">Cash</option></select></label>
            {form.mode === 'BANK' && <label className="lbl md:col-span-2">Challan / UTR<input required className={field} value={form.paymentRef} onChange={e => setForm({ ...form, paymentRef: e.target.value })} /></label>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>Added to goods&apos; cost <b className="num">{inr(duty)}</b> · Input tax <b className="num">{inr(num('igst'))}</b> · Total paid <b className="num">{inr(total)}</b></span>
            <button className={`${btn} btn-primary`} disabled={busy || !form.grnId || total <= 0}>Record Bill of Entry</button>
          </div>
        </form>)}

      <div className="space-y-2">
        <h2 className="text-[15px] font-bold">Recorded Bills of Entry</h2>
        <div className="table-wrap">
          <table className="text-left text-sm">
            <thead><tr><th>Bill of Entry</th><th>Port</th><th>Goods received</th><th>Date</th><th className="text-right">Duty & charges</th><th className="text-right">IGST</th><th className="text-right">Paid</th><th /></tr></thead>
            <tbody>
              {boes.map(b => (
                <tr key={b._id} className={b.status === 'CANCELLED' ? 'text-slate-400 line-through' : ''}>
                  <td className="num font-semibold">{b.number}{b.status === 'CANCELLED' && <span className="ml-2 text-[11px] no-underline">cancelled</span>}</td><td>{b.port}</td><td className="num">{b.grnNumber} <span className="text-xs text-slate-500">PO {b.poNumber}</span></td>
                  <td className="num whitespace-nowrap">{new Date(b.date).toLocaleDateString('en-IN')}</td><td className="text-right num">{inr(b.dutyForCost)}</td><td className="text-right num">{inr(b.igst)}</td><td className="text-right num">{inr(b.totalPaid)}</td>
                  <td><div className="flex justify-end gap-1.5"><LineageDrawer type="BILL_OF_ENTRY" id={b._id} label="Chain" /><AttachmentDrawer entityType="BILL_OF_ENTRY" entityId={b._id} label="Files" />
                    {canWrite && ['ADMIN', 'FINANCE_MANAGER'].includes(role) && b.status === 'POSTED' && <button className={`${btn} btn-danger`} onClick={() => cancel(b)}>Cancel</button>}</div></td>
                </tr>))}
              {!boes.length && <tr><td colSpan={8} className="p-8 text-center text-sm text-slate-400">No Bills of Entry recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
