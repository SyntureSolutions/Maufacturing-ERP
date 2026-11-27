'use client';

import { PageHeader, Alert } from '@/components/ui';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NOTE_REASONS } from '@/lib/gstNote';
import { PdfButton, pdfUrl } from '@/components/workspace/PdfButton';

const field = 'input';
const btn = 'btn btn-sm';
const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function api(url: string, method = 'GET', body?: any) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const TYPES = [
  ['BANK_PAYMENT', 'Bank payment'], ['BANK_RECEIPT', 'Bank receipt'], ['CASH_PAYMENT', 'Cash payment'], ['CASH_RECEIPT', 'Cash receipt'],
  ['DEBIT_NOTE', 'Debit note'], ['CREDIT_NOTE', 'Credit note'], ['EXPENSE', 'Expense'], ['PETTY_CASH', 'Petty cash'], ['JOURNAL', 'Journal'], ['CONTRA', 'Contra'],
] as const;
type VType = (typeof TYPES)[number][0];

const blank = () => ({ date: new Date().toISOString().slice(0, 10), amount: '', partyType: 'SUPPLIER', partyId: '', counterAccount: '', refInvoiceId: '', narration: '', chequeNo: '', utr: '',
  taxableAmount: '', gstPercent: '18', tdsPercent: '0', expensePayment: 'CREDIT', costCenter: '', pettyKind: 'EXPENSE', mode: 'BANK', from: 'BANK', to: 'CASH', category: '', attachmentUrl: '',
  noteReason: '', rdQty: '', rdBilled: '', rdActual: '', partyNoteNo: '', partyNoteDate: '', itcDate: '' });

