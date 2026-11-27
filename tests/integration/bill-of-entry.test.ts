import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

describe('Bill of Entry for imports', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const gate = { gateEntryNo: 'GE-1', vendorChallanNo: 'VC-1', vehicleNo: 'MH12AB1234', checklist: { quantityVerified: true, packingIntact: true, documentsVerified: true } };
  const bal = async (code: string) => Math.round(((await m.Account.findOne({ code }))?.balance ?? 0) * 100) / 100;
  const today = () => new Date().toISOString().slice(0, 10);
  const newPo = (qty: number, price: number) => m.PO.create({ poNumber: `PO-${Math.random().toString(36).slice(2, 7).toUpperCase()}`, supplier: d.sup._id, status: 'ORDERED', totalAmount: qty * price, items: [{ product: d.prod._id, quantity: qty, receivedQuantity: 0, unitPrice: price, totalPrice: qty * price }] });
  const receive = async (qty: number, price: number) => {
    asAdmin();
    const po = await newPo(qty, price);
    const g = await call(r.grns.POST, 'POST', { poId: id(po), ...gate, items: [{ product: id(d.prod), receivedQty: qty, expiryDate: '2030-01-01' }] });
    asRole('QUALITY_INSPECTOR');
    await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: 0, acceptedQty: qty, scrapQty: 0, returnQty: 0 }] }, { id: id(g.json) });
    asAdmin();
    return await m.GRN.findById(g.json._id);
  };
  const boe = (grn: any, over: any = {}, role = 'FINANCE_MANAGER') => { asRole(role); return call(r.boe.POST, 'POST', { number: `BOE-${Math.random().toString(36).slice(2, 7)}`, date: today(), port: 'JNPT Nhava Sheva', grnId: id(grn), assessableValue: 100000, bcd: 10000, sws: 1000, igst: 19980, otherCharges: 2000, mode: 'BANK', paymentRef: 'UTR-CUST-1', ...over }); };
  const cost = async (grn: any) => ((await m.Batch.findOne({ grn: grn._id }).lean()) as any).purchasePrice;

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Supplier: 'Supplier', PO: 'PurchaseOrder', GRN: 'GRN', Batch: 'Batch', Account: 'Account', BoE: 'BillOfEntry', Lock: 'PeriodLock', User: 'User', Audit: 'AuditLog' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.grns = await import('@/app/api/grn/route');
    r.grn = await import('@/app/api/grn/[id]/route');
    r.boe = await import('@/app/api/bill-of-entry/route');
    r.cancel = await import('@/app/api/bill-of-entry/[id]/cancel/route');
    r.lineage = await import('@/app/api/lineage/route');
    r.lock = await import('@/app/api/settings/period-lock/route');
    d.prod = await m.Product.create({ name: 'Imported Gearset', sku: 'IMP-G', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '8714', gstRate: 18 });
    d.sup = await m.Supplier.create({ name: 'Shimano Japan', code: 'S-JP' });
    await m.User.create({ _id: '65f011111111111111111100', name: 'Test Admin', email: 'a@test.com', password: 'secret123', role: 'ADMIN' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('books duty into inventory, IGST as input credit, pays from the bank, and raises the goods\' cost per unit', async () => {
    const grn = await receive(100, 1000);                                  // 100 gearsets at 1000
    const [inv0, gst0, bank0] = [await bal('1030'), await bal('1060'), await bal('1010')];
    expect(await cost(grn)).toBe(1000);
    const res = await boe(grn);
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json).toMatchObject({ dutyForCost: 13000, igst: 19980, totalPaid: 32980, status: 'POSTED', grnNumber: grn.number });
    expect(await bal('1030')).toBe(inv0 + 13000);                          // duty, surcharge and charges become part of the goods' cost
    expect(await bal('1060')).toBe(gst0 + 19980);                          // IGST claimed
    expect(await bal('1010')).toBe(bank0 - 32980);                         // paid to customs
    expect(await cost(grn)).toBe(1130);                                    // 13000 / 100 units added to each
    d.boe1 = res.json; d.grn1 = grn;
  });

  it('refuses duplicates, bad amounts, bad dates, missing payment reference, unknown receipts and wrong roles', async () => {
    const grn = await receive(10, 100);
    const ok = await boe(grn, { number: 'BOE-DUP-1' });
    expect(ok.status).toBe(201);
    const other = await receive(10, 100);
    expect((await boe(other, { number: 'BOE-DUP-1' })).status).toBe(409);               // same number at the same port
    expect((await boe(other, { number: 'BOE-DUP-1', port: 'Chennai' })).status).toBe(201); // a different port is a different bill
    expect((await boe(grn)).status).toBe(409);                                           // that receipt already has one
    const third = await receive(10, 100);
    for (const [label, over] of [['negative duty', { bcd: -1 }], ['text amount', { igst: 'lots' }], ['nothing to book', { bcd: 0, sws: 0, igst: 0, otherCharges: 0 }], ['no number', { number: '' }], ['no port', { port: '' }],
      ['future date', { date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) }], ['bad date', { date: 'soon' }], ['bank without reference', { paymentRef: '' }]] as any[]) {
      expect((await boe(third, over)).status, label).toBe(400);
    }
    expect((await boe({ _id: String(new mongoose.Types.ObjectId()) })).status).toBe(404);
    expect((await boe({ _id: 'nope' })).status).toBe(404);
    for (const role of ['SALES', 'STAFF', 'MANAGER', 'VIEWER', 'HR_MANAGER']) expect((await boe(third, {}, role)).status, role).toBe(403);
    expect((await boe(third, { mode: 'CASH', paymentRef: '', number: 'BOE-CASH-1' }, 'SUPPLY_CHAIN_MANAGER')).status).toBe(201);   // cash needs no reference
    expect(await cost(third)).toBeGreaterThan(100);
  });

  it('the duty is shared across a receipt\'s batches by value', async () => {
    asAdmin();
    const second = await m.Product.create({ name: 'Imported Brakeset', sku: 'IMP-B', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '8714', gstRate: 18 });
    const po = await m.PO.create({ poNumber: 'PO-IMP-2', supplier: d.sup._id, status: 'ORDERED', totalAmount: 3000, items: [
      { product: d.prod._id, quantity: 10, receivedQuantity: 0, unitPrice: 100, totalPrice: 1000 }, { product: second._id, quantity: 20, receivedQuantity: 0, unitPrice: 100, totalPrice: 2000 }] });
    const g = await call(r.grns.POST, 'POST', { poId: id(po), ...gate, items: [{ product: id(d.prod), receivedQty: 10, expiryDate: '2030-01-01' }, { product: id(second), receivedQty: 20, expiryDate: '2031-01-01' }] });
    expect(g.status, JSON.stringify(g.json)).toBe(201);
    const grn = await m.GRN.findById(g.json._id);
    const res = await boe(grn, { bcd: 300, sws: 0, igst: 0, otherCharges: 0, mode: 'CASH' });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    const batches: any[] = await m.Batch.find({ grn: grn._id }).sort({ initialQuantity: 1 }).lean();
    expect(batches.map(b => b.purchasePrice)).toEqual([110, 110]);         // 300 over 30 units: 10 each
    d.shared = grn;
  });

  it('cancelling reverses the entry, restores the cost, and allows a corrected one', async () => {
    const [inv0, gst0, bank0] = [await bal('1030'), await bal('1060'), await bal('1010')];
    asRole('SUPPLY_CHAIN_MANAGER');
    expect((await call(r.cancel.POST, 'POST', { reason: 'wrong duty rate entered' }, { id: id(d.boe1) })).status).toBe(403);
    asRole('FINANCE_MANAGER');
    expect((await call(r.cancel.POST, 'POST', { reason: '' }, { id: id(d.boe1) })).status).toBe(400);
    const res = await call(r.cancel.POST, 'POST', { reason: 'wrong duty rate entered' }, { id: id(d.boe1) });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(await bal('1030')).toBe(inv0 - 13000);
    expect(await bal('1060')).toBe(gst0 - 19980);
    expect(await bal('1010')).toBe(bank0 + 32980);
    expect(await cost(d.grn1)).toBe(1000);                                  // back to the invoice price
    expect((await call(r.cancel.POST, 'POST', { reason: 'wrong duty rate entered' }, { id: id(d.boe1) })).status).toBe(409);   // already cancelled
    expect((await boe(d.grn1, { bcd: 9000 })).status).toBe(201);            // a corrected one is allowed (and the old number is free again)
    expect((await boe(await receive(5, 100), { number: d.boe1.number })).status).toBe(201);
    expect(await m.Audit.countDocuments({ resourceName: d.boe1.number, action: 'DELETE' })).toBe(1);
  });

  it('a locked accounting period refuses the entry and leaves costs untouched; the chain shows the Bill of Entry to finance only', async () => {
    const grn = await receive(10, 100);
    asAdmin();
    await call(r.lock.PUT, 'PUT', { kind: 'ACCOUNTING', lockedUpTo: new Date(Date.now() + 86400000).toISOString().slice(0, 10) });
    expect((await boe(grn)).status).not.toBe(201);
    asAdmin();
    expect((await call(r.lock.PUT, 'PUT', { kind: 'ACCOUNTING', lockedUpTo: '2000-01-01', password: 'secret123' })).status).toBe(200);
    expect(await cost(grn)).toBe(100);
    expect(await m.BoE.countDocuments({ grn: grn._id })).toBe(0);

    const withBoe = await boe(grn, { number: 'BOE-CHAIN-1' });
    expect(withBoe.status).toBe(201);
    asRole('FINANCE_MANAGER');
    const chain = await call(r.lineage.GET, 'GET', undefined, undefined, `?type=GRN&id=${grn.number}`);
    expect(chain.json.nodes.map((n: any) => n.number)).toContain('BOE-CHAIN-1');
    asRole('SUPPLY_CHAIN_MANAGER');
    expect((await call(r.lineage.GET, 'GET', undefined, undefined, `?type=GRN&id=${grn.number}`)).json.nodes.map((n: any) => n.number)).not.toContain('BOE-CHAIN-1');
    expect((await call(r.boe.GET, 'GET')).status).toBe(200);
    asRole('SALES');
    expect((await call(r.boe.GET, 'GET')).status).toBe(403);
    asAdmin();
  });
});
