'use client';

import { PageHeader, Alert } from '@/components/ui';
import { useState } from 'react';

const field = 'input input-auto';
const btn = 'btn btn-sm';
const TYPES = [['SALES', 'Sales invoices'], ['PURCHASE', 'Purchase bills'], ['RECEIPT', 'Receipts (bank / cash)'], ['PAYMENT', 'Payments (bank / cash)']];

export default function TallyPage() {
  const year = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const [from, setFrom] = useState(`${year}-04-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [types, setTypes] = useState<string[]>(['SALES', 'PURCHASE', 'RECEIPT', 'PAYMENT']);
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState('');

  const qs = (extra = '') => `from=${from}&to=${to}&types=${types.join(',')}${extra}`;

  const check = async () => {
    setError(''); setPreview(null);
    const res = await fetch(`/api/tally/export?${qs('&preview=1')}`);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) setError(d.error || 'Failed'); else setPreview(d);
  };

  const download = async () => {
    setError('');
    const res = await fetch(`/api/tally/export?${qs()}`);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || 'Failed'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob()); a.download = `tally-${from}-to-${to}.xml`; a.click();
  };

  return (
    <div className="ui-page">
      <PageHeader title="Tally Data Transfer" subtitle="Export vouchers as Tally XML. In Tally: Import Data → Vouchers → choose the file. Ledger names must already exist in Tally (Sales, Purchase, Output/Input CGST, SGST, IGST, Bank Account, Cash, and each party)." />
      <div className="max-w-2xl space-y-4 card">
        <div className="flex flex-wrap gap-3 text-xs font-semibold"><label>From <input type="date" className={field} value={from} onChange={e => setFrom(e.target.value)} /></label><label>To <input type="date" className={field} value={to} onChange={e => setTo(e.target.value)} /></label></div>
        <div className="flex flex-wrap gap-3">{TYPES.map(([k, l]) => <label key={k} className="flex items-center gap-1.5 text-sm font-semibold"><input type="checkbox" checked={types.includes(k)} onChange={e => setTypes(e.target.checked ? [...types, k] : types.filter(t => t !== k))} />{l}</label>)}</div>
        <div className="flex gap-2"><button className={`${btn} btn-secondary`} onClick={check}>Check</button><button className={`${btn} btn-primary`} onClick={download}>Download Tally XML</button></div>
        {error && <Alert ok={false}>{error}</Alert>}
        {preview && (
          <div className="space-y-2 text-sm"><div className="font-bold">{preview.total} voucher(s) ready: {Object.entries(preview.counts).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}</div>
            {preview.warnings.length > 0 && <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><div className="font-bold">Skipped ({preview.warnings.length}):</div>{preview.warnings.map((w: string, i: number) => <div key={i}>{w}</div>)}</div>}</div>
        )}
      </div>
    </div>
  );
}
