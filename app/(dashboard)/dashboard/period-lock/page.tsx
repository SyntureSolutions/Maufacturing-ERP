'use client';

import { PageHeader, Alert } from '@/components/ui';
import { useCallback, useEffect, useState } from 'react';

const field = 'input input-auto';
const btn = 'btn btn-sm';

export default function PeriodLockPage() {
  const [locks, setLocks] = useState<Record<string, string>>({});
  const [form, setForm] = useState<Record<string, { date: string; password: string }>>({ ACCOUNTING: { date: '', password: '' }, INVENTORY: { date: '', password: '' } });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/settings/period-lock');
    const data = res.ok ? await res.json() : [];
    const map: Record<string, string> = {};
    (Array.isArray(data) ? data : []).forEach((l: any) => { map[l.kind] = String(l.lockedUpTo).slice(0, 10); });
    setLocks(map);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (kind: string, clear = false) => {
    setMsg(null);
    const res = await fetch('/api/settings/period-lock', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, lockedUpTo: clear ? '' : form[kind].date, password: form[kind].password }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setMsg({ ok: false, text: data.error || 'Failed' });
    else { setMsg({ ok: true, text: clear ? 'Lock removed.' : 'Period locked.' }); setForm({ ...form, [kind]: { date: '', password: '' } }); load(); }
  };

  return (
    <div className="ui-page">
      <PageHeader title="Period Locking" subtitle="Transactions dated on or before the lock date cannot be posted. Extending a lock is open to Finance and Admin; reopening a period needs an Admin password." />
      {msg && <Alert ok={msg.ok}>{msg.text}</Alert>}
      {(['ACCOUNTING', 'INVENTORY'] as const).map(kind => (
        <div key={kind} className="max-w-xl space-y-3 card">
          <div className="flex items-center justify-between"><h2 className="font-bold">{kind === 'ACCOUNTING' ? 'Accounting period' : 'Inventory period'}</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${locks[kind] ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{locks[kind] ? `Locked up to ${locks[kind]}` : 'Open'}</span></div>
          <div className="flex flex-wrap gap-2">
            <input type="date" className={field} value={form[kind].date} onChange={e => setForm({ ...form, [kind]: { ...form[kind], date: e.target.value } })} />
            <input type="password" placeholder="Admin password (to reopen)" className={field} value={form[kind].password} onChange={e => setForm({ ...form, [kind]: { ...form[kind], password: e.target.value } })} />
            <button disabled={!form[kind].date} className={`${btn} btn-primary disabled:opacity-40`} onClick={() => save(kind)}>Set lock date</button>
            {locks[kind] && <button className={`${btn} btn-danger`} onClick={() => save(kind, true)}>Remove lock</button>}
          </div>
        </div>))}
    </div>
  );
}
