import { describe, it, expect } from 'vitest';
import { buildTallyXml, moneyVoucher, purchaseVoucher, salesVoucher, validateVoucher, xmlEscape } from '@/lib/tally';

const doc = { number: 'INV-2026-0001', date: new Date(2026, 9, 14), party: 'Metro & Sons <Ltd>', subTotal: 1000, totalCGST: 90, totalSGST: 90, totalIGST: 0, totalAmount: 1180 };

describe('Tally XML export', () => {
  it('escapes XML special characters', () => {
    expect(xmlEscape('A & B <C> "D"')).toBe('A &amp; B &lt;C&gt; &quot;D&quot;');
  });

  it('builds a balanced sales voucher with GST ledgers', () => {
    const v = salesVoucher(doc);
    expect(validateVoucher(v)).toBeNull();
    expect(v.entries.map(e => e.ledger)).toEqual(['Metro & Sons <Ltd>', 'Sales', 'Output CGST', 'Output SGST']);
  });

  it('uses Tally sign convention: debits negative / deemed positive', () => {
    const xml = buildTallyXml([salesVoucher(doc)], 'Prodexa Pvt Ltd');
    expect(xml).toContain('<DATE>20261014</DATE>');
    expect(xml).toContain('<AMOUNT>-1180.00</AMOUNT>');
    expect(xml).toContain('<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>1000.00</AMOUNT>');
    expect(xml).toContain('Metro &amp; Sons &lt;Ltd&gt;');
  });

  it('builds purchase and receipt/payment vouchers that balance', () => {
    expect(validateVoucher(purchaseVoucher({ ...doc, party: 'Vendor' }))).toBeNull();
    const rec = moneyVoucher('Receipt', { number: 'BR-1', date: doc.date, party: 'Metro', amount: 500, mode: 'BANK' });
    expect(rec.entries[0]).toMatchObject({ ledger: 'Bank Account', side: 'DR' });
    expect(validateVoucher(moneyVoucher('Payment', { number: 'CP-1', date: doc.date, party: 'Vendor', amount: 75.5, mode: 'CASH' }))).toBeNull();
  });

  it('rejects unbalanced vouchers', () => {
    expect(validateVoucher({ ...salesVoucher(doc), entries: [{ ledger: 'A', amount: 10, side: 'DR' }, { ledger: 'B', amount: 9, side: 'CR' }] })).toContain('do not equal');
  });
});
