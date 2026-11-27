import { describe, it, expect } from 'vitest';
import { computeTax, amountInWords, isValidGstin, stateCodeOf } from '@/lib/gst';

const lines = [
  { description: 'Frame', hsnCode: '8714', quantity: 10, unitPrice: 1000, gstRate: 18 },
  { description: 'Tyre', hsnCode: '4011', quantity: 5, unitPrice: 200, gstRate: 28 },
];

describe('GST computation', () => {
  it('splits CGST/SGST for intra-state supply', () => {
    const t = computeTax(lines, '27', '27');
    expect(t.intraState).toBe(true);
    expect(t.totalCGST).toBe(1040); // 900 + 140
    expect(t.totalSGST).toBe(1040);
    expect(t.totalIGST).toBe(0);
    expect(t.subTotal).toBe(11000);
    expect(t.totalAmount).toBe(13080); // 11000 + 2080 tax
  });

  it('charges IGST for inter-state supply with an HSN breakup', () => {
    const t = computeTax(lines, '27', '29');
    expect(t.totalIGST).toBe(2080);
    expect(t.totalCGST + t.totalSGST).toBe(0);
    expect(t.hsnSummary.map(h => h.hsnCode)).toEqual(['8714', '4011']);
    expect(t.hsnSummary[0].igst).toBe(1800);
  });

  it('keeps odd-paise tax balanced between CGST and SGST', () => {
    const t = computeTax([{ description: 'x', hsnCode: '1', quantity: 1, unitPrice: 0.5, gstRate: 5 }], '27', '27');
    expect(t.items[0].cgstAmount + t.items[0].sgstAmount).toBeCloseTo(0.03, 2);
  });

  it('validates GSTIN and extracts the state code', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true);
    expect(isValidGstin('27AAPFU0939F1')).toBe(false);
    expect(stateCodeOf('27AAPFU0939F1ZV')).toBe('27');
  });

  it('writes amounts in Indian words', () => {
    expect(amountInWords(118000.5)).toBe('One Lakh Eighteen Thousand Rupees and Fifty Paise Only');
  });
});
