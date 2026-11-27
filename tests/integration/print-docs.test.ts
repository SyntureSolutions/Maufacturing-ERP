import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { PDFDocument } from 'pdf-lib';
import { NextRequest } from 'next/server';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// Every document prints as a PDF from its own saved data: the right title, lines, totals and copies, nothing invented,
// "not found" for a document that does not exist, and only for people who may see that kind of document.
describe('document printouts', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const oid = () => new mongoose.Types.ObjectId();
  const load = (type: string, doc: any, q = '') => r.types[type].load(id(doc), new URLSearchParams(q));
  const pdf = async (type: string, doc: any, q = '') => {
    const res = await call(r.print.GET, 'GET', undefined, { type, id: id(doc) }, q ? `?${q}` : '');
    return res;
  };
  const pages = async (url: () => Promise<Response>) => (await PDFDocument.load(await (await url()).arrayBuffer())).getPageCount();

  beforeAll(async () => {
    await startDb();
    for (const n of ['Product', 'Supplier', 'Customer', 'PurchaseIndent', 'RFQ', 'PurchaseReturn', 'PickList', 'JobWorkOrder', 'MaterialRequisition', 'StockTransferOrder', 'ProformaInvoice', 'Voucher', 'Invoice', 'DeliveryChallan', 'WorkOrder', 'SalesOrder', 'PurchaseOrder', 'Quotation', 'GRN']) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${n}`); m[n] = mod.default || mod;
    }
    r.types = (await import('@/lib/printDocs')).PRINT_TYPES;
    r.print = await import('@/app/api/print/[type]/[id]/route');
    r.invoice = await import('@/app/api/finance/invoices/[id]/pdf/route');
    r.challan = await import('@/app/api/delivery-challans/[id]/pdf/route');
    r.company = await import('@/app/api/settings/company/route');
    asRole('FINANCE_MANAGER');
    await call(r.company.PUT, 'PUT', { legalName: 'Prodexa Pvt Ltd', gstin: '27AAPFU0939F1ZV', address1: '1 Factory Rd', city: 'Pune', pincode: '411001', bank: { name: 'State Bank', accountNo: '1234567890', ifsc: 'SBIN0000001' }, invoiceTerms: 'Interest at 18% after due date.' });
    asAdmin();

    d.frame = await m.Product.create({ name: 'Frame', sku: 'FR-PR', category: oid(), uom: 'pcs', hsnCode: '8714', gstRate: 12 });
    d.sup = await m.Supplier.create({ name: 'Steel Tubes Co', code: 'S-PR', email: 's@x.in', phone: '9', address: 'MIDC Bhosari', gstin: '27AAACS1234A1Z5' });
    d.cust = await m.Customer.create({ name: 'Metro Wheels', code: 'C-PR', billingAddress: '45 GIDC', city: 'Vadodara', gstin: '24AABCM8821F1Z1', stateCode: '24' });
    d.so = await m.SalesOrder.create({ soNumber: 'SO-PR-1', customer: d.cust._id, customerName: 'Metro Wheels', items: [{ product: d.frame._id, quantity: 4, unitPrice: 1000, totalPrice: 4000 }], totalAmount: 4000 });
    const parties = { seller: { name: 'Prodexa Pvt Ltd', gstin: '27AAPFU0939F1ZV', address1: '1 Factory Rd', city: 'Pune', stateCode: '27' }, buyer: { name: 'Metro Wheels', gstin: '24AABCM8821F1Z1', address1: '45 GIDC', city: 'Vadodara', stateCode: '24' } };
    const line = { description: 'Frame', hsnCode: '8714', quantity: 4, unitPrice: 1000, uom: 'pcs', taxableValue: 4000, igstRate: 12, igstAmount: 480, cgstRate: 0, sgstRate: 0, totalAmount: 4480 };

    d.indent = await m.PurchaseIndent.create({ number: 'PR-0001', items: [{ lineNo: 1, product: d.frame._id, quantity: 10, uom: 'pcs', preferredSupplier: d.sup._id }], remarks: 'For SO-PR-1', requestedBy: 'Stores' });
    d.rfq = await m.RFQ.create({ number: 'RFQ-0001', items: [{ lineNo: 1, product: d.frame._id, quantity: 10 }], suppliers: [d.sup._id] });
    d.ret = await m.PurchaseReturn.create({ number: 'PRN-0001', grn: oid(), grnNumber: 'GRN-0009', supplier: d.sup._id, items: [{ product: d.frame._id, quantity: 2, unitPrice: 500, reason: 'Bent tube' }], baseAmount: 1000, gstPercent: 12, gstAmount: 120, totalAmount: 1120 });
    d.pick = await m.PickList.create({ number: 'PL-0001', salesOrder: d.so._id, soNumber: 'SO-PR-1', customerName: 'Metro Wheels', lines: [{ lineNo: 1, product: d.frame._id, batch: oid(), batchNumber: 'B-77', location: 'A-01', quantity: 4 }] });
    d.wo = await m.WorkOrder.create({ woNumber: 'WO-PR-1', product: d.frame._id, bom: oid(), quantity: 5, demandType: 'MTS', fgReceivedQty: 5, fgApprovedQty: 5, fgQc: { status: 'PASSED', inspector: 'Asha', certificateNo: 'QC-0001', at: new Date(), checks: [{ name: 'Weld strength', standard: '>= 40 MPa', actual: '46 MPa', result: 'PASS' }] } });
    d.mr = await m.MaterialRequisition.create({ number: 'MR-0001', workOrder: d.wo._id, items: [{ product: d.frame._id, requiredQty: 5, reservedQty: 5, issuedQty: 0, uom: 'pcs' }] });
    d.sto = await m.StockTransferOrder.create({ transferNumber: 'STO-0001', fromWarehouse: 'Main store', toWarehouse: 'Plant 2', items: [{ batchNumber: 'B-77', productName: 'Frame', requestedQuantity: 3, dispatchedQuantity: 3, unitCost: 700 }] });
    d.jw = await m.JobWorkOrder.create({ kind: 'OUTWARD', number: 'JW-0001', party: d.sup._id, partyName: 'Steel Tubes Co', natureOfJob: 'Powder coating', items: [{ product: d.frame._id, description: 'Frame', hsnCode: '8714', quantity: 5, uom: 'pcs', value: 3500 }], poNumber: 'JWPO-0001', poIssuedAt: new Date(), processingCharge: 100, poGstRate: 18, returns: [{ challanNo: 'RC-0001', quantity: 5, vehicleNo: 'MH12AB1234' }] });
    d.pi = await m.ProformaInvoice.create({ number: 'PI-0001', salesOrder: d.so._id, soNumber: 'SO-PR-1', customer: d.cust._id, customerName: 'Metro Wheels', placeOfSupply: '24', items: [line], subTotal: 4000, totalIGST: 480, totalAmount: 4480, advanceRequested: 2000, parties });
    d.vch = await m.Voucher.create({ number: 'BR-0001', type: 'BANK_RECEIPT', date: new Date(), partyName: 'Metro Wheels', refDoc: { kind: 'INVOICE', number: 'INV-0001' }, amount: 4480, lines: [{ accountCode: '1100', accountName: 'Bank', debit: 4480, credit: 0 }, { accountCode: '1200', accountName: 'Debtors', debit: 0, credit: 4480 }], narration: 'Against INV-0001' });
    d.inv = await m.Invoice.create({ invoiceNumber: 'INV-0001', type: 'SALES', customer: d.cust._id, date: new Date(), dueDate: new Date(), soNumber: 'SO-PR-1', items: [line], subTotal: 4000, totalIGST: 480, totalAmount: 4480, placeOfSupply: '24', parties, hsnSummary: [{ hsnCode: '8714', taxableValue: 4000, cgst: 0, sgst: 0, igst: 480, totalTax: 480 }], irn: 'a'.repeat(64), ackNo: '112010', ackDate: new Date(), signedQr: 'eyJhbGciOiJSUzI1NiJ9.signed.qr' });
    d.bill = await m.Invoice.create({ invoiceNumber: 'VB-0001', type: 'PURCHASE', supplier: d.sup._id, vendorBillNumber: 'STC/889', date: new Date(), dueDate: new Date(), items: [{ ...line, description: 'Tubes' }], subTotal: 4000, totalIGST: 480, totalAmount: 4480, amountPaid: 1000, grnRefs: ['GRN-0009'] });
    d.dc = await m.DeliveryChallan.create({ number: 'DC-0001', salesOrder: d.so._id, soNumber: 'SO-PR-1', customer: d.cust._id, customerName: 'Metro Wheels', placeOfSupply: '24', reason: 'SUPPLY', items: [line], totalTaxable: 4000, transporterName: 'VRL', vehicleNo: 'GJ06XY9999', lrNo: 'LR-55', parties });
    d.po = await m.PurchaseOrder.create({ poNumber: 'PO-PR-1', supplier: d.sup._id, status: 'ORDERED', totalAmount: 5000, items: [{ product: d.frame._id, quantity: 10, unitPrice: 500, totalPrice: 5000 }] });
    d.quote = await m.Quotation.create({ quoteNumber: 'QT-PR-1', customer: d.cust._id, customerName: 'Metro Wheels', revision: 2, placeOfSupply: '24', items: [{ product: d.frame._id, productName: 'Frame', quantity: 4, unitPrice: 1000, totalPrice: 4000 }], totalAmount: 4000, taxSummary: { subTotal: 4000, totalCGST: 0, totalSGST: 0, totalIGST: 480, grandTotal: 4480 }, terms: 'Ex-works Pune' });
    d.grn = await m.GRN.create({ number: 'GRN-PR-1', po: d.po._id, poNumber: 'PO-PR-1', supplier: d.sup._id, gateEntryNo: 'G-1', vendorChallanNo: 'VC-9', vehicleNo: 'MH14AA1111', checklist: { quantityVerified: true }, items: [{ product: d.frame._id, orderedQty: 10, receivedQty: 10, unitPrice: 500, expiryDate: new Date('2030-01-01'), inspection: 'PARTIAL', acceptedQty: 8, scrapQty: 0, returnQty: 2 }] });
  }, 120000);
  afterAll(stopDb);

  it('prints every kind of document as a PDF', async () => {
    const all: [string, any][] = [['purchase-requisition', d.indent], ['rfq', d.rfq], ['purchase-return', d.ret], ['pick-list', d.pick], ['material-requisition', d.mr], ['stock-transfer', d.sto], ['jobwork-challan', d.jw], ['jobwork-po', d.jw], ['jobwork-return', d.jw], ['proforma', d.pi], ['voucher', d.vch], ['invoice', d.inv], ['vendor-bill', d.bill], ['delivery-challan', d.dc], ['qc-certificate', d.wo], ['purchase-order', d.po], ['sales-order', d.so], ['quotation', d.quote], ['grn', d.grn]];
    expect(all.map(([t]) => t).sort()).toEqual(Object.keys(r.types).sort()); // nothing left out of this test
    for (const [type, doc] of all) {
      const res = await pdf(type, doc);
      expect(res.status, `${type}: ${res.text.slice(0, 200)}`).toBe(200);
      expect(res.text.startsWith('%PDF'), type).toBe(true);
    }
  });

  it('a tax invoice prints its own GST, IRN with QR, HSN summary and bank details, from the record as issued', async () => {
    const s = await load('invoice', d.inv);
    expect(s).toMatchObject({ title: 'TAX INVOICE', number: 'INV-0001', copies: ['Original for Recipient'] });
    expect(s.seller.name).toBe('Prodexa Pvt Ltd');
    expect(s.totals).toEqual([['Taxable value', 'Rs. 4,000.00'], ['IGST', 'Rs. 480.00'], ['Total', 'Rs. 4,480.00', true]]);
    expect(s.einvoice.qr).toBe('eyJhbGciOiJSUzI1NiJ9.signed.qr');
    expect(s.einvoice.lines[0]).toEqual(['IRN', 'a'.repeat(64)]);
    expect(s.tables[0].rows).toEqual([{ hsn: '8714', tv: '4,000.00', c: '0.00', s: '0.00', i: '480.00', t: '480.00' }]);
    expect(s.notes.find((n: any) => n.label === 'Bank details').text).toMatch(/State Bank.*1234567890.*SBIN0000001/);
    expect((await load('invoice', d.inv, 'copies=all')).copies).toHaveLength(3);
    // the old invoice URL gives the same document; a purchase invoice there prints as the vendor bill
    const viaOld = await call(r.invoice.GET, 'GET', undefined, { id: id(d.inv) });
    expect(viaOld.status).toBe(200);
    expect((await load('invoice', d.bill)).title).toBe('PURCHASE BILL VOUCHER');
  });

  it('copies: three for challans, one when asked for a single copy', async () => {
    expect((await load('delivery-challan', d.dc)).copies).toEqual(['Original for Consignee', 'Duplicate for Transporter', 'Triplicate for Consignor']);
    expect((await load('delivery-challan', d.dc, 'copy=Duplicate for Transporter')).copies).toEqual(['Duplicate for Transporter']);
    const three = await pages(() => r.challan.GET(new NextRequest('http://localhost/x'), { params: Promise.resolve({ id: id(d.dc) }) }));
    expect(three).toBe(3);
    expect((await load('jobwork-challan', d.jw)).copies).toHaveLength(3);
    expect((await load('purchase-return', d.ret)).copies).toHaveLength(3);
  });

  it('shows the document as saved, with no invented values', async () => {
    const dc = await load('delivery-challan', d.dc);
    expect(dc.rows).toEqual([{ n: 1, item: 'Frame', hsn: '8714', qty: '4', uom: 'pcs', val: '4,000.00' }]);
    expect(dc.parties[1]).toMatchObject({ name: 'VRL', lines: ['Vehicle: GJ06XY9999', 'LR / bilty: LR-55'] });
    const vb = await load('vendor-bill', d.bill);
    expect(vb.totals.at(-1)).toEqual(['Balance payable', 'Rs. 3,480.00', true]);
    expect(vb.meta).toContainEqual(['Supplier bill no.', 'STC/889']);
    const v = await load('voucher', d.vch);
    expect(v.meta).toContainEqual(['Reference', 'INV-0001']);
    expect(v.totals).toContainEqual(['Total debit', 'Rs. 4,480.00']);
    const pr = await load('purchase-requisition', d.indent);
    expect(pr.rows[0]).toMatchObject({ item: 'Frame (FR-PR)', qty: '10', sup: 'Steel Tubes Co' });
    const po = await load('jobwork-po', d.jw);
    expect(po.totals).toEqual([['Processing charges', 'Rs. 500.00'], ['GST @ 18%', 'Rs. 90.00'], ['Total', 'Rs. 590.00', true]]);
    expect((await load('jobwork-return', d.jw, 'challan=RC-0001')).number).toBe('RC-0001');
    expect((await load('qc-certificate', d.wo)).rows[0]).toMatchObject({ name: 'Weld strength', res: 'PASS' });
  });

  it('orders and quotations carry the same GST as their screens; the GRN shows what was received and accepted', async () => {
    // PO: supplier in our state, so CGST + SGST on 10 x 500 at 12%
    expect((await load('purchase-order', d.po)).totals).toEqual([['Taxable value', 'Rs. 5,000.00'], ['CGST', 'Rs. 300.00'], ['SGST', 'Rs. 300.00'], ['Total', 'Rs. 5,600.00', true]]);
    // SO: customer in Gujarat, so IGST
    const so = await load('sales-order', d.so);
    expect(so.totals).toEqual([['Taxable value', 'Rs. 4,000.00'], ['IGST', 'Rs. 480.00'], ['Total', 'Rs. 4,480.00', true]]);
    expect(so.meta).toContainEqual(['Place of supply', '24-Gujarat']);
    // quotation: the GST saved on it, and its revision in the number
    const q = await load('quotation', d.quote);
    expect(q.number).toBe('QT-PR-1 Rev-02');
    expect(q.totals.at(-1)).toEqual(['Total', 'Rs. 4,480.00', true]);
    expect(q.notes).toContainEqual({ label: 'Terms and conditions', text: 'Ex-works Pune' });
    const g = await load('grn', d.grn);
    // quantities carry the unit; the QC result sits with the item
    expect(g.rows[0]).toMatchObject({ ord: '10', rec: '10 pcs', acc: '8 pcs', rej: '2 pcs' });
    expect(g.rows[0].item).toMatch(/QC: Partial/);
    expect(g.totals.at(-1)[0]).toBe('Total'); // received value with GST
    expect(g.meta).toContainEqual(['Vendor challan', 'VC-9']);
  });

  it('says "not found" for a missing document and refuses people who may not see it', async () => {
    expect((await call(r.print.GET, 'GET', undefined, { type: 'rfq', id: String(oid()) })).status).toBe(404);
    expect((await call(r.print.GET, 'GET', undefined, { type: 'no-such-thing', id: id(d.rfq) })).status).toBe(404);
    expect((await call(r.invoice.GET, 'GET', undefined, { id: 'INV-NOPE' })).status).toBe(404);
    const noQc = await m.WorkOrder.create({ woNumber: 'WO-PR-2', product: d.frame._id, bom: oid(), quantity: 1, demandType: 'MTS' });
    expect((await pdf('qc-certificate', noQc)).status).toBe(404); // no certificate issued yet
    asRole('SALES');
    expect((await pdf('voucher', d.vch)).status).toBe(403);
    expect((await pdf('purchase-requisition', d.indent)).status).toBe(403);
    expect((await pdf('proforma', d.pi)).status).toBe(200);
    asRole('PRODUCTION_MANAGER');
    expect((await pdf('invoice', d.inv)).status).toBe(403);
    expect((await pdf('qc-certificate', d.wo)).status).toBe(200);
    asAdmin();
  });
});
