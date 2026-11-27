import { describe, it, expect } from 'vitest';
import { buildVoucher } from '@/lib/voucherBuilder';

const totals = (lines: { debit?: number; credit?: number }[]) => ({
  dr: Math.round(lines.reduce((s, l) => s + (l.debit || 0), 0) * 100) / 100,
  cr: Math.round(lines.reduce((s, l) => s + (l.credit || 0), 0) * 100) / 100,
});

describe('voucher builder', () => {
  it('requires a UTR/cheque for bank vouchers', () => {
    expect(buildVoucher({ type: 'BANK_PAYMENT', amount: 100, partyType: 'SUPPLIER' }).errors[0]).toContain('cheque');
  });

  it('balances a supplier bank payment', () => {
    const v = buildVoucher({ type: 'BANK_PAYMENT', amount: 5000, partyType: 'SUPPLIER', instrument: { utr: 'UTR123' } });
    expect(v.errors).toEqual([]);
    expect(totals(v.lines)).toEqual({ dr: 5000, cr: 5000 });
  });

  it('rejects customer refunds via payment voucher', () => {
    expect(buildVoucher({ type: 'CASH_PAYMENT', amount: 10, partyType: 'CUSTOMER' }).errors[0]).toContain('credit note');
  });

  it('applies GST input and TDS on an expense voucher', () => {
    const v = buildVoucher({ type: 'EXPENSE', taxableAmount: 10000, gstPercent: 18, tdsPercent: 10, expensePayment: 'CREDIT' });
    expect(totals(v.lines)).toEqual({ dr: 11800, cr: 11800 });
    expect(v.lines.find(l => (l.credit || 0) === 1000)).toBeTruthy(); // TDS payable
    expect(v.lines.find(l => (l.credit || 0) === 10800)).toBeTruthy(); // vendor payable net of TDS
  });

  it('rejects an unbalanced journal and accepts a balanced one', () => {
    const bad = buildVoucher({ type: 'JOURNAL', journalLines: [{ accountCode: '5030', debit: 100 }, { accountCode: '1050', credit: 90 }] });
    expect(bad.errors[0]).toContain('out of balance');
    const ok = buildVoucher({ type: 'JOURNAL', journalLines: [{ accountCode: '5030', debit: 100 }, { accountCode: '1050', credit: 100 }] });
    expect(ok.errors).toEqual([]);
  });

  it('builds contra and notes with GST reversal', () => {
    expect(buildVoucher({ type: 'CONTRA', amount: 500, from: 'BANK', to: 'BANK' }).errors.length).toBe(1);
    const cn = buildVoucher({ type: 'CREDIT_NOTE', taxableAmount: 1000, gstPercent: 18 });
    expect(cn.amount).toBe(1180);
    expect(totals(cn.lines)).toEqual({ dr: 1180, cr: 1180 });
  });
});
