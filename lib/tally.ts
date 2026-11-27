// Builds Tally Prime / ERP 9 import XML. In Tally's convention a debit entry is
// ISDEEMEDPOSITIVE=Yes with a negative amount; a credit entry is ISDEEMEDPOSITIVE=No with a positive amount.

export const xmlEscape = (s: unknown) =>
  String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

export const tallyDate = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface TallyEntry { ledger: string; amount: number; side: 'DR' | 'CR' }
export interface TallyVoucher { type: 'Sales' | 'Purchase' | 'Receipt' | 'Payment'; number: string; date: Date; party: string; narration?: string; entries: TallyEntry[] }

export interface LedgerNames { sales: string; purchase: string; outCgst: string; outSgst: string; outIgst: string; inCgst: string; inSgst: string; inIgst: string; bank: string; cash: string }
export const DEFAULT_LEDGERS: LedgerNames = { sales: 'Sales', purchase: 'Purchase', outCgst: 'Output CGST', outSgst: 'Output SGST', outIgst: 'Output IGST', inCgst: 'Input CGST', inSgst: 'Input SGST', inIgst: 'Input IGST', bank: 'Bank Account', cash: 'Cash' };

interface TaxedDoc { number: string; date: Date; party: string; subTotal: number; totalCGST: number; totalSGST: number; totalIGST: number; totalAmount: number }

export function salesVoucher(d: TaxedDoc, l: LedgerNames = DEFAULT_LEDGERS): TallyVoucher {
  return { type: 'Sales', number: d.number, date: d.date, party: d.party, narration: `Sales invoice ${d.number}`, entries: [
    { ledger: d.party, amount: d.totalAmount, side: 'DR' }, { ledger: l.sales, amount: d.subTotal, side: 'CR' },
    ...(d.totalCGST ? [{ ledger: l.outCgst, amount: d.totalCGST, side: 'CR' as const }] : []), ...(d.totalSGST ? [{ ledger: l.outSgst, amount: d.totalSGST, side: 'CR' as const }] : []), ...(d.totalIGST ? [{ ledger: l.outIgst, amount: d.totalIGST, side: 'CR' as const }] : []),
  ] };
}

export function purchaseVoucher(d: TaxedDoc, l: LedgerNames = DEFAULT_LEDGERS): TallyVoucher {
  return { type: 'Purchase', number: d.number, date: d.date, party: d.party, narration: `Purchase bill ${d.number}`, entries: [
    { ledger: d.party, amount: d.totalAmount, side: 'CR' }, { ledger: l.purchase, amount: d.subTotal, side: 'DR' },
    ...(d.totalCGST ? [{ ledger: l.inCgst, amount: d.totalCGST, side: 'DR' as const }] : []), ...(d.totalSGST ? [{ ledger: l.inSgst, amount: d.totalSGST, side: 'DR' as const }] : []), ...(d.totalIGST ? [{ ledger: l.inIgst, amount: d.totalIGST, side: 'DR' as const }] : []),
  ] };
}

export function moneyVoucher(kind: 'Receipt' | 'Payment', v: { number: string; date: Date; party: string; amount: number; mode: 'BANK' | 'CASH'; narration?: string }, l: LedgerNames = DEFAULT_LEDGERS): TallyVoucher {
  const money = v.mode === 'CASH' ? l.cash : l.bank;
  return { type: kind, number: v.number, date: v.date, party: v.party, narration: v.narration, entries: kind === 'Receipt'
    ? [{ ledger: money, amount: v.amount, side: 'DR' }, { ledger: v.party, amount: v.amount, side: 'CR' }]
    : [{ ledger: v.party, amount: v.amount, side: 'DR' }, { ledger: money, amount: v.amount, side: 'CR' }] };
}

/** A voucher is importable only if debits equal credits and every ledger is named. */
export function validateVoucher(v: TallyVoucher): string | null {
  const dr = r2(v.entries.filter(e => e.side === 'DR').reduce((s, e) => s + e.amount, 0)), cr = r2(v.entries.filter(e => e.side === 'CR').reduce((s, e) => s + e.amount, 0));
  if (dr !== cr) return `${v.type} ${v.number}: debits ${dr} do not equal credits ${cr}`;
  if (v.entries.some(e => !String(e.ledger || '').trim())) return `${v.type} ${v.number}: a ledger name is missing`;
  return null;
}

export function buildTallyXml(vouchers: TallyVoucher[], company: string) {
  const body = vouchers.map(v => {
    const entries = v.entries.map(e => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xmlEscape(e.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${e.side === 'DR' ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${e.side === 'DR' ? '-' : ''}${r2(e.amount).toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`).join('');
    return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${v.type}" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${tallyDate(v.date)}</DATE><VOUCHERTYPENAME>${v.type}</VOUCHERTYPENAME><VOUCHERNUMBER>${xmlEscape(v.number)}</VOUCHERNUMBER><PARTYLEDGERNAME>${xmlEscape(v.party)}</PARTYLEDGERNAME><NARRATION>${xmlEscape(v.narration)}</NARRATION>${entries}</VOUCHER></TALLYMESSAGE>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xmlEscape(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${body}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}
