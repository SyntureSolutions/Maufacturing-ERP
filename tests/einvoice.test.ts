import { describe, it, expect } from 'vitest';
import { computeIrn, financialYear, buildEInvoiceJson, buildEwayBillJson, DocInput } from '@/lib/einvoice';

const party = (gstin: string, state: string) => ({ gstin, name: 'Party', address1: '1 Road', city: 'Pune', pincode: '411001', stateCode: state });
const doc: DocInput = {
  number: 'INV-2026-0001', date: new Date(2026, 9, 14), seller: party('27AAPFU0939F1ZV', '27'), buyer: party('29AABCT1332L1ZZ', '29'), placeOfSupply: '29',
  items: [{ description: 'Frame', hsnCode: '8714', quantity: 10, uom: 'pcs', unitPrice: 1000, taxableValue: 10000, gstRate: 18, cgstAmount: 0, sgstAmount: 0, igstAmount: 1800, totalAmount: 11800 }],
  subTotal: 10000, totalCGST: 0, totalSGST: 0, totalIGST: 1800, totalAmount: 11800,
};

describe('e-invoice / e-way bill payloads', () => {
  it('derives the financial year from the invoice date', () => {
    expect(financialYear(new Date(2026, 9, 14))).toBe('2026-27');
    expect(financialYear(new Date(2027, 1, 1))).toBe('2026-27');
  });

  it('computes a 64-char deterministic IRN', () => {
    const a = computeIrn('27AAPFU0939F1ZV', doc.date, 'INV', doc.number);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(computeIrn('27AAPFU0939F1ZV', doc.date, 'INV', doc.number));
    expect(a).not.toBe(computeIrn('27AAPFU0939F1ZV', doc.date, 'INV', 'INV-2026-0002'));
  });

  it('builds schema 1.1 e-invoice JSON with totals and NIC units', () => {
    const { json, errors } = buildEInvoiceJson(doc);
    expect(errors).toEqual([]);
    expect(json.DocDtls.Dt).toBe('14/10/2026');
    expect(json.ItemList[0].Unit).toBe('PCS');
    expect(json.ValDtls.TotInvVal).toBe(11800);
  });

  it('flags missing buyer GSTIN for e-invoice', () => {
    const { errors } = buildEInvoiceJson({ ...doc, buyer: { ...doc.buyer, gstin: '' } });
    expect(errors.join()).toContain('Buyer GSTIN');
  });

  it('builds an e-way bill row and validates transport data', () => {
    expect(buildEwayBillJson(doc, { distanceKm: 0 }).errors.join()).toContain('vehicle');
    const { json, errors } = buildEwayBillJson(doc, { distanceKm: 120, vehicleNo: 'mh 12 ab 1234' });
    expect(errors).toEqual([]);
    expect(json.billLists[0].vehicleNo).toBe('MH12AB1234');
    expect(json.billLists[0].itemList[0].igstRate).toBe(18);
  });
});
