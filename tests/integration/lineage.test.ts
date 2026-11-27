import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id, pickAll } from './harness';

// Document lineage: real links between documents, and one query that returns the whole chain around any of them
describe('document lineage', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const oid = () => new mongoose.Types.ObjectId();
  const lineage = (type: string, idOrNumber: string) => call(r.lineage.GET, 'GET', undefined, undefined, `?type=${type}&id=${encodeURIComponent(idOrNumber)}`);
  const numbers = (res: any) => res.json.nodes.map((n: any) => n.number).sort();
  const hasEdge = (res: any, from: string, to: string) => res.json.edges.some((e: any) => e.from.endsWith(from) && e.to.endsWith(to)) || res.json.edges.some((e: any) => {
    const f = res.json.nodes.find((n: any) => n.key === e.from), t = res.json.nodes.find((n: any) => n.key === e.to);
    return f?.number === from && t?.number === to;
  });

  beforeAll(async () => {
    await startDb();
    const load = async (p: string) => import(/* @vite-ignore */ p);
    for (const [k, p] of Object.entries({ Product: 'Product', Customer: 'Customer', SO: 'SalesOrder', Enquiry: 'Enquiry', Quote: 'Quotation', WO: 'WorkOrder', DC: 'DeliveryChallan', Invoice: 'Invoice', PO: 'PurchaseOrder', Supplier: 'Supplier', Indent: 'PurchaseIndent', RFQ: 'RFQ', GRN: 'GRN', Voucher: 'Voucher', MRPRun: 'MRPRun' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.lineage = await load('@/app/api/lineage/route');
    r.backfill = await load('@/app/api/lineage/backfill/route');
    r.convert = await load('@/app/api/enquiries/[id]/convert/route');
    r.quote = await load('@/app/api/quotations/[id]/route');
    r.production = await load('@/app/api/production/route');
    r.company = await load('@/app/api/settings/company/route');
    r.dc = await load('@/app/api/delivery-challans/route');
    r.inv = await load('@/app/api/dispatch/invoices/route');

    const cat = oid();
    d.bike = await m.Product.create({ name: 'City Bike', sku: 'FG-BIKE', category: cat, productType: 'FINISHED_GOOD', hsnCode: '8712', gstRate: 18, uom: 'pcs' });
    // work orders are only raised against an active BOM of the item
    const BOM: any = (await import('@/models/BillOfMaterials')).default;
    d.bom = String((await BOM.create({ product: d.bike._id, version: '1', status: 'ACTIVE', isDefault: true, components: [{ product: new mongoose.Types.ObjectId(), quantity: 1, unit: 'pcs' }] }))._id);
    d.cust = await m.Customer.create({ name: 'Pune Wheels', code: 'C-2', gstin: '27AAPFU0939F1ZV', billingAddress: '5 FC Road', city: 'Pune', pincode: '411004', email: 'p@example.com', phone: '9876543210', creditLimit: 99999999 });
    asRole('FINANCE_MANAGER');
    await call(r.company.PUT, 'PUT', { legalName: 'Prodexa Pvt Ltd', gstin: '27AAPFU0939F1ZV', address1: '1 Factory Rd', city: 'Pune', pincode: '411001', bank: { name: 'HDFC', accountNo: '123456', ifsc: 'HDFC0001' } });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('the sales side is linked as documents are created: enquiry > quotation > order > work order, challan > invoice', async () => {
    const enq = await m.Enquiry.create({ enquiryNumber: 'ENQ-L-1', customerName: 'Pune Wheels', items: [{ productName: 'City Bike', estimatedQuantity: 5 }] });
    const conv = await call(r.convert.POST, 'POST', { unitPrice: 1000 }, { id: id(enq) });
    expect(conv.status).toBe(201);
    const quote = await m.Quote.findById(conv.json.quotation._id);
    expect(String(quote.enquiry)).toBe(id(enq));

    // give the quote a registered customer and a product, then win it
    await m.Quote.updateOne({ _id: quote._id }, { customer: d.cust._id, stage: 'QUOTATION_SENT', items: [{ product: d.bike._id, productName: 'City Bike', quantity: 5, unitPrice: 1000, totalPrice: 5000 }], totalAmount: 5000 });
    const won = await call(r.quote.PATCH, 'PATCH', { stage: 'PO_RECEIVED', poNumber: 'CUST-PO-L1' }, { id: id(quote) });
    expect(won.status).toBe(200);
    const so = await m.SO.findById(won.json.createdSalesOrder._id);
    expect(String(so.quotation)).toBe(id(quote));
    d.enq = enq; d.quoteDoc = quote; d.so = so;

    const wo = await call(r.production.POST, 'POST', { product: id(d.bike), bom: d.bom, quantity: 5, demandType: 'MTO', salesOrderRef: so.soNumber });
    expect(wo.status).toBe(201);
    expect(String(wo.json.salesOrder)).toBe(id(so));
    d.wo = wo.json;

    await m.SO.updateOne({ _id: so._id }, { status: 'APPROVED' });
    await pickAll(id(so), true);
    const dc = await call(r.dc.POST, 'POST', { salesOrderId: id(so), transporterName: 'FastMove', vehicleNo: 'MH12AB1234', lrNo: 'LR-1' });
    expect(dc.status, JSON.stringify(dc.json)).toBe(201);
    const inv = await call(r.inv.POST, 'POST', { salesOrderId: id(so), dcId: id(dc.json) });
    expect(inv.status).toBe(201);
    expect(String(inv.json.deliveryChallan)).toBe(id(dc.json));
    d.dcDoc = dc.json; d.invDoc = inv.json;
  });

  it('the purchase side hangs off the same order and ends in a payment', async () => {
    const sup = await m.Supplier.create({ name: 'Steel Co', code: 'S-L', gstin: '27AAPFU0939F1ZV' });
    d.indent = (await m.Indent.collection.insertOne({ number: 'IND-L-1', source: 'MRP', status: 'RFQ_CREATED', items: [], salesOrder: d.so._id, createdAt: new Date() })).insertedId;
    const poId = oid();
    d.rfq = (await m.RFQ.collection.insertOne({ number: 'RFQ-L-1', indents: [d.indent], items: [], suppliers: [sup._id], status: 'AWARDED', purchaseOrder: poId, createdAt: new Date() })).insertedId;
    await m.Indent.collection.updateOne({ _id: d.indent }, { $set: { rfq: d.rfq } });
    await m.PO.collection.insertOne({ _id: poId, poNumber: 'PO-L-1', supplier: sup._id, status: 'RECEIVED', items: [], totalAmount: 1000, salesOrder: d.so._id, createdAt: new Date() });
    // a second order bought directly (no RFQ) for the same customer order
    await m.PO.collection.insertOne({ _id: oid(), poNumber: 'PO-L-2', supplier: sup._id, status: 'ORDERED', items: [], totalAmount: 50, salesOrder: d.so._id, createdAt: new Date() });
    await m.GRN.collection.insertOne({ number: 'GRN-L-1', po: poId, supplier: sup._id, items: [], createdAt: new Date() });
    const billId = oid();
    await m.Invoice.collection.insertOne({ _id: billId, invoiceNumber: 'BILL-L-1', type: 'PURCHASE', supplier: sup._id, order: poId, status: 'ISSUED', totalAmount: 1180, createdAt: new Date(), date: new Date() });
    await m.Voucher.collection.insertOne({ number: 'BP-L-1', type: 'BANK_PAYMENT', amount: 1180, status: 'POSTED', refDoc: { kind: 'INVOICE', number: 'BILL-L-1' }, date: new Date() });
    await m.Voucher.collection.insertOne({ number: 'BR-L-1', type: 'BANK_RECEIPT', amount: 5900, status: 'POSTED', refDoc: { kind: 'INVOICE', number: d.invDoc.invoiceNumber }, date: new Date() });
    d.po = poId;
  });

  it('from the sales order: everything before it and everything it led to, in the right shape', async () => {
    const res = await lineage('SALES_ORDER', d.so.soNumber);
    expect(res.status).toBe(200);
    const nums = numbers(res);
    for (const n of ['ENQ-L-1', d.quoteDoc.quoteNumber, d.so.soNumber, d.wo.woNumber, d.dcDoc.number, d.invDoc.invoiceNumber, 'BR-L-1', 'IND-L-1', 'RFQ-L-1', 'PO-L-1', 'PO-L-2', 'GRN-L-1', 'BILL-L-1', 'BP-L-1']) expect(nums, n).toContain(n);
    expect(hasEdge(res, 'ENQ-L-1', d.quoteDoc.quoteNumber)).toBe(true);
    expect(hasEdge(res, d.quoteDoc.quoteNumber, d.so.soNumber)).toBe(true);
    expect(hasEdge(res, d.so.soNumber, d.wo.woNumber)).toBe(true);
    expect(hasEdge(res, d.dcDoc.number, d.invDoc.invoiceNumber)).toBe(true);
    expect(hasEdge(res, d.so.soNumber, d.invDoc.invoiceNumber)).toBe(false);   // invoice hangs under its challan
    expect(hasEdge(res, 'RFQ-L-1', 'PO-L-1')).toBe(true);
    expect(hasEdge(res, d.so.soNumber, 'PO-L-1')).toBe(false);                 // bought through the RFQ, so it hangs under the RFQ
    expect(hasEdge(res, d.so.soNumber, 'PO-L-2')).toBe(true);                  // bought directly, so it hangs under the order
    expect(hasEdge(res, 'PO-L-1', 'GRN-L-1')).toBe(true);
    expect(hasEdge(res, 'PO-L-1', 'BILL-L-1')).toBe(true);
    expect(hasEdge(res, 'BILL-L-1', 'BP-L-1')).toBe(true);
    expect(res.json.nodes.find((n: any) => n.number === d.so.soNumber).amount).toBe(5000);
    expect(res.json.truncated).toBe(false);
  });

  it('from the middle of the chain it shows ancestors and descendants only, not unrelated siblings', async () => {
    const res = await lineage('PURCHASE_ORDER', 'PO-L-1');
    const nums = numbers(res);
    for (const n of ['ENQ-L-1', d.so.soNumber, 'IND-L-1', 'RFQ-L-1', 'PO-L-1', 'GRN-L-1', 'BILL-L-1', 'BP-L-1']) expect(nums, n).toContain(n);
    for (const n of ['PO-L-2', d.wo.woNumber, d.dcDoc.number]) expect(nums, n).not.toContain(n);
    const top = await lineage('ENQUIRY', 'ENQ-L-1');
    expect(numbers(top)).toContain('BP-L-1');
    const byId = await lineage('SALES_ORDER', id(d.so));
    expect(byId.json.root).toBe(`SALES_ORDER:${id(d.so)}`);
  });

  it('people who may not see finance get no money documents or amounts, and cannot start from one', async () => {
    asRole('SALES');
    const res = await lineage('SALES_ORDER', d.so.soNumber);
    expect(res.status).toBe(200);
    const nums = numbers(res);
    for (const n of [d.invDoc.invoiceNumber, 'BR-L-1', 'BILL-L-1', 'BP-L-1']) expect(nums, n).not.toContain(n);
    expect(nums).toContain('PO-L-1');
    expect(res.json.nodes.every((n: any) => n.amount === undefined)).toBe(true);
    expect((await lineage('INVOICE', d.invDoc.invoiceNumber)).status).toBe(403);
    expect((await lineage('VENDOR_BILL', 'BILL-L-1')).status).toBe(403);
    for (const role of ['HR_MANAGER', 'QUALITY_INSPECTOR']) { asRole(role); expect((await lineage('SALES_ORDER', d.so.soNumber)).status, role).toBe(403); }
    asRole('FINANCE_MANAGER');
    expect(numbers(await lineage('SALES_ORDER', d.so.soNumber))).toContain('BP-L-1');
    asAdmin();
  });

  it('rejects bad requests', async () => {
    expect((await lineage('NOT_A_TYPE', 'x')).status).toBe(400);
    expect((await call(r.lineage.GET, 'GET', undefined, undefined, '?type=SALES_ORDER')).status).toBe(400);
    expect((await lineage('SALES_ORDER', 'SO-DOES-NOT-EXIST')).status).toBe(404);
    expect((await lineage('SALES_ORDER', String(oid()))).status).toBe(404);
  });

  it('older records that only carry document numbers as text still show their chain', async () => {
    const enq = await m.Enquiry.create({ enquiryNumber: 'ENQ-OLD-1', customerName: 'Legacy', items: [{ productName: 'Bike', estimatedQuantity: 1 }] });
    const q = await m.Quote.create({ quoteNumber: 'QT-OLD-1', enquiryRef: 'ENQ-OLD-1', customerName: 'Legacy', stage: 'PO_RECEIVED', items: [], totalAmount: 100 });
    const so = await m.SO.create({ soNumber: 'SO-OLD-1', quotationRef: 'QT-OLD-1', customerName: 'Legacy', items: [{ product: d.bike._id, quantity: 1, unitPrice: 100, totalPrice: 100 }], totalAmount: 100 });
    const wo = await m.WO.create({ woNumber: 'WO-OLD-1', bom: oid(), product: d.bike._id, quantity: 1, demandType: 'MTO', salesOrderRef: 'SO-OLD-1', status: 'PLANNED' });
    const res = await lineage('SALES_ORDER', 'SO-OLD-1');
    expect(numbers(res)).toEqual(['ENQ-OLD-1', 'QT-OLD-1', 'SO-OLD-1', 'WO-OLD-1'].sort());
    d.legacy = { enq, q, so, wo };
  });

  it('the backfill turns those numbers into real links: a dry run changes nothing, a real run does, misses are listed', async () => {
    // one number that matches nothing, one that matches two documents
    await m.SO.create({ soNumber: 'SO-OLD-2', quotationRef: 'QT-MISSING', customerName: 'Legacy', items: [{ product: d.bike._id, quantity: 1, unitPrice: 1, totalPrice: 1 }], totalAmount: 1 });
    await m.WO.collection.insertOne({ woNumber: 'WO-OLD-2', bom: oid(), product: d.bike._id, quantity: 1, demandType: 'MTO', salesOrderRef: 'SO-OLD-1', status: 'PLANNED', createdAt: new Date() });

    asRole('FINANCE_MANAGER');
    expect((await call(r.backfill.POST, 'POST', {})).status).toBe(403);
    asAdmin();

    const dry = await call(r.backfill.POST, 'POST', {});
    expect(dry.status).toBe(200);
    expect(dry.json.dryRun).toBe(true);
    const find = (res: any, link: string) => res.json.report.find((x: any) => x.link === link);
    expect(find(dry, 'Quotation -> Enquiry').linked).toBeGreaterThanOrEqual(1);
    expect((await m.Quote.findById(d.legacy.q._id).lean()).enquiry).toBeUndefined();   // nothing written

    const real = await call(r.backfill.POST, 'POST', { dryRun: false });
    expect(real.json.dryRun).toBe(false);
    expect(String((await m.Quote.findById(d.legacy.q._id).lean()).enquiry)).toBe(id(d.legacy.enq));
    expect(String((await m.SO.findById(d.legacy.so._id).lean()).quotation)).toBe(id(d.legacy.q));
    expect(String((await m.WO.findById(d.legacy.wo._id).lean()).salesOrder)).toBe(id(d.legacy.so));
    expect(find(real, 'Sales order -> Quotation').unmatched.join()).toContain('QT-MISSING');

    const again = await call(r.backfill.POST, 'POST', { dryRun: false });                // safe to run twice
    expect(find(again, 'Quotation -> Enquiry').linked).toBe(0);
    expect(numbers(await lineage('SALES_ORDER', 'SO-OLD-1'))).toContain('ENQ-OLD-1');
  });

  it('re-check: a work order link cannot be forged from the request, and unlinked orders stay unlinked', async () => {
    const other = await m.SO.create({ soNumber: 'SO-FORGE-1', customerName: 'Other', items: [{ product: d.bike._id, quantity: 1, unitPrice: 1, totalPrice: 1 }], totalAmount: 1 });
    const body = { product: id(d.bike), bom: d.bom, quantity: 1, demandType: 'MTO', salesOrderRef: d.so.soNumber, salesOrder: id(other) };
    const res = await call(r.production.POST, 'POST', body);
    expect(res.status).toBe(201);
    expect(String(res.json.salesOrder)).toBe(id(d.so));                         // from the number, not from what was sent
    const mts = await call(r.production.POST, 'POST', { product: id(d.bike), bom: d.bom, quantity: 1, demandType: 'MTS', salesOrder: id(other) });
    expect(mts.status).toBe(201);
    expect(mts.json.salesOrder).toBeUndefined();
    expect(numbers(await lineage('SALES_ORDER', 'SO-FORGE-1'))).toEqual(['SO-FORGE-1']);
  });

  it('re-check: sub-assembly work orders appear under their parent work order; an MRP-only indent hangs under its MRP run', async () => {
    const parent = await m.WO.create({ woNumber: 'WO-P-1', bom: oid(), product: d.bike._id, quantity: 1, demandType: 'MTO', salesOrderRef: d.so.soNumber, salesOrder: d.so._id, status: 'PLANNED' });
    await m.WO.create({ woNumber: 'WO-P-1-SUB', bom: oid(), product: d.bike._id, quantity: 1, demandType: 'MTS', parentWorkOrder: parent._id, status: 'PLANNED' });
    const so = await lineage('SALES_ORDER', d.so.soNumber);
    expect(numbers(so)).toContain('WO-P-1-SUB');
    expect(hasEdge(so, 'WO-P-1', 'WO-P-1-SUB')).toBe(true);
    expect(hasEdge(so, d.so.soNumber, 'WO-P-1-SUB')).toBe(false);
    const sub = await lineage('WORK_ORDER', 'WO-P-1-SUB');
    expect(numbers(sub)).toEqual(expect.arrayContaining(['WO-P-1-SUB', 'WO-P-1', d.so.soNumber]));

    const run = (await m.MRPRun.collection.insertOne({ createdAt: new Date('2026-10-01') })).insertedId;
    await m.Indent.collection.insertOne({ number: 'IND-MRP-1', source: 'MRP', status: 'PENDING', items: [], mrpRun: run, createdAt: new Date() });
    const ind = await lineage('PURCHASE_INDENT', 'IND-MRP-1');
    expect(numbers(ind)).toEqual(['IND-MRP-1', 'MRP run 2026-10-01']);
    expect(hasEdge(ind, 'MRP run 2026-10-01', 'IND-MRP-1')).toBe(true);
  });

  it('re-check: a very long chain is cut off cleanly, with no edge pointing at a missing node', async () => {
    const { buildLineage, findDocument } = await import('@/lib/lineage');
    const start = await findDocument('SALES_ORDER', d.so.soNumber);
    const full = await buildLineage(start, true);
    expect(full.nodes.length).toBeGreaterThan(5);
    const cut = await buildLineage(start, true, 4);
    expect(cut.truncated).toBe(true);
    expect(cut.nodes.length).toBe(4);
    const keys = new Set(cut.nodes.map(n => n.key));
    expect(cut.edges.every(e => keys.has(e.from) && keys.has(e.to))).toBe(true);
  });

  it('re-check: the backfill also links invoices to their challan and order, and flags an ambiguous number instead of guessing', async () => {
    const so = await m.SO.create({ soNumber: 'SO-BF-1', customerName: 'BF', items: [{ product: d.bike._id, quantity: 1, unitPrice: 1, totalPrice: 1 }], totalAmount: 1 });
    await m.SO.collection.insertOne({ soNumber: 'SO-BF-1-DUP', customerName: 'BF', items: [], totalAmount: 1 });
    const dcId = oid();
    await m.DC.collection.insertOne({ _id: dcId, number: 'DC-BF-1', salesOrder: so._id, customer: d.cust._id, createdAt: new Date() });
    await m.Invoice.collection.insertOne({ invoiceNumber: 'INV-BF-1', type: 'SALES', dcRef: 'DC-BF-1', soNumber: 'SO-BF-1', status: 'ISSUED', totalAmount: 1, createdAt: new Date(), date: new Date() });
    await m.WO.collection.insertOne({ woNumber: 'WO-BF-1', bom: oid(), product: d.bike._id, quantity: 1, demandType: 'MTO', salesOrderRef: 'SO-DUP', status: 'PLANNED', createdAt: new Date() });
    await m.SO.collection.insertOne({ soNumber: 'SO-DUP', customerName: 'a', items: [], totalAmount: 1 });
    await m.SO.collection.dropIndex('soNumber_1').catch(() => {});             // allow a second order with the same number for this one case
    await m.SO.collection.insertOne({ soNumber: 'SO-DUP', customerName: 'b', items: [], totalAmount: 1 });
    const res = await call(r.backfill.POST, 'POST', { dryRun: false });
    const find = (link: string) => res.json.report.find((x: any) => x.link === link);
    const inv: any = await m.Invoice.findOne({ invoiceNumber: 'INV-BF-1' }).lean();
    expect(String(inv.deliveryChallan)).toBe(String(dcId));
    expect(String(inv.salesOrder)).toBe(id(so));
    expect(find('Work order -> Sales order').unmatched.join()).toContain('ambiguous');
    expect((await m.WO.findOne({ woNumber: 'WO-BF-1' }).lean()).salesOrder).toBeUndefined();
  });

  it('re-check 2: documents with a missing link show only themselves, never everything of that kind', async () => {
    await m.Voucher.collection.insertOne({ number: 'BP-ADV-1', type: 'BANK_PAYMENT', amount: 500, status: 'POSTED', date: new Date() });              // advance: no document reference
    await m.Voucher.collection.insertOne({ number: 'BR-ADV-1', type: 'BANK_RECEIPT', amount: 500, status: 'POSTED', date: new Date() });
    await m.GRN.collection.insertOne({ number: 'GRN-ORPHAN', items: [], createdAt: new Date() });                                                    // no purchase order
    await m.Invoice.collection.insertOne({ invoiceNumber: 'BILL-ORPHAN', type: 'PURCHASE', status: 'ISSUED', totalAmount: 1, createdAt: new Date(), date: new Date() });
    await m.DC.collection.insertOne({ number: 'DC-ORPHAN', createdAt: new Date() });
    for (const [type, number] of [['PAYMENT', 'BP-ADV-1'], ['RECEIPT', 'BR-ADV-1'], ['GRN', 'GRN-ORPHAN'], ['VENDOR_BILL', 'BILL-ORPHAN'], ['DELIVERY_CHALLAN', 'DC-ORPHAN']]) {
      const res = await lineage(type, number);
      expect(res.status, type).toBe(200);
      expect(numbers(res), type).toEqual([number]);
    }
  });

  it('re-check 2: a tax invoice can only use a challan of the same order that is still open', async () => {
    const so2 = await m.SO.create({ soNumber: 'SO-DCX-1', customer: d.cust._id, customerName: 'Pune Wheels', status: 'APPROVED', items: [{ product: d.bike._id, quantity: 1, unitPrice: 1000, totalPrice: 1000 }], totalAmount: 1000 });
    await pickAll(id(so2), true);
    const mine = await call(r.dc.POST, 'POST', { salesOrderId: id(so2), transporterName: 'FastMove', vehicleNo: 'MH12AB1234', lrNo: 'LR-2' });
    expect(mine.status).toBe(201);
    // d.dcDoc belongs to the first order and is already invoiced
    const wrong = await call(r.inv.POST, 'POST', { salesOrderId: id(so2), dcId: id(d.dcDoc) });
    expect(wrong.status).toBe(409);
    expect(wrong.json.error).toContain('different sales order');
    expect((await call(r.inv.POST, 'POST', { salesOrderId: id(d.so), dcId: id(d.dcDoc) })).status).toBe(409);       // already invoiced
    expect((await call(r.inv.POST, 'POST', { salesOrderId: id(so2), dcId: 'not-an-id' })).status).toBe(404);
    expect((await call(r.inv.POST, 'POST', { salesOrderId: id(so2), dcId: String(oid()) })).status).toBe(404);
    expect(await m.Invoice.countDocuments({ soNumber: 'SO-DCX-1' })).toBe(0);
    const ok = await call(r.inv.POST, 'POST', { salesOrderId: id(so2), dcId: id(mine.json) });
    expect(ok.status).toBe(201);
    expect(String(ok.json.deliveryChallan)).toBe(id(mine.json));
  });

  it('re-check 2: parent and MRP links on a new work order cannot be forged either', async () => {
    const victim = await m.WO.create({ woNumber: 'WO-VICTIM', bom: oid(), product: d.bike._id, quantity: 1, demandType: 'MTS', status: 'PLANNED' });
    const res = await call(r.production.POST, 'POST', { product: id(d.bike), bom: d.bom, quantity: 1, demandType: 'MTS', parentWorkOrder: id(victim), mrpRun: String(oid()) });
    expect(res.status).toBe(201);
    expect(res.json.parentWorkOrder).toBeUndefined();
    expect(res.json.mrpRun).toBeUndefined();
    expect(numbers(await lineage('WORK_ORDER', 'WO-VICTIM'))).toEqual(['WO-VICTIM']);
  });

  it('a PO raised from requisition lines hangs under those requisitions, and each requisition shows the PO', async () => {
    const sup = await m.Supplier.create({ name: 'Line Vendor', code: 'SUP-LINE', email: 'v@example.com' });
    const indA = await m.Indent.create({ number: 'IND-LINE-A', source: 'MANUAL', status: 'APPROVED', items: [{ lineNo: 10, product: d.bike._id, quantity: 5 }] });
    const indB = await m.Indent.create({ number: 'IND-LINE-B', source: 'MANUAL', status: 'APPROVED', items: [{ lineNo: 10, product: d.bike._id, quantity: 3 }] });
    await m.PO.create({ poNumber: 'PO-LINE-1', supplier: sup._id, status: 'ORDERED', totalAmount: 800,
      items: [{ product: d.bike._id, quantity: 8, unitPrice: 100, totalPrice: 800, sources: [{ indent: indA._id, lineNo: 10, quantity: 5 }, { indent: indB._id, lineNo: 10, quantity: 3 }] }] });
    const po = await lineage('PURCHASE_ORDER', 'PO-LINE-1');
    expect(numbers(po)).toEqual(['IND-LINE-A', 'IND-LINE-B', 'PO-LINE-1']);
    expect(hasEdge(po, 'IND-LINE-A', 'PO-LINE-1')).toBe(true);
    expect(hasEdge(po, 'IND-LINE-B', 'PO-LINE-1')).toBe(true);
    const a = await lineage('PURCHASE_INDENT', 'IND-LINE-A');
    expect(numbers(a)).toEqual(['IND-LINE-A', 'PO-LINE-1']);
    expect(hasEdge(a, 'IND-LINE-A', 'PO-LINE-1')).toBe(true);
  });
});