export default function VouchersPage() {
  const [type, setType] = useState<VType>('BANK_PAYMENT');
  const [f, setF] = useState<any>(blank());
  const [jLines, setJLines] = useState([{ accountCode: '', debit: '', credit: '' }, { accountCode: '', debit: '', credit: '' }]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const get = (u: string) => api(u).then(d => (Array.isArray(d) ? d : [])).catch(() => []);
    const [a, c, s, i, v, b] = await Promise.all([get('/api/accounts'), get('/api/customers'), get('/api/suppliers'), get('/api/dispatch/invoices'), get('/api/vouchers'), get('/api/vendor-bills')]);
    setAccounts(a); setCustomers(c); setSuppliers(s); setInvoices(i); setVouchers(v); setBills(b);
  }, []);
  useEffect(() => { load(); }, [load]);

  const isNote = type === 'DEBIT_NOTE' || type === 'CREDIT_NOTE';
  const isMoney = ['BANK_PAYMENT', 'BANK_RECEIPT', 'CASH_PAYMENT', 'CASH_RECEIPT'].includes(type);
  const isReceipt = type.endsWith('RECEIPT');
  const partyType = isNote ? (type === 'CREDIT_NOTE' ? 'CUSTOMER' : 'SUPPLIER') : isReceipt && f.partyType === 'SUPPLIER' ? 'CUSTOMER' : f.partyType;
  const invoicesForParty = useMemo(() => (partyType === 'SUPPLIER' ? bills.filter(b => !f.partyId || String(b.supplier?._id || b.supplier) === f.partyId).map(b => ({ ...b, parties: { buyer: { name: b.supplier?.name } }, invoiceNumber: `${b.invoiceNumber}${b.vendorBillNumber ? ` (their ${b.vendorBillNumber})` : ''}` }))
    : invoices.filter(i => (partyType === 'CUSTOMER' || partyType === 'OTHER') && (!f.partyId || String(i.customer) === f.partyId))), [invoices, bills, partyType, f.partyId]);
  const rateDiff = Number(f.rdQty) > 0 && f.rdBilled !== '' && f.rdActual !== '' ? Math.round(Number(f.rdQty) * (Number(f.rdBilled) - Number(f.rdActual)) * 100) / 100 : null;
  const jDr = jLines.reduce((s, l) => s + (Number(l.debit) || 0), 0), jCr = jLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const expenseAccounts = accounts.filter(a => a.type === 'EXPENSE');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    try {
      const body: any = {
        type, date: f.date, narration: f.narration, partyType, partyId: f.partyId || undefined, counterAccount: f.counterAccount || undefined, refInvoiceId: f.refInvoiceId || undefined,
        amount: Number(f.amount), taxableAmount: isNote && rateDiff !== null ? rateDiff : Number(f.taxableAmount), gstPercent: Number(f.gstPercent), tdsPercent: Number(f.tdsPercent),
        ...(isNote ? { noteReason: f.noteReason, rateDiff: f.rdQty || f.rdBilled || f.rdActual ? { quantity: f.rdQty, billedRate: f.rdBilled, actualRate: f.rdActual } : undefined, partyNoteNo: f.partyNoteNo || undefined, partyNoteDate: f.partyNoteDate || undefined, itcDate: f.itcDate || undefined } : {}),
        instrument: { chequeNo: f.chequeNo || undefined, utr: f.utr || undefined }, expensePayment: f.expensePayment, costCenter: f.costCenter, category: f.category, attachmentUrl: f.attachmentUrl || undefined,
        pettyKind: f.pettyKind, mode: f.mode, from: f.from, to: f.to,
        journalLines: jLines.map(l => ({ accountCode: l.accountCode, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
      };
      const v = await api('/api/vouchers', 'POST', body);
      setMsg({ ok: true, text: v.pendingApproval ? v.message : `Voucher ${v.number} posted.` }); setF(blank()); setJLines(jLines.map(() => ({ accountCode: '', debit: '', credit: '' }))); await load();
    } catch (err: any) { setMsg({ ok: false, text: err.message }); }
  };

  const pettyBalance = accounts.find(a => a.code === '1006')?.balance ?? 0;
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const partyList = partyType === 'SUPPLIER' ? suppliers : customers;

  return (
    <div className="ui-page">
      <PageHeader title="Accounting Vouchers" subtitle="Every voucher posts a balanced double-entry journal and respects period locks." />
      <div className="flex flex-wrap gap-2">{TYPES.map(([k, l]) => <button key={k} onClick={() => { setType(k); setF({ ...blank(), partyType: k === 'CREDIT_NOTE' ? 'CUSTOMER' : k.endsWith('RECEIPT') ? 'CUSTOMER' : 'SUPPLIER' }); }} className={`${type === k ? 'tab tab-active' : 'tab'}`}>{l}</button>)}</div>
      {msg && <Alert ok={msg.ok}>{msg.text}</Alert>}
      {type === 'PETTY_CASH' && <div className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">Petty cash balance: {inr(pettyBalance)}</div>}

      <form onSubmit={submit} className="grid max-w-4xl gap-3 card md:grid-cols-2">
        <label className="lbl">Date<input type="date" required className={field} value={f.date} onChange={e => set('date', e.target.value)} /></label>

        {(isMoney || isNote) && <>
          {!isNote && <label className="lbl">Party type<select className={field} value={f.partyType} onChange={e => set('partyType', e.target.value)}>
            <option value="SUPPLIER" disabled={isReceipt}>Supplier</option><option value="CUSTOMER" disabled={!isReceipt}>Customer</option><option value="OTHER">Other ledger</option></select></label>}
          {partyType !== 'OTHER' ? <label className="lbl">{partyType === 'SUPPLIER' ? 'Supplier' : 'Customer'}<select className={field} value={f.partyId} onChange={e => set('partyId', e.target.value)}><option value="">Select…</option>{partyList.map((p: any) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label>
            : <label className="lbl">Ledger account<select required className={field} value={f.counterAccount} onChange={e => set('counterAccount', e.target.value)}><option value="">Select…</option>{accounts.map(a => <option key={a._id} value={a.code}>{a.code} · {a.name}</option>)}</select></label>}
          {(isNote || (isReceipt && partyType === 'CUSTOMER')) && <label className="text-xs font-semibold md:col-span-2">{isNote ? 'Against invoice (required)' : 'Settle invoice (optional)'}<select required={isNote} className={field} value={f.refInvoiceId} onChange={e => set('refInvoiceId', e.target.value)}>
            <option value="">Select invoice…</option>{invoicesForParty.map(i => <option key={i._id} value={i._id}>{i.invoiceNumber} · {i.parties?.buyer?.name} · {inr(i.totalAmount - (i.amountPaid || 0) - (i.creditedAmount || 0))} due</option>)}</select></label>}
        </>}

        {isMoney && <>
          <label className="lbl">Amount<input type="number" required min="0.01" step="0.01" className={field} value={f.amount} onChange={e => set('amount', e.target.value)} /></label>
          {type.startsWith('BANK') && <><label className="lbl">Cheque no.<input className={field} value={f.chequeNo} onChange={e => set('chequeNo', e.target.value)} /></label>
            <label className="lbl">UTR / reference<input className={field} value={f.utr} onChange={e => set('utr', e.target.value)} /></label></>}
        </>}

        {isNote && <>
          <label className="lbl">Reason for issuing (required)<select required className={field} value={f.noteReason} onChange={e => set('noteReason', e.target.value)}><option value="">Select…</option>{Object.entries(NOTE_REASONS).filter(([k]) => k !== (type === 'CREDIT_NOTE' ? 'PURCHASE_RETURN' : 'SALES_RETURN')).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="lbl">{type === 'CREDIT_NOTE' ? "Customer's debit note no." : "Supplier's credit note no."}<input className={field} maxLength={40} value={f.partyNoteNo} onChange={e => set('partyNoteNo', e.target.value)} /></label>
          <label className="lbl">{type === 'CREDIT_NOTE' ? "Customer's debit note date" : "Supplier's credit note date"}<input type="date" className={field} value={f.partyNoteDate} onChange={e => set('partyNoteDate', e.target.value)} /></label>
          {type === 'DEBIT_NOTE' && <label className="lbl">ITC reversal date<input type="date" className={field} value={f.itcDate} onChange={e => set('itcDate', e.target.value)} /></label>}
          <fieldset className="md:col-span-2 grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-3">
            <legend className="px-1 text-xs font-semibold text-slate-600">Rate difference {f.noteReason === 'RATE_DIFFERENCE' ? '(required)' : '(if the note is for a price difference)'}</legend>
            <label className="lbl">Quantity<input type="number" min="0" step="any" required={f.noteReason === 'RATE_DIFFERENCE'} className={field} value={f.rdQty} onChange={e => set('rdQty', e.target.value)} /></label>
            <label className="lbl">Billed rate<input type="number" min="0" step="any" required={f.noteReason === 'RATE_DIFFERENCE'} className={field} value={f.rdBilled} onChange={e => set('rdBilled', e.target.value)} /></label>
            <label className="lbl">Actual rate<input type="number" min="0" step="any" required={f.noteReason === 'RATE_DIFFERENCE'} className={field} value={f.rdActual} onChange={e => set('rdActual', e.target.value)} /></label>
            {rateDiff !== null && <div className="text-xs text-slate-600 md:col-span-3">Difference {inr(rateDiff)} becomes the taxable value.</div>}
          </fieldset>
        </>}
        {(isNote || type === 'EXPENSE') && <>
          <label className="lbl">Taxable value<input type="number" required={!(isNote && rateDiff !== null)} disabled={isNote && rateDiff !== null} min="0.01" step="0.01" className={field} value={isNote && rateDiff !== null ? String(rateDiff) : f.taxableAmount} onChange={e => set('taxableAmount', e.target.value)} /></label>
          <label className="lbl">GST %<input type="number" min="0" className={field} value={f.gstPercent} onChange={e => set('gstPercent', e.target.value)} /></label>
        </>}
        {type === 'EXPENSE' && <>
          <label className="lbl">TDS %<input type="number" min="0" className={field} value={f.tdsPercent} onChange={e => set('tdsPercent', e.target.value)} /></label>
          <label className="lbl">Expense head<select className={field} value={f.counterAccount} onChange={e => set('counterAccount', e.target.value)}><option value="">Factory overheads (default)</option>{expenseAccounts.map(a => <option key={a._id} value={a.code}>{a.code} · {a.name}</option>)}</select></label>
          <label className="lbl">Paid via<select className={field} value={f.expensePayment} onChange={e => set('expensePayment', e.target.value)}><option value="CREDIT">On credit (payable)</option><option value="BANK">Bank</option><option value="CASH">Cash</option><option value="PETTY_CASH">Petty cash</option></select></label>
          <label className="lbl">Cost centre<input className={field} value={f.costCenter} onChange={e => set('costCenter', e.target.value)} placeholder="e.g. Assembly, Paint shop" /></label>
        </>}

        {type === 'PETTY_CASH' && <>
          <label className="lbl">Entry<select className={field} value={f.pettyKind} onChange={e => set('pettyKind', e.target.value)}><option value="EXPENSE">Expense paid from petty cash</option><option value="REPLENISH">Replenish imprest</option></select></label>
          <label className="lbl">Amount<input type="number" required min="0.01" step="0.01" className={field} value={f.amount} onChange={e => set('amount', e.target.value)} /></label>
          {f.pettyKind === 'EXPENSE' ? <>
            <label className="lbl">Expense head<select className={field} value={f.counterAccount} onChange={e => set('counterAccount', e.target.value)}><option value="">Factory overheads (default)</option>{expenseAccounts.map(a => <option key={a._id} value={a.code}>{a.code} · {a.name}</option>)}</select></label>
            <label className="lbl">Category tag<input className={field} value={f.category} onChange={e => set('category', e.target.value)} placeholder="Tea, courier, stationery…" /></label>
            <label className="text-xs font-semibold md:col-span-2">Receipt image URL<input className={field} value={f.attachmentUrl} onChange={e => set('attachmentUrl', e.target.value)} placeholder="Attach via the document drawer, then paste the link" /></label>
          </> : <label className="lbl">Funded from<select className={field} value={f.mode} onChange={e => set('mode', e.target.value)}><option value="BANK">Bank</option><option value="CASH">Cash in hand</option></select></label>}
        </>}

        {type === 'CONTRA' && <>
          <label className="lbl">Amount<input type="number" required min="0.01" step="0.01" className={field} value={f.amount} onChange={e => set('amount', e.target.value)} /></label>
          <label className="lbl">From<select className={field} value={f.from} onChange={e => set('from', e.target.value)}><option>BANK</option><option>CASH</option></select></label>
          <label className="lbl">To<select className={field} value={f.to} onChange={e => set('to', e.target.value)}><option>CASH</option><option>BANK</option></select></label>
        </>}

        {type === 'JOURNAL' && (
          <div className="space-y-2 md:col-span-2">
            {jLines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_120px] gap-2">
                <select className={field} value={l.accountCode} onChange={e => setJLines(jLines.map((x, n) => (n === i ? { ...x, accountCode: e.target.value } : x)))}><option value="">Account…</option>{accounts.map(a => <option key={a._id} value={a.code}>{a.code} · {a.name}</option>)}</select>
                <input type="number" min="0" step="0.01" placeholder="Debit" className={field} value={l.debit} onChange={e => setJLines(jLines.map((x, n) => (n === i ? { ...x, debit: e.target.value, credit: '' } : x)))} />
                <input type="number" min="0" step="0.01" placeholder="Credit" className={field} value={l.credit} onChange={e => setJLines(jLines.map((x, n) => (n === i ? { ...x, credit: e.target.value, debit: '' } : x)))} />
              </div>))}
            <div className="flex items-center justify-between text-sm"><button type="button" className={`${btn} btn-secondary`} onClick={() => setJLines([...jLines, { accountCode: '', debit: '', credit: '' }])}>Add line</button>
              <span className={Math.abs(jDr - jCr) < 0.005 && jDr > 0 ? 'font-bold text-emerald-700' : 'font-bold text-red-600'}>Dr {inr(jDr)} · Cr {inr(jCr)}{Math.abs(jDr - jCr) >= 0.005 ? ` · off by ${inr(Math.abs(jDr - jCr))}` : ' · balanced'}</span></div>
          </div>
        )}

        <label className="text-xs font-semibold md:col-span-2">Narration<input className={field} value={f.narration} onChange={e => set('narration', e.target.value)} /></label>
        <button className={`${btn} btn-primary md:col-span-2`}>Post voucher</button>
      </form>

      <div className="table-wrap">
        <table className="w-full text-left text-sm"><thead className=""><tr><th className="p-3">Voucher</th><th>Type</th><th>Date</th><th>Party / ref</th><th className="text-right">Amount</th><th className="pr-3">Narration</th></tr></thead>
          <tbody>{vouchers.map(v => <tr key={v._id} className="border-t border-slate-100"><td className="p-3 font-semibold">{v.number}</td><td>{v.type.replaceAll('_', ' ')}</td><td>{new Date(v.date).toLocaleDateString('en-IN')}</td>
            <td>{v.partyName || ''}{v.refDoc ? ` · ${v.refDoc.number}` : ''}</td><td className="text-right">{inr(v.amount)}</td><td className="pr-3 text-slate-500">{v.narration} <AttachmentDrawer entityType="VOUCHER" entityId={v._id} label="Files" /> <PdfButton url={pdfUrl.print('voucher', v._id)} title={`Voucher ${v.number}`} className="btn btn-xs btn-secondary" /></td></tr>)}
            {!vouchers.length && <tr><td colSpan={6} className="p-8 text-center text-sm text-slate-400">No vouchers posted yet.</td></tr>}</tbody></table>
      </div>
    </div>
  );
}
