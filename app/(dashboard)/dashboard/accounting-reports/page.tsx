'use client';

import { PageHeader, Alert } from '@/components/ui';
import { useCallback, useEffect, useState } from 'react';

const field = 'input input-auto';
const btn = 'btn btn-sm';
const inr = (n: number) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Rep = 'trial' | 'pnl' | 'bs' | 'debtors' | 'creditors' | 'ledger';
const REPORTS: [Rep, string][] = [['trial', 'Trial balance'], ['pnl', 'Profit & loss'], ['bs', 'Balance sheet'], ['debtors', 'Sundry debtors aging'], ['creditors', 'Sundry creditors aging'], ['ledger', 'General ledger']];

async function api(url: string) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Download any table as CSV (opens in Excel)
function exportCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  a.download = `${name}.csv`; a.click();
}

export default function AccountingReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const fyStart = `${new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1}-04-01`;
  const [rep, setRep] = useState<Rep>('trial');
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(today);
  const [account, setAccount] = useState('1010');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => { api('/api/accounts').then(a => setAccounts(Array.isArray(a) ? a : [])).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setError(''); setData(null);
    try {
      const p = new URLSearchParams({ type: rep, from, to, asOf: to, account });
      setData(await api(`/api/finance/reports?${p}`));
    } catch (e: any) { setError(e.message); }
  }, [rep, from, to, account]);
  useEffect(() => { load(); }, [load]);

  const exportCurrent = () => {
    if (!data) return;
    if (rep === 'trial') exportCsv('trial-balance', [['Code', 'Account', 'Debit', 'Credit'], ...data.lines.map((l: any) => [l.code, l.name, l.debit, l.credit]), ['', 'Total', data.totalDebit, data.totalCredit]]);
    if (rep === 'pnl') exportCsv('profit-and-loss', [['Section', 'Account', 'Amount'], ...data.revenue.map((r: any) => ['Revenue', r.name, r.amount]), ...data.expenses.map((r: any) => ['Expense', r.name, r.amount]), ['', 'Net profit', data.netProfit]]);
    if (rep === 'bs') exportCsv('balance-sheet', [['Section', 'Account', 'Amount'], ...['assets', 'liabilities', 'equity'].flatMap(k => data[k].map((r: any) => [k, r.name, r.amount])), ['equity', 'Current year profit', data.currentYearProfit]]);
    if (rep === 'creditors') exportCsv('creditors-aging', [['Supplier', 'Billed (unpaid)', 'Received, not billed', 'Advances', 'Net payable', '0-30', '31-60', '61-90', '90+'], ...data.rows.map((r: any) => [r.party, r.billed, r.unbilled, -r.advances, r.net, r['0-30'], r['31-60'], r['61-90'], r['90+']]), ['Total', data.totals.billed, data.totals.unbilled, -data.totals.advances, data.totals.net, data.totals['0-30'], data.totals['31-60'], data.totals['61-90'], data.totals['90+']]]);
    if (rep === 'debtors') exportCsv(`${rep}-aging`, [['Party', '0-30', '31-60', '61-90', '90+', 'Total'], ...data.rows.map((r: any) => [r.party, r['0-30'], r['31-60'], r['61-90'], r['90+'], r.total])]);
    if (rep === 'ledger') exportCsv(`ledger-${data.account.code}`, [['Date', 'Entry', 'Description', 'Debit', 'Credit', 'Balance'], ...data.lines.map((l: any) => [new Date(l.date).toLocaleDateString('en-IN'), l.entryNumber, l.description, l.debit, l.credit, l.balance])]);
  };

  const Section = ({ title, rows, total }: { title: string; rows: any[]; total: number }) => (
    <div className="space-y-1"><div className="font-bold text-slate-900">{title}</div>
      {rows.map(r => <div key={r.code} className="flex justify-between border-b border-slate-100 py-1 text-sm"><span>{r.code} · {r.name}</span><span>{inr(r.amount)}</span></div>)}
      <div className="flex justify-between font-bold"><span>Total {title.toLowerCase()}</span><span>{inr(total)}</span></div></div>
  );

  return (
    <div className="ui-page">
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
      <div className="no-print space-y-4">
        <PageHeader title="Financial Reports" subtitle="Drill-down ledger, aging, trial balance, P&amp;L and balance sheet from posted journals." />
        <div className="flex flex-wrap gap-2">{REPORTS.map(([k, l]) => <button key={k} onClick={() => setRep(k)} className={`${rep === k ? 'tab tab-active' : 'tab'}`}>{l}</button>)}</div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
          {(rep === 'pnl' || rep === 'ledger') && <label>From <input type="date" className={field} value={from} onChange={e => setFrom(e.target.value)} /></label>}
          <label>{rep === 'pnl' || rep === 'ledger' ? 'To' : 'As of'} <input type="date" className={field} value={to} onChange={e => setTo(e.target.value)} /></label>
          {rep === 'ledger' && <select className={field} value={account} onChange={e => setAccount(e.target.value)}>{accounts.map(a => <option key={a._id} value={a.code}>{a.code} · {a.name}</option>)}</select>}
          <button className={`${btn} btn-primary`} onClick={exportCurrent}>Export to Excel (CSV)</button>
          <button className={`${btn} btn-secondary`} onClick={() => window.print()}>Print / PDF</button>
        </div>
      </div>
      {error && <Alert ok={false}>{error}</Alert>}
      {!data && !error && <p className="text-slate-400">Loading…</p>}

      {data && rep === 'trial' && (
        <div className="max-w-3xl card"><table className="w-full text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-1 text-left">Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
          <tbody>{data.lines.map((l: any) => <tr key={l.code} className="border-t border-slate-100"><td className="py-1">{l.code} · {l.name}</td><td className="text-right">{l.debit ? inr(l.debit) : ''}</td><td className="text-right">{l.credit ? inr(l.credit) : ''}</td></tr>)}</tbody>
          <tfoot><tr className="border-t-2 border-slate-800 font-bold"><td className="py-1">Total</td><td className="text-right">{inr(data.totalDebit)}</td><td className="text-right">{inr(data.totalCredit)}</td></tr></tfoot></table>
          {data.difference !== 0 && <p className="mt-2 text-xs font-semibold text-amber-700">Difference of ₹{inr(Math.abs(data.difference))}: the opening balances loaded in the chart of accounts do not balance on their own. Post an opening-balance journal to correct it.</p>}</div>
      )}

      {data && rep === 'pnl' && (
        <div className="max-w-2xl space-y-4 card"><Section title="Revenue" rows={data.revenue} total={data.totalRevenue} /><Section title="Expenses" rows={data.expenses} total={data.totalExpense} />
          <div className={`flex justify-between text-lg font-extrabold ${data.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}><span>Net {data.netProfit >= 0 ? 'profit' : 'loss'}</span><span>₹{inr(Math.abs(data.netProfit))}</span></div></div>
      )}

      {data && rep === 'bs' && (
        <div className="grid max-w-4xl gap-6 card md:grid-cols-2">
          <Section title="Assets" rows={data.assets} total={data.totalAssets} />
          <div className="space-y-4"><Section title="Liabilities" rows={data.liabilities} total={data.totalLiabilities} />
            <Section title="Equity" rows={[...data.equity, { code: '—', name: 'Current year profit', amount: data.currentYearProfit }]} total={data.totalEquity} /></div>
          {data.difference !== 0 && <p className="text-xs font-semibold text-amber-700 md:col-span-2">Balance sheet is out by ₹{inr(Math.abs(data.difference))} because opening balances in the chart of accounts are not balanced.</p>}
        </div>
      )}

      {data && rep === 'debtors' && (
        <div className="table-wrap"><table className="w-full text-left text-sm"><thead className=""><tr><th className="p-3">Party</th><th className="text-right">0–30</th><th className="text-right">31–60</th><th className="text-right">61–90</th><th className="text-right">90+</th><th className="pr-3 text-right">Total</th></tr></thead>
          <tbody>{data.rows.map((r: any) => (<>
            <tr key={r.party} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setOpen({ ...open, [r.party]: !open[r.party] })}><td className="p-3 font-semibold">{open[r.party] ? '▾' : '▸'} {r.party}</td>
              {['0-30', '31-60', '61-90', '90+'].map(b => <td key={b} className={`text-right ${b === '90+' && r[b] > 0 ? 'font-bold text-red-600' : ''}`}>{r[b] ? inr(r[b]) : ''}</td>)}<td className="pr-3 text-right font-bold">{inr(r.total)}</td></tr>
            {open[r.party] && r.invoices.map((i: any) => <tr key={i.invoiceNumber} className="bg-slate-50 text-xs"><td className="py-1 pl-8">{i.invoiceNumber} · {new Date(i.date).toLocaleDateString('en-IN')}</td><td colSpan={4} className="text-right">bucket {i.bucket}</td><td className="pr-3 text-right">{inr(i.outstanding)}</td></tr>)}</>))}
            {!data.rows.length && <tr><td colSpan={6} className="p-8 text-center text-sm text-slate-400">Nothing outstanding.</td></tr>}</tbody>
          <tfoot><tr className="border-t-2 border-slate-800 font-bold"><td className="p-3">Total</td>{['0-30', '31-60', '61-90', '90+'].map(b => <td key={b} className="text-right">{inr(data.totals[b])}</td>)}<td className="pr-3 text-right">{inr(data.totals.total)}</td></tr></tfoot></table></div>
      )}

      {data && rep === 'creditors' && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            {[['Bills not yet paid', data.totals.billed], ['Received, not yet billed', data.totals.unbilled], ['Advances paid', -data.totals.advances], ['Net payable', data.totals.net]].map(([label, value]) => (
              <div key={String(label)} className="card"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className={`mt-1 text-2xl font-bold num ${Number(value) < 0 ? 'text-emerald-700' : ''}`}>{inr(Number(value))}</div></div>))}
          </div>
          <div className="table-wrap">
            <table className="w-full text-left text-sm">
              <thead><tr><th>Supplier</th><th className="text-right">Billed</th><th className="text-right">Received, not billed</th><th className="text-right">Advances</th><th className="text-right">0–30</th><th className="text-right">31–60</th><th className="text-right">61–90</th><th className="text-right">90+</th><th className="pr-3 text-right">Net payable</th></tr></thead>
              <tbody>{data.rows.map((r: any) => (<>
                <tr key={r.supplierId} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen({ ...open, [r.supplierId]: !open[r.supplierId] })}>
                  <td className="font-semibold">{open[r.supplierId] ? '▾' : '▸'} {r.party}</td>
                  <td className="text-right num">{r.billed ? inr(r.billed) : ''}</td>
                  <td className="text-right num">{r.unbilled ? <span className="text-amber-700">{inr(r.unbilled)}</span> : ''}</td>
                  <td className="text-right num text-emerald-700">{r.advances ? `-${inr(r.advances)}` : ''}</td>
                  {['0-30', '31-60', '61-90', '90+'].map(b => <td key={b} className={`text-right num ${b === '90+' && r[b] > 0 ? 'font-bold text-red-600' : ''}`}>{r[b] ? inr(r[b]) : ''}</td>)}
                  <td className="pr-3 text-right font-bold num">{inr(r.net)}</td>
                </tr>
                {open[r.supplierId] && r.items.map((i: any, n: number) => (
                  <tr key={`${r.supplierId}-${n}`} className="bg-slate-50 text-xs">
                    <td className="py-1.5 pl-8"><span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${i.kind === 'BILL' ? 'bg-blue-50 text-blue-700' : i.kind === 'UNBILLED' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{i.kind === 'BILL' ? 'Bill' : i.kind === 'UNBILLED' ? 'Not billed' : 'Advance'}</span>{i.ref} · {new Date(i.date).toLocaleDateString('en-IN')}</td>
                    <td colSpan={7} className="text-slate-500">{i.detail}{i.bucket ? ` · ${i.bucket} days` : ''}</td>
                    <td className="pr-3 text-right num">{inr(i.amount)}</td>
                  </tr>))}</>))}
                {!data.rows.length && <tr><td colSpan={9} className="p-8 text-center text-sm text-slate-400">Nothing owed to suppliers.</td></tr>}</tbody>
              <tfoot><tr className="border-t-2 border-slate-800 font-bold"><td>Total</td><td className="text-right num">{inr(data.totals.billed)}</td><td className="text-right num">{inr(data.totals.unbilled)}</td><td className="text-right num">-{inr(data.totals.advances)}</td>{['0-30', '31-60', '61-90', '90+'].map(b => <td key={b} className="text-right num">{inr(data.totals[b])}</td>)}<td className="pr-3 text-right num">{inr(data.totals.net)}</td></tr></tfoot>
            </table>
          </div>
          <div className={`rounded-xl border p-3 text-sm ${Math.abs(data.ledger.difference) < 0.01 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            Payables ledger: <b className="num">{inr(data.ledger.balance)}</b> · this report: <b className="num">{inr(data.ledger.reportNet)}</b> ·{' '}
            {Math.abs(data.ledger.difference) < 0.01 ? 'they agree.' : <>difference <b className="num">{inr(data.ledger.difference)}</b>. It can come from opening balances, GST on goods returned before they were billed, or entries not tied to a supplier.</>}
          </div>
          <p className="text-xs text-slate-500">Received, not billed = goods accepted into stock (less returns) that no supplier bill has covered yet, valued at the price they were received at, excluding GST, and aged from the receipt date. The oldest receipts are treated as billed first.{data.totals.awaitingQc > 0 && <> Goods still awaiting quality inspection (<b className="num">{inr(data.totals.awaitingQc)}</b>) are not included until they are accepted.</>} <a className="font-semibold underline" href="/dashboard/vendor-bills">Book a vendor bill</a></p>
        </div>
      )}

      {data && rep === 'ledger' && (
        <div className="table-wrap"><div className="p-3 font-bold">{data.account.code} · {data.account.name} — opening {inr(data.opening)}</div>
          <table className="w-full text-left text-sm"><thead className=""><tr><th className="p-3">Date</th><th>Entry</th><th>Description</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="pr-3 text-right">Balance</th></tr></thead>
            <tbody>{data.lines.map((l: any, i: number) => <tr key={i} className="border-t border-slate-100"><td className="p-3">{new Date(l.date).toLocaleDateString('en-IN')}</td><td>{l.entryNumber}</td><td>{l.description}</td><td className="text-right">{l.debit ? inr(l.debit) : ''}</td><td className="text-right">{l.credit ? inr(l.credit) : ''}</td><td className="pr-3 text-right font-semibold">{inr(l.balance)}</td></tr>)}
              {!data.lines.length && <tr><td colSpan={6} className="p-8 text-center text-sm text-slate-400">No postings in this period.</td></tr>}</tbody></table></div>
      )}
    </div>
  );
}
