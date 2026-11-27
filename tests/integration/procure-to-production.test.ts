import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// End-to-end: indent -> RFQ -> PO -> GRN -> QC -> put-away -> MRN -> WIP -> FG QC
describe('procure to production flow', () => {
  const m: any = {};     // models
  const r: any = {};     // route handlers
  const d: any = {};     // shared test data

  beforeAll(async () => {
    await startDb();
    const load = async (p: string) => import(/* @vite-ignore */ p);
    m.Product = (await import('@/models/Product')).default;
    m.Supplier = (await import('@/models/Supplier')).default;
    m.BOM = (await import('@/models/BillOfMaterials')).default;
    m.PO = (await import('@/models/PurchaseOrder')).default;
    m.Batch = (await import('@/models/Batch')).default;
    m.Account = (await import('@/models/Account')).default;
    m.Voucher = (await import('@/models/Voucher')).default;
    m.WO = (await import('@/models/WorkOrder')).default;
    m.Machine = (await import('@/models/Machine')).default;
    m.Scrap = (await import('@/models/ScrapEntry')).default;
    m.SFG = (await import('@/models/SFGStock')).default;
    r.indents = await load('@/app/api/purchase-indents/route');
    r.indent = await load('@/app/api/purchase-indents/[id]/route');
    r.rfqs = await load('@/app/api/rfqs/route');
    r.rfq = await load('@/app/api/rfqs/[id]/route');
    r.grns = await load('@/app/api/grn/route');
    r.grn = await load('@/app/api/grn/[id]/route');
    r.mrns = await load('@/app/api/mrn/route');
    r.mrn = await load('@/app/api/mrn/[id]/route');
    r.prod = await load('@/app/api/production/route');
    r.prodOne = await load('@/app/api/production/[id]/route');
    r.routing = await load('@/app/api/production/[id]/routing/route');
    r.stage = await load('@/app/api/production/[id]/stage-output/route');
    r.fgqc = await load('@/app/api/production/[id]/fg-qc/route');
    r.rtv = await load('@/app/api/purchase-returns/route');

    const cat = new mongoose.Types.ObjectId();
    d.rm = await m.Product.create({ name: 'Steel Tube', sku: 'RM-TUBE', category: cat, uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '7306', minStockLevel: 0 });
    d.fg = await m.Product.create({ name: 'City Bike', sku: 'FG-BIKE', category: cat, uom: 'pcs', productType: 'FINISHED_GOOD', hsnCode: '8712', gstRate: 18 });
    d.s1 = await m.Supplier.create({ name: 'Vendor One', code: 'SUP-1', email: 'v1@example.com' });
    d.s2 = await m.Supplier.create({ name: 'Vendor Two', code: 'SUP-2' });
    d.bom = await m.BOM.create({ product: d.fg._id, version: '1', status: 'ACTIVE', components: [{ product: d.rm._id, quantity: 2, unit: 'pcs', wastagePercentage: 0 }], routingSteps: [{ stepNumber: 1, description: 'Cutting', estimatedTimeMinutes: 10 }, { stepNumber: 2, description: 'Welding', estimatedTimeMinutes: 20 }] });
    d.m1 = await m.Machine.create({ name: 'Line 1', code: 'L1', type: 'WELD', status: 'AVAILABLE' });
    d.m2 = await m.Machine.create({ name: 'Line 2', code: 'L2', type: 'WELD', status: 'AVAILABLE' });
    asAdmin();
  }, 120000);

  afterAll(stopDb);

  it('raises, approves and consolidates indents into an RFQ with at least two vendors', async () => {
    const created = await call(r.indents.POST, 'POST', { items: [{ product: id(d.rm), quantity: 60 }, { product: id(d.rm), quantity: 40 }] });
    expect(created.status).toBe(201);
    d.indentIds = created.json.map(id);

    // cannot consolidate before approval
    const early = await call(r.rfqs.POST, 'POST', { indentIds: d.indentIds, supplierIds: [id(d.s1), id(d.s2)] });
    expect(early.status).toBe(409);

    for (const iid of d.indentIds) expect((await call(r.indent.PATCH, 'PATCH', { action: 'approve' }, { id: iid })).status).toBe(200);
    expect((await call(r.rfqs.POST, 'POST', { indentIds: d.indentIds, supplierIds: [id(d.s1)] })).status).toBe(400); // needs 2 vendors

    const rfq = await call(r.rfqs.POST, 'POST', { indentIds: d.indentIds, supplierIds: [id(d.s1), id(d.s2)] });
    expect(rfq.status).toBe(201);
    expect(rfq.json.items).toHaveLength(1);
    expect(rfq.json.items[0].quantity).toBe(100); // 60 + 40 merged
    d.rfqId = id(rfq.json);
  });

  it('records vendor quotes and awards the cheapest landed cost to a draft PO', async () => {
    const quote = (s: any, price: number, freight: number) => call(r.rfq.PATCH, 'PATCH', { action: 'quote', supplier: id(s), unitPrices: [{ product: id(d.rm), unitPrice: price }], freight, gstPercent: 18, leadTimeDays: 7 }, { id: d.rfqId });
    expect((await quote(d.s1, 10, 100)).status).toBe(200);
    expect((await quote(d.s2, 9, 500)).status).toBe(200);
    // incomplete quote rejected
    expect((await call(r.rfq.PATCH, 'PATCH', { action: 'quote', supplier: id(d.s1), unitPrices: [] }, { id: d.rfqId })).status).toBe(400);

    const award = await call(r.rfq.PATCH, 'PATCH', { action: 'award', supplier: id(d.s1) }, { id: d.rfqId });
    expect(award.status).toBe(200);
    expect(award.json.purchaseOrder.totalAmount).toBe(1280); // 100*10*1.18 + 100 freight
    expect(award.json.purchaseOrder.status).toBe('DRAFT');
    d.poId = id(award.json.purchaseOrder);
    await m.PO.updateOne({ _id: d.poId }, { status: 'ORDERED' }); // as if approved
  });

  it('receives goods into QUARANTINE and validates the gate details', async () => {
    const base = { poId: d.poId, gateEntryNo: 'GE-1', vendorChallanNo: 'VC-77', vehicleNo: 'MH12AB1234', checklist: { quantityVerified: true, packingIntact: true, documentsVerified: true }, items: [{ product: id(d.rm), receivedQty: 100, expiryDate: '2030-01-01' }] };
    expect((await call(r.grns.POST, 'POST', { ...base, gateEntryNo: '' })).status).toBe(400);
    expect((await call(r.grns.POST, 'POST', { ...base, checklist: { quantityVerified: true } })).status).toBe(400);
    expect((await call(r.grns.POST, 'POST', { ...base, items: [{ ...base.items[0], receivedQty: 101 }] })).status).toBe(400); // over open qty

    const ok = await call(r.grns.POST, 'POST', base);
    expect(ok.status).toBe(201);
    d.grnId = id(ok.json);
    const batch = await m.Batch.findOne({ grn: d.grnId });
    expect(batch.store).toBe('QUARANTINE');
    expect(batch.qualityStatus).toBe('PENDING_QC');
    expect((await m.PO.findById(d.poId)).status).toBe('RECEIVED');
  });

  it('keeps quarantined stock out of reservations', async () => {
    const wo = await call(r.prod.POST, 'POST', { product: id(d.fg), bom: id(d.bom), quantity: 10, demandType: 'MTS', plannedStartDate: '2026-10-01', plannedEndDate: '2026-10-10', autoAssign: true });
    expect(wo.status).toBe(201);
    expect(wo.json.assignedMachine).toBeTruthy(); // auto-assigned to a line
    d.woId = id(wo.json);
    const mrn = await call(r.mrns.POST, 'POST', { workOrderId: d.woId });
    expect(mrn.status).toBe(201);
    expect(mrn.json.shortfall).toBe(true);
    expect(mrn.json.items[0].reservedQty).toBe(0);
    // clean up so the real MRN can be created after put-away
    expect((await call(r.mrn.PATCH, 'PATCH', { action: 'cancel' }, { id: id(mrn.json) })).status).toBe(200);
  });

  it('inward QC: only QC roles can inspect; splits accepted / scrap / return and posts accounts + debit note', async () => {
    const payload = { action: 'inspect', items: [{ index: 0, acceptedQty: 80, scrapQty: 10, returnQty: 10, tests: [{ name: 'Visual', result: 'PASS' }] }] };
    asRole('STAFF');
    expect((await call(r.grn.PATCH, 'PATCH', payload, { id: d.grnId })).status).toBe(403);
    asRole('QUALITY_INSPECTOR');
    const bad = await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: 0, acceptedQty: 50, scrapQty: 10, returnQty: 10 }] }, { id: d.grnId });
    expect(bad.status).toBe(400); // does not add up to 100

    const res = await call(r.grn.PATCH, 'PATCH', payload, { id: d.grnId });
    expect(res.status).toBe(200);
    expect(res.json.purchaseReturn.totalAmount).toBe(100); // 10 x 10: goods only, GST is booked when the vendor bills what was kept
    expect(res.json.purchaseReturn.gstAmount).toBe(0);
    expect(res.json.purchaseReturn.debitNoteNumber).toMatch(/^DN-/);
    expect((await call(r.grn.PATCH, 'PATCH', payload, { id: d.grnId })).status).toBe(409); // cannot inspect twice

    const bal = async (code: string) => (await m.Account.findOne({ code })).balance;
    expect(await bal('2010')).toBe(900);   // payable 1000 less debit note 100
    expect(await bal('1030')).toBe(800);   // inventory (80 + 10) x 10 less 100 returned
    expect(await bal('5050')).toBe(100);   // scrap loss
    expect((await m.Account.findOne({ code: '1060' }))?.balance ?? 0).toBe(0);   // no GST has been booked yet, so none is reversed
    const batch = await m.Batch.findOne({ grn: d.grnId });
    expect(batch.currentQuantity).toBe(80);
    expect(batch.qualityStatus).toBe('APPROVED');
    expect(batch.store).toBe('QUARANTINE'); // still quarantined until put-away
    const dn = await m.Voucher.findOne({ type: 'DEBIT_NOTE' });
    expect(dn.lines.reduce((s: number, l: any) => s + l.debit, 0)).toBe(dn.lines.reduce((s: number, l: any) => s + l.credit, 0));
  });

  it('put-away validates the bin and releases stock for use', async () => {
    asRole('STAFF');
    expect((await call(r.grn.PATCH, 'PATCH', { action: 'putaway', index: 0, warehouse: 'W9', zone: 'A', rack: 'R1', bin: 'B1' }, { id: d.grnId })).status).toBe(400);
    const ok = await call(r.grn.PATCH, 'PATCH', { action: 'putaway', index: 0, warehouse: 'W1', zone: 'A', rack: 'R2', bin: 'B3' }, { id: d.grnId });
    expect(ok.status).toBe(200);
    expect(ok.json.grn.status).toBe('PUT_AWAY');
    const batch = await m.Batch.findOne({ grn: d.grnId });
    expect(batch.location).toBe('W1/A/R2/B3');
    expect((await call(r.grn.PATCH, 'PATCH', { action: 'putaway', index: 0, warehouse: 'W1', zone: 'A', rack: 'R2', bin: 'B3' }, { id: d.grnId })).status).toBe(409);
    expect((await call(r.rtv.GET, 'GET')).json).toHaveLength(1);
  });

  it('MRN reserves released stock and the store issue needs scan confirmation', async () => {
    asAdmin();
    const mrn = await call(r.mrns.POST, 'POST', { workOrderId: d.woId });
    expect(mrn.status).toBe(201);
    expect(mrn.json.shortfall).toBe(false);
    expect(mrn.json.items[0].reservedQty).toBe(20); // 10 bikes x 2 tubes
    d.mrnId = id(mrn.json);
    expect((await call(r.mrns.POST, 'POST', { workOrderId: d.woId })).status).toBe(409); // one active MRN per WO

    const noScan = await call(r.mrn.PATCH, 'PATCH', { action: 'issue' }, { id: d.mrnId });
    expect(noScan.status).toBe(400);
    expect(noScan.json.error).toContain('Steel Tube');
    const wrong = await call(r.mrn.PATCH, 'PATCH', { action: 'issue', scans: ['SOMETHING-ELSE'] }, { id: d.mrnId });
    expect(wrong.status).toBe(400);

    const ok = await call(r.mrn.PATCH, 'PATCH', { action: 'issue', scans: ['rm-tube'] }, { id: d.mrnId });
    expect(ok.status).toBe(200);
    expect(ok.json.status).toBe('ISSUED');
    const batch = await m.Batch.findOne({ grn: d.grnId });
    expect(batch.currentQuantity).toBe(60);
    expect(batch.allocatedQuantity).toBe(0);
  });

  it('WIP: stage routing, output logging, scrap, SFG lots', async () => {
    expect((await call(r.stage.POST, 'POST', { seq: 1, input: 5, good: 5, operator: 'Ravi' }, { id: d.woId })).status).toBe(409); // WO not started and no routing
    expect((await call(r.prodOne.PATCH, 'PATCH', { status: 'IN_PROGRESS' }, { id: d.woId })).status).toBe(200);

    const routing = await call(r.routing.POST, 'POST', { fromBom: true }, { id: d.woId });
    expect(routing.status).toBe(200);
    expect(routing.json.stages.map((s: any) => s.name)).toEqual(['Cutting', 'Welding']);
    expect(routing.json.stages[0].inQty).toBe(10);

    const out = (seq: number, b: any) => call(r.stage.POST, 'POST', { seq, operator: 'Ravi', ...b }, { id: d.woId });
    expect((await out(1, { input: 10, good: 8, scrap: 1, rework: 0, notes: '' })).status).toBe(400);          // scrap needs a reason
    expect((await out(1, { input: 10, good: 8, scrap: 1, rework: 0, notes: 'cracked', operator: '' })).status).toBe(400); // operator required
    expect((await out(1, { input: 10, good: 5, scrap: 1, rework: 0, notes: 'x' })).status).toBe(400);          // does not add up
    expect((await out(1, { input: 11, good: 11, scrap: 0, rework: 0 })).status).toBe(409);                      // more than available

    const s1 = await out(1, { input: 10, good: 9, scrap: 1, rework: 0, notes: 'cracked tube' });
    expect(s1.status).toBe(200);
    expect(s1.json.stages[1].inQty).toBe(9); // good flows to the next stage
    expect(await m.Scrap.countDocuments({ store: 'SFG_SCRAP' })).toBe(1);
    const lot = await m.SFG.findOne({ stageSeq: 1 });
    expect(lot.quantity).toBe(9);
    expect(lot.conversionRatio).toBe(0.9);

    const s2 = await out(2, { input: 9, good: 8, scrap: 1, rework: 0, notes: 'weld porosity' });
    expect(s2.status).toBe(200);
    expect(s2.json.fgReceivedQty).toBe(8);
    expect((await m.SFG.findOne({ stageSeq: 1 })).remainingQty).toBe(0); // consumed by stage 2
  });

  it('final FG QC gate: inspector only, creates FG stock, unblocks completion', async () => {
    const body = { approvedQty: 7, scrapQty: 1, reason: 'paint run', signature: 'A. Inspector', checks: [{ name: 'Finish', result: 'PASS' }] };
    asRole('STAFF');
    expect((await call(r.fgqc.POST, 'POST', body, { id: d.woId })).status).toBe(403);
    asRole('QUALITY_INSPECTOR');
    expect((await call(r.fgqc.POST, 'POST', { ...body, signature: '' }, { id: d.woId })).status).toBe(400);
    expect((await call(r.fgqc.POST, 'POST', { ...body, approvedQty: 9 }, { id: d.woId })).status).toBe(409); // more than awaiting

    const ok = await call(r.fgqc.POST, 'POST', body, { id: d.woId });
    expect(ok.status).toBe(200);
    expect(ok.json.workOrder.qcStatus).toBe('PASSED');
    expect(ok.json.workOrder.fgQc.status).toBe('PARTIAL');
    const fg = await m.Batch.findOne({ product: d.fg._id });
    expect(fg.store).toBe('FG');
    expect(fg.currentQuantity).toBe(7);
    expect(await m.Scrap.countDocuments({ store: 'FG_SCRAP' })).toBe(2); // 1 from last-stage scrap + 1 from QC rejection

    asAdmin();
    const done = await call(r.prodOne.PATCH, 'PATCH', { status: 'COMPLETED' }, { id: d.woId });
    expect(done.status).toBe(200);
    expect(done.json.status).toBe('COMPLETED');
  });
});
