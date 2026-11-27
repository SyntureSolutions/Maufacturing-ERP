import { describe, it, expect } from 'vitest';
import { inflateSync } from 'zlib';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { buildPrintPdf, placeLabel, type PrintSpec } from '@/lib/printLayout';
import { pdfSafe, safeFileName, money, fmtDate, wrapText } from '@/lib/documentPdf';

// The one A4 layout every document prints with: what it draws, how it runs over pages, copies, the e-invoice QR,
// and the text helpers that keep the standard fonts from failing.

// Page content may be compressed and drawn text is hex-encoded: decompress every stream and decode the strings.
const STREAM = new RegExp('stream\\r?\\n([\\s\\S]*?)\\r?\\nendstream', 'g');
const HEX_TJ = new RegExp('<([0-9A-Fa-f]+)>\\s*Tj', 'g');
const text = (bytes: Uint8Array) => {
  const out: string[] = [];
  for (const m of Buffer.from(bytes).toString('latin1').matchAll(STREAM)) {
    let body = m[1];
    try { body = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { /* not compressed */ }
    for (const h of body.matchAll(HEX_TJ)) out.push(Buffer.from(h[1], 'hex').toString('latin1'));
  }
  return out.join('\n');
};

const company = { legalName: 'Prodexa Pvt Ltd', gstin: '27AAPFU0939F1ZV', address1: '1 Factory Rd', city: 'Pune', pincode: '411001', stateCode: '27' };
const spec = (n: number, extra: Partial<PrintSpec> = {}): PrintSpec => ({
  title: 'PURCHASE ORDER', number: 'PO-2026-0009',
  meta: [['PO date', '05 Apr 2026'], ['Approved by', ''], ['Status', 'Ordered']],
  parties: [{ label: 'Supplier', name: 'Shimano Imports', lines: ['BKC, Mumbai', 'GSTIN: 27AAPFU0939F1ZV'] }],
  columns: [{ key: 'item', label: 'Item', width: 60 }, { key: 'qty', label: 'Qty', width: 15, align: 'right' }, { key: 'amt', label: 'Amount', width: 25, align: 'right' }],
  rows: Array.from({ length: n }, (_, i) => ({ item: `Hydraulic Disc Brake ${i + 1}`, qty: '10', amt: '1,000.00' })),
  totals: [['Taxable value', 'Rs. 5,000.00'], ['CGST', 'Rs. 450.00'], ['SGST', 'Rs. 450.00'], ['Total', 'Rs. 5,900.00', true]],
  notes: [{ label: 'Notes', text: 'Deliver to Gate 2.\nCall before arrival.' }, { label: 'Empty', text: '' }],
  signatures: ['Prepared by', 'Authorised signatory'],
  ...extra,
});

describe('print layout', () => {
  it('draws the company, title, details, party, lines, totals, notes and signatures', async () => {
    const bytes = await buildPrintPdf(spec(3), company);
    expect(Buffer.from(bytes).toString('latin1').startsWith('%PDF-')).toBe(true);
    const t = text(bytes);
    for (const s of ['Prodexa Pvt Ltd', 'PURCHASE ORDER', 'PO-2026-0009', 'Shimano Imports', 'Hydraulic Disc Brake 3', 'CGST', 'Rs. 5,900.00', 'Deliver to Gate 2.', 'Call before arrival.', 'Authorised signatory', 'Page 1 of 1']) expect(t).toContain(s);
    expect(t).not.toContain('Approved by'); // empty details are left out
    expect(t).not.toContain('EMPTY');
  });

  it('runs long documents onto more pages, repeating the column headings and numbering the pages', async () => {
    const bytes = await buildPrintPdf(spec(120), company);
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    expect(pages).toBeGreaterThan(2);
    const t = text(bytes);
    expect(t.split('\n').filter(l => l === 'Amount').length).toBeGreaterThanOrEqual(pages - 1); // heading on every page with lines (the last may hold only totals)
    expect(t).toContain(`Page ${pages} of ${pages}`);
    expect(t).toContain('Hydraulic Disc Brake 120');
  });

  it('prints each copy with its own label and page numbers', async () => {
    const bytes = await buildPrintPdf(spec(2, { copies: ['Original for Consignee', 'Duplicate for Transporter', 'Triplicate for Consignor'] }), company);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
    const t = text(bytes);
    for (const c of ['Original for Consignee', 'Duplicate for Transporter', 'Triplicate for Consignor']) expect(t).toContain(c);
    expect(t.split('\n').filter(l => l === 'Page 1 of 1').length).toBe(3);
  });

  it('prints the e-invoice strip with the QR code, an extra table, and the seller recorded on the document', async () => {
    const bytes = await buildPrintPdf(spec(1, {
      seller: { name: 'Prodexa (as invoiced) Pvt Ltd', gstin: '27AAPFU0939F1ZV' },
      einvoice: { lines: [['IRN', 'abc123'], ['E-way bill', '']], qr: 'signed-qr-payload' },
      tables: [{ title: 'HSN / SAC summary', columns: [{ key: 'h', label: 'HSN', width: 1 }], rows: [{ h: '8714' }] }],
    }), company);
    const t = text(bytes);
    for (const s of ['IRN', 'abc123', 'HSN / SAC SUMMARY', '8714', 'Prodexa (as invoiced) Pvt Ltd']) expect(t).toContain(s);
    expect(t).not.toContain('E-way bill');
    expect(Buffer.from(bytes).toString('latin1')).toContain('/Subtype /Image'); // the QR
  });

  it('copes with no company profile, no lines and characters the fonts cannot draw', async () => {
    const bytes = await buildPrintPdf(spec(0, { parties: [{ label: 'Supplier', name: 'शिमानो Components ₹ Ltd' }], emptyText: 'Nothing ordered.' }), {});
    const t = text(bytes);
    expect(t).toContain('Company name not set');
    expect(t).toContain('Nothing ordered.');
    expect(t).toContain('?????? Components Rs. Ltd');
  });

  it('text helpers: safe text, file names, money, dates, wrapping, place of supply', async () => {
    expect(pdfSafe('₹ 5,000 for शिमानो')).toBe('Rs.  5,000 for ??????');
    expect(pdfSafe('a\nb')).toBe('a b');
    expect(safeFileName('PO / 2026 * 001')).toBe('PO_2026_001.pdf');
    expect(money(1280000)).toBe('Rs. 12,80,000.00');
    expect(fmtDate(new Date('2026-10-21'))).toMatch(/21.*2026/);
    const f = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const lines = wrapText(f, 10, 'word '.repeat(60) + 'x'.repeat(200), 150);
    expect(lines.length).toBeGreaterThan(3);
    for (const l of lines) expect(f.widthOfTextAtSize(l, 10)).toBeLessThanOrEqual(150.5);
    expect(placeLabel('27')).toBe('27-Maharashtra');
    expect(placeLabel('27-Maharashtra')).toBe('27-Maharashtra');
    expect(placeLabel('')).toBe('');
  });
});
