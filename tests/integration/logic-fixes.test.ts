import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// Fixes from LOGIC_REVIEW: PO approval bypasses (P1,P2,P8), no fake success, GRN over-receipt (G1/G2), double inspection (G3)
describe('logic review fixes: PO and GRN', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const gate = { gateEntryNo: 'GE-1', vendorChallanNo: 'VC-1', vehicleNo: 'MH12AB1234', checklist: { quantityVerified: true, packingIntact: true, documentsVerified: true } };
  const newPo = (qty: number, extra: any = {}) => m.PO.create({ poNumber: `PO-${Math.random().toString(36).slice(2, 7).toUpperCase()}`, supplier: d.sup._id, status: 'ORDERED', totalAmount: qty * 100, items: [{ product: d.prod._id, quantity: qty, receivedQuantity: 0, unitPrice: 100, totalPrice: qty * 100 }], ...extra });
  const grn = (po: any, lines: any[]) => { asAdmin(); return call(r.grns.POST, 'POST', { poId: id(po), ...gate, items: lines.map(l => ({ product: id(d.prod), expiryDate: '2030-01-01', ...l })) }); };

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Supplier: 'Supplier', PO: 'PurchaseOrder', GRN: 'GRN', Batch: 'Batch', Journal: 'JournalEntry', CycleCount: 'CycleCount' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.purchase = await import('@/app/api/purchase/route');
    r.purchaseId = await import('@/app/api/purchase/[id]/route');
    r.grns = await import('@/app/api/grn/route');
    r.grn = await import('@/app/api/grn/[id]/route');
    r.cycleCounts = await import('@/app/api/inventory/cycle-counts/route');
    d.prod = await m.Product.create({ name: 'Steel Tube', sku: 'RM-L', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '7306', gstRate: 18 });
    d.sup = await m.Supplier.create({ name: 'Local Steel', code: 'S-L', gstin: '27AAPFU0939F1ZV', paymentTerms: 'NET 30' });
  }, 120000);
  afterAll(stopDb);

  it('a PO above the finance limit cannot be released by a supply chain manager, or marked received by hand', async () => {
    asRole('FINANCE_MANAGER');
    const c = await call(r.purchase.POST, 'POST', { supplier: id(d.sup), items: [{ product: id(d.prod), quantity: 100, unitPrice: 1000 }] });
    expect(c.status).toBe(201);
    expect(c.json.status).toBe('PENDING_APPROVAL');
    asRole('SUPPLY_CHAIN_MANAGER');
    const rel = await call(r.purchaseId.PATCH, 'PATCH', { status: 'ORDERED' }, { id: c.json._id });
    expect(rel.status).toBe(403);
    asAdmin();
    const rcv = await call(r.purchaseId.PATCH, 'PATCH', { status: 'RECEIVED' }, { id: c.json._id });
    expect(rcv.status).toBe(409);
  });

  it('only purchasing roles can raise a PO, and a bad body is refused rather than faked', async () => {
    asRole('SALES');
    expect((await call(r.purchase.POST, 'POST', { supplier: id(d.sup), items: [{ product: id(d.prod), quantity: 1, unitPrice: 1 }] })).status).toBe(403);
    asAdmin();
    expect((await call(r.purchase.POST, 'POST', { supplier: id(d.sup), items: [{ product: id(d.prod), quantity: -5, unitPrice: 1 }] })).status).toBe(400);
  });

  it('an ordered PO cannot be edited, and cannot be cancelled once goods arrived', async () => {
    const po = await newPo(10);
    asAdmin();
    expect((await call(r.purchaseId.PATCH, 'PATCH', { items: [{ product: id(d.prod), quantity: 1, unitPrice: 1 }] }, { id: id(po) })).status).toBe(409);
    expect((await grn(po, [{ receivedQty: 4 }])).status).toBe(201);
    expect((await call(r.purchaseId.PATCH, 'PATCH', { status: 'CANCELLED' }, { id: id(po) })).status).toBe(409);
  });

  it('duplicate lines for one product cannot take more than the open quantity', async () => {
    const po = await newPo(10);
    const res = await grn(po, [{ receivedQty: 8 }, { receivedQty: 8 }]);
    expect(res.status).toBe(400);
    expect(await m.GRN.countDocuments({ po: po._id })).toBe(0);
    expect((await m.PO.findById(po._id)).items[0].receivedQuantity).toBe(0);
  });

  it('two receipts at the same moment cannot both take the same balance', async () => {
    const po = await newPo(10);
    const [a, b] = await Promise.all([grn(po, [{ receivedQty: 7 }]), grn(po, [{ receivedQty: 7 }])]);
    expect([a.status, b.status].filter(x => x === 201)).toHaveLength(1);
    expect([a.status, b.status].filter(x => x === 409 || x === 400)).toHaveLength(1);
    const p = await m.PO.findById(po._id);
    expect(p.items[0].receivedQuantity).toBe(7);
    expect(await m.GRN.countDocuments({ po: po._id })).toBe(1);
  });

  it('an expired or invalid expiry date is refused', async () => {
    const po = await newPo(5);
    expect((await grn(po, [{ receivedQty: 1, expiryDate: '2001-01-01' }])).status).toBe(400);
    expect((await grn(po, [{ receivedQty: 1, expiryDate: 'nonsense' }])).status).toBe(400);
  });

  it('a GRN line cannot be inspected twice, in one request or two', async () => {
    const po = await newPo(10);
    const g = (await grn(po, [{ receivedQty: 10 }])).json;
    asRole('QUALITY_INSPECTOR');
    const dup = await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: 0, acceptedQty: 10 }, { index: 0, acceptedQty: 10 }] }, { id: g._id });
    expect(dup.status).toBe(400);
    const ok = await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: 0, acceptedQty: 10 }] }, { id: g._id });
    expect(ok.status).toBe(200);
    const again = await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: 0, acceptedQty: 10 }] }, { id: g._id });
    expect(again.status).toBe(409);
    expect(await m.Journal.countDocuments({ reference: g.number, referenceType: 'GRN_RECEIPT' })).toBe(1);
  });

  it('rejecting goods at inspection re-opens the quantity on the PO', async () => {
    const po = await newPo(10);
    const g = (await grn(po, [{ receivedQty: 10 }])).json;
    asRole('QUALITY_INSPECTOR');
    const res = await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: 0, acceptedQty: 6, returnQty: 4 }] }, { id: g._id });
    expect(res.status).toBe(200);
    const p = await m.PO.findById(po._id);
    expect(p.items[0].receivedQuantity).toBe(6);
    expect(p.status).toBe('PARTIALLY_RECEIVED');
  });

  it('cycle count creation snapshots real batch quantities and costs, and restricts who may create one', async () => {
    const warehouse = `CC-WH-${Math.random().toString(36).slice(2, 7)}`;
    const batch = await m.Batch.create({
      batchNumber: `CC-BATCH-${Math.random().toString(36).slice(2, 7)}`,
      product: d.prod._id,
      initialQuantity: 12,
      currentQuantity: 9,
      purchasePrice: 42,
      expiryDate: new Date('2030-01-01'),
      qualityStatus: 'APPROVED',
      location: warehouse,
    });
    asRole('STAFF');
    const created = await call(r.cycleCounts.POST, 'POST', {
      warehouse,
      targetBatches: [{ _id: id(batch), currentQuantity: 9000, unitCost: 0.01 }],
    });
    expect(created.status).toBe(201);
    expect(created.json.items).toHaveLength(1);
    expect(created.json.items[0].systemQuantity).toBe(9);
    expect(created.json.items[0].unitCost).toBe(42);

    const list = await call(r.cycleCounts.GET, 'GET');
    expect(list.status).toBe(200);
    expect(list.json.some((count: any) => count._id === created.json._id)).toBe(true);

    asRole('SALES');
    expect((await call(r.cycleCounts.POST, 'POST', { warehouse })).status).toBe(403);
  });
});
