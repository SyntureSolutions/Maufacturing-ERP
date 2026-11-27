import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id, state } from './harness';

// P9: pick lists, and the rule that a delivery challan only goes out for goods that were picked
describe('picking', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const rnd = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  const ghost = () => String(new mongoose.Types.ObjectId());
  const approvedOrder = async (qty: number, product = d.bike, status = 'APPROVED') => m.SO.create({
    soNumber: `SO-PK-${rnd()}`, customer: d.cust._id, customerName: 'Pick Buyer', status, items: [{ product: product._id, quantity: qty, unitPrice: 1000, totalPrice: qty * 1000 }], totalAmount: qty * 1000,
  });
  const stock = (product: any, qty: number, extra: any = {}) => m.Batch.create({ product: product._id, batchNumber: `B-${rnd()}`, expiryDate: new Date('2031-01-01'), initialQuantity: qty, currentQuantity: qty, allocatedQuantity: 0, purchasePrice: 500, qualityStatus: 'APPROVED', store: 'W1', ...extra });
  const make = (so: any, role = 'STAFF') => { asRole(role); return call(r.list.POST, 'POST', { salesOrderId: id(so) }); };
  const act = (pl: any, body: any, role = 'STAFF') => { asRole(role); return call(r.one.PATCH, 'PATCH', body, { id: id(pl) }); };
  const challan = (so: any, lines?: any) => { asRole('SUPPLY_CHAIN_MANAGER'); return call(r.dc.POST, 'POST', { salesOrderId: id(so), transporterName: 'FastMove', vehicleNo: 'MH12AB1234', lrNo: `LR-${rnd()}`, ...(lines ? { lines } : {}) }); };
  const fresh = async (x: any, M = m.PL) => (await M.findById(x._id || x).lean()) as any;
  const sold = async (so: any) => ((await m.SO.findById(so._id).lean()) as any).items[0].dispatchedQty;

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Customer: 'Customer', SO: 'SalesOrder', Batch: 'Batch', DC: 'DeliveryChallan', PL: 'PickList', Audit: 'AuditLog', Company: 'CompanySettings', User: 'User' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.list = await import('@/app/api/pick-lists/route');
    r.one = await import('@/app/api/pick-lists/[id]/route');
    r.dc = await import('@/app/api/delivery-challans/route');
    r.cancel = await import('@/app/api/delivery-challans/[id]/cancel/route');
    r.lock = await import('@/app/api/settings/period-lock/route');
    r.company = await import('@/app/api/settings/company/route');
    d.bike = await m.Product.create({ name: 'Road Bike', sku: 'FG-PK', category: new mongoose.Types.ObjectId(), productType: 'FINISHED_GOOD', hsnCode: '8712', gstRate: 18, uom: 'pcs' });
    d.lamp = await m.Product.create({ name: 'Lamp', sku: 'FG-LP', category: new mongoose.Types.ObjectId(), productType: 'FINISHED_GOOD', hsnCode: '9405', gstRate: 18, uom: 'pcs' });
    d.cust = await m.Customer.create({ name: 'Pick Buyer', code: 'C-PK', gstin: '27AAPFU0939F1ZV', billingAddress: '5 FC Road', city: 'Pune', pincode: '411004' });
    await m.Company.create({ key: 'company', legalName: 'Prodexa Pvt Ltd', gstin: '27AAPFU0939F1ZV', address1: '1 Rd', city: 'Pune', pincode: '411001', stateCode: '27' });
    await m.User.create({ _id: '65f011111111111111111100', name: 'Test Admin', email: 'admin@test.com', password: 'secret123', role: 'ADMIN' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  describe('making a pick list', () => {
    it('plans reserved batches first, then free stock earliest expiry first, one line per batch', async () => {
      const reserved = await stock(d.bike, 4, { allocatedQuantity: 4, expiryDate: new Date('2033-01-01') });
      const early = await stock(d.bike, 3, { expiryDate: new Date('2030-01-01') });
      const late = await stock(d.bike, 10, { expiryDate: new Date('2034-01-01') });
      const so = await approvedOrder(6);
      await m.SO.updateOne({ _id: so._id }, { allocatedBatches: [{ batch: reserved._id, product: d.bike._id, quantity: 4 }] });
      const res = await make(so);
      expect(res.status, JSON.stringify(res.json)).toBe(201);
      expect(res.json.number).toMatch(/^PICK-\d{4}-\d{4}$/);
      expect(res.json.status).toBe('OPEN');
      const lines = res.json.lines;
      expect(lines.map((l: any) => [l.batchNumber, l.quantity])).toEqual([[reserved.batchNumber, 4], [early.batchNumber, 2]]);   // 4 reserved, then 2 of the earliest-expiry free batch
      expect(lines.map((l: any) => l.lineNo)).toEqual([10, 20]);
      expect(lines.every((l: any) => l.pickedQty === 0 && l.dispatchedQty === 0)).toBe(true);
      expect(await m.Audit.countDocuments({ resourceName: res.json.number, action: 'CREATE' })).toBe(1);
      expect(String(late._id)).toBeTruthy();
    });

    it('a second list for the same order only covers what is not yet planned or picked', async () => {
      await stock(d.bike, 20);
      const so = await approvedOrder(5);
      const first = await make(so);
      expect(first.status).toBe(201);
      expect(first.json.lines.reduce((a: number, l: any) => a + l.quantity, 0)).toBe(5);
      const again = await make(so);
      expect(again.status).toBe(409);                        // all 5 are already on an open list
      expect(again.json.error).toContain('already picked');
      expect((await act(first.json, { action: 'cancel', reason: 'replanning the order' })).status).toBe(200);
      expect((await make(so)).status).toBe(201);             // freed again once that list is cancelled
    });

    it('is refused for an order that is not approved, with no usable stock, for unknown orders and for the wrong roles', async () => {
      await stock(d.bike, 5);
      for (const status of ['DRAFT', 'ON_HOLD', 'CANCELLED', 'FULFILLED']) {
        const so = await approvedOrder(1, d.bike, status);
        const res = await make(so);
        expect(res.status, status).toBe(409);
      }
      const nothing = await approvedOrder(2, d.lamp);
      const none = await make(nothing);
      expect(none.status).toBe(409);
      expect(none.json.error).toContain('no usable stock');
      await stock(d.lamp, 5, { qualityStatus: 'PENDING_QC' });
      await stock(d.lamp, 5, { store: 'QUARANTINE' });
      expect((await make(nothing)).status).toBe(409);        // stock that has not passed QC or sits in quarantine does not count
      const ok = await approvedOrder(1);
      for (const role of ['SALES', 'VIEWER', 'FINANCE_MANAGER', 'QUALITY_INSPECTOR']) expect((await make(ok, role)).status, role).toBe(403);
      asAdmin();
      expect((await call(r.list.POST, 'POST', { salesOrderId: ghost() })).status).toBe(404);
      expect((await call(r.list.POST, 'POST', { salesOrderId: 'nope' })).status).toBe(400);
    });
  });

  describe('confirming what was picked', () => {
    it('confirms everything as planned, once, and audits it', async () => {
      await stock(d.bike, 10);
      const so = await approvedOrder(3);
      const pl = (await make(so)).json;
      const res = await act(pl, { action: 'confirm', all: true });
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      expect(res.json.status).toBe('PICKED');
      expect(res.json.lines.every((l: any) => l.pickedQty === l.quantity)).toBe(true);
      expect(res.json.pickedByName).toBe('Test STAFF');
      expect((await act(pl, { action: 'confirm', all: true })).status).toBe(409);        // confirmed once only
      expect(await m.Audit.countDocuments({ resourceName: pl.number, action: 'APPROVE' })).toBe(1);
    });

    it('a short pick needs a reason, and an over-pick, a negative or an unknown line is refused; nothing is saved by a refused request', async () => {
      await stock(d.bike, 10);
      const so = await approvedOrder(4);
      const pl = (await make(so)).json;
      const line = pl.lines[0];
      expect((await act(pl, { action: 'confirm', lines: [{ lineId: line._id, pickedQty: 1 }] })).status).toBe(400);              // short, no reason
      expect((await act(pl, { action: 'confirm', lines: [{ lineId: line._id, pickedQty: 1, reason: 'x' }] })).status).toBe(400);  // reason too short
      expect((await act(pl, { action: 'confirm', lines: [{ lineId: line._id, pickedQty: line.quantity + 1 }] })).status).toBe(400);
      expect((await act(pl, { action: 'confirm', lines: [{ lineId: line._id, pickedQty: -1, reason: 'bad' }] })).status).toBe(400);
      expect((await act(pl, { action: 'confirm', lines: [{ lineId: ghost(), pickedQty: 1, reason: 'bad' }] })).status).toBe(400);
      expect((await fresh(pl)).status).toBe('OPEN');
      const ok = await act(pl, { action: 'confirm', lines: [{ lineId: line._id, pickedQty: 1, reason: 'damaged in the rack' }] });
      expect(ok.status, JSON.stringify(ok.json)).toBe(200);
      expect(ok.json.lines[0]).toMatchObject({ pickedQty: 1, shortReason: 'damaged in the rack' });
    });

    it('two people confirming at the same moment: one wins; wrong roles and unknown lists are refused', async () => {
      await stock(d.bike, 10);
      const so = await approvedOrder(2);
      const pl = (await make(so)).json;
      for (const role of ['SALES', 'VIEWER', 'FINANCE_MANAGER']) expect((await act(pl, { action: 'confirm', all: true }, role)).status, role).toBe(403);
      const both = await Promise.all([act(pl, { action: 'confirm', all: true }), act(pl, { action: 'confirm', all: true }, 'MANAGER')]);
      expect(both.map(x => x.status).sort()).toEqual([200, 409]);
      expect((await act({ _id: ghost() }, { action: 'confirm', all: true })).status).toBe(404);
      expect((await act({ _id: 'nope' }, { action: 'confirm', all: true })).status).toBe(404);
      expect((await act(pl, { action: 'unknown' })).status).toBe(400);
    });

    it('cannot be confirmed once the order is on hold or cancelled', async () => {
      await stock(d.bike, 10);
      const so = await approvedOrder(2);
      const pl = (await make(so)).json;
      await m.SO.updateOne({ _id: so._id }, { status: 'ON_HOLD' });
      expect((await act(pl, { action: 'confirm', all: true })).status).toBe(409);
      expect((await fresh(pl)).status).toBe('OPEN');
    });
  });

  describe('the delivery challan only goes out for picked goods', () => {
    it('is refused when nothing is picked, and nothing is claimed, taken from stock or numbered', async () => {
      const b = await stock(d.bike, 10);
      const so = await approvedOrder(3);
      const before = await m.DC.countDocuments({});
      const res = await challan(so);
      expect(res.status).toBe(409);
      expect(res.json.error).toContain('picked');
      expect(await sold(so)).toBe(0);
      expect(await m.DC.countDocuments({})).toBe(before);
      expect(((await m.Batch.findById(b._id).lean()) as any).currentQuantity).toBe(10);
      await make(so);                                           // planned but not confirmed is still not picked
      expect((await challan(so)).status).toBe(409);
    });

    it('dispatches what was picked, up to the picked quantity, and counts it on the pick list and the challan', async () => {
      const own = await m.Product.create({ name: 'Own Bike', sku: `OWN-${rnd()}`, category: new mongoose.Types.ObjectId(), productType: 'FINISHED_GOOD', hsnCode: '8712', gstRate: 18, uom: 'pcs' });   // its own product, so other tests' stock does not shape the plan
      await stock(own, 20);
      const so = await approvedOrder(6, own);
      const pl = (await make(so)).json;
      const line = pl.lines[0];
      await act(pl, { action: 'confirm', lines: [{ lineId: line._id, pickedQty: 4, reason: 'only 4 on the shelf' }, ...pl.lines.slice(1).map((l: any) => ({ lineId: l._id, pickedQty: 0, reason: 'none left' }))] });
      const tooMany = await challan(so, [{ product: id(own), quantity: 5 }]);
      expect(tooMany.status).toBe(409);
      expect(tooMany.json.error).toContain('Only 4');
      expect(await sold(so)).toBe(0);
      const part = await challan(so, [{ product: id(own), quantity: 3 }]);
      expect(part.status, JSON.stringify(part.json)).toBe(201);
      expect(part.json.pickClaims).toEqual([expect.objectContaining({ qty: 3 })]);
      expect((await fresh(pl)).lines[0].dispatchedQty).toBe(3);
      expect((await challan(so, [{ product: id(own), quantity: 2 }])).status).toBe(409);   // 1 picked unit is left
      expect((await challan(so, [{ product: id(own), quantity: 1 }])).status).toBe(201);
      expect((await fresh(pl)).lines[0].dispatchedQty).toBe(4);
      expect(await sold(so)).toBe(4);
    });

    it('two challans asked for at the same moment cannot use the same picked units, even when the order itself has room', async () => {
      const own = await m.Product.create({ name: 'Race Bike', sku: `RACE-${rnd()}`, category: new mongoose.Types.ObjectId(), productType: 'FINISHED_GOOD', hsnCode: '8712', gstRate: 18, uom: 'pcs' });
      await stock(own, 20);
      const so = await approvedOrder(8, own);                    // room for 6 on the order...
      const pl = (await make(so)).json;
      await act(pl, { action: 'confirm', lines: [{ lineId: pl.lines[0]._id, pickedQty: 4, reason: 'only 4 on the shelf' }] });   // ...but only 4 were picked
      const both = await Promise.all([challan(so, [{ product: id(own), quantity: 3 }]), challan(so, [{ product: id(own), quantity: 3 }])]);
      expect(both.map(x => x.status).sort()).toEqual([201, 409]);
      expect(await sold(so)).toBe(3);
      expect((await fresh(pl)).lines.reduce((a: number, l: any) => a + l.dispatchedQty, 0)).toBe(3);
    });

    it('cancelling the challan gives the picked goods back so they can go out again', async () => {
      await stock(d.bike, 20);
      const so = await approvedOrder(3);
      const pl = (await make(so)).json;
      await act(pl, { action: 'confirm', all: true });
      const dc = (await challan(so)).json;
      expect((await fresh(pl)).lines.reduce((a: number, l: any) => a + l.dispatchedQty, 0)).toBe(3);
      expect((await challan(so)).status).toBe(409);            // all of it is out
      asRole('SALES');
      expect((await call(r.cancel.POST, 'POST', { reason: 'wrong vehicle loaded' }, { id: id(dc) })).status).toBe(200);
      expect((await fresh(pl)).lines.reduce((a: number, l: any) => a + l.dispatchedQty, 0)).toBe(0);
      expect((await challan(so)).status).toBe(201);            // picked goods are available again, no new picking needed
    });

    it('a challan that fails part way (locked accounting period) gives the picked goods back', async () => {
      await stock(d.bike, 20, { purchasePrice: 700 });
      const so = await approvedOrder(2);
      const pl = (await make(so)).json;
      await act(pl, { action: 'confirm', all: true });
      asAdmin();
      await call(r.lock.PUT, 'PUT', { kind: 'ACCOUNTING', lockedUpTo: new Date(Date.now() + 86400000).toISOString().slice(0, 10) });
      const res = await challan(so);
      asAdmin();
      await call(r.lock.PUT, 'PUT', { kind: 'ACCOUNTING', lockedUpTo: '2000-01-01', password: 'secret123' });
      expect(res.status).not.toBe(201);
      expect((await fresh(pl)).lines.reduce((a: number, l: any) => a + l.dispatchedQty, 0)).toBe(0);
      expect(await sold(so)).toBe(0);
      expect((await challan(so)).status).toBe(201);
    });
  });

  describe('cancelling a pick list', () => {
    it('needs a reason, works while nothing is dispatched, and the goods then no longer count as picked', async () => {
      await stock(d.bike, 20);
      const so = await approvedOrder(2);
      const pl = (await make(so)).json;
      await act(pl, { action: 'confirm', all: true });
      expect((await act(pl, { action: 'cancel', reason: '' })).status).toBe(400);
      expect((await act(pl, { action: 'cancel', reason: 'order changed' }, 'SALES')).status).toBe(403);
      const res = await act(pl, { action: 'cancel', reason: 'order changed' });
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      expect(res.json.status).toBe('CANCELLED');
      expect((await act(pl, { action: 'cancel', reason: 'order changed' })).status).toBe(409);
      expect((await act(pl, { action: 'confirm', all: true })).status).toBe(409);
      expect((await challan(so)).status).toBe(409);            // cancelled picks do not allow dispatch
    });

    it('is refused when some of it was already dispatched', async () => {
      await stock(d.bike, 20);
      const so = await approvedOrder(2);
      const pl = (await make(so)).json;
      await act(pl, { action: 'confirm', all: true });
      expect((await challan(so, [{ product: id(d.bike), quantity: 1 }])).status).toBe(201);
      const res = await act(pl, { action: 'cancel', reason: 'too late to cancel' });
      expect(res.status).toBe(409);
      expect(res.json.error).toContain('delivery challan');
      expect((await fresh(pl)).status).toBe('PICKED');
    });
  });

  describe('reading pick lists', () => {
    it('lists and reads them with product names, for the roles that can see dispatch documents', async () => {
      await stock(d.bike, 20);
      const so = await approvedOrder(1);
      const pl = (await make(so)).json;
      asRole('SALES');
      const one = await call(r.one.GET, 'GET', undefined, { id: id(pl) });
      expect(one.status).toBe(200);
      expect(one.json.lines[0].product).toMatchObject({ sku: 'FG-PK', name: 'Road Bike' });
      const list = await call(r.list.GET, 'GET', undefined, undefined, `?salesOrder=${id(so)}`);
      expect(list.json.map((x: any) => x.number)).toEqual([pl.number]);
      asRole('QUALITY_INSPECTOR');
      expect((await call(r.one.GET, 'GET', undefined, { id: id(pl) })).status).toBe(403);
      asAdmin();
      expect((await call(r.one.GET, 'GET', undefined, { id: ghost() })).status).toBe(404);
      expect((await call(r.one.GET, 'GET', undefined, { id: 'nope' })).status).toBe(404);
      state.user = null;
      expect((await call(r.one.GET, 'GET', undefined, { id: id(pl) })).status).toBe(401);
      expect((await call(r.list.GET, 'GET')).status).toBe(401);
      asAdmin();
    });
  });

  describe('turning pick lists off', () => {
    const setPicking = async (on: boolean) => {
      asAdmin();
      const company = await call(r.company.GET, 'GET');
      const res = await call(r.company.PUT, 'PUT', { ...company.json, usePickLists: on });
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      return res.json;
    };
    afterAll(() => setPicking(true));

    it('is on by default, and the setting is kept when the profile is saved without it', async () => {
      expect((await call(r.company.GET, 'GET')).json.usePickLists).not.toBe(false);
      const company = (await call(r.company.GET, 'GET')).json;
      await setPicking(false);
      const { usePickLists, ...rest } = company;
      expect((await call(r.company.PUT, 'PUT', rest)).json.usePickLists).toBe(false);
    });

    it('a challan then goes out straight from the order, from the earliest-expiry batch', async () => {
      await setPicking(false);
      const p = await m.Product.create({ name: 'Bell', sku: `FG-BL-${rnd()}`, category: new mongoose.Types.ObjectId(), productType: 'FINISHED_GOOD', hsnCode: '8714', gstRate: 18, uom: 'pcs' });
      const late = await stock(p, 10, { expiryDate: new Date('2034-01-01') });
      const early = await stock(p, 3, { expiryDate: new Date('2030-01-01') });
      const so = await approvedOrder(5, p);
      const res = await challan(so);
      expect(res.status, JSON.stringify(res.json)).toBe(201);
      expect(res.json.pickClaims).toEqual([]);
      expect(res.json.stockMovements.map((x: any) => [String(x.batch), x.qty])).toEqual([[String(early._id), 3], [String(late._id), 2]]);
      expect(await sold(so)).toBe(5);
    });

    it('turned back on, an unpicked order is refused again', async () => {
      await setPicking(true);
      const p = await m.Product.create({ name: 'Horn', sku: `FG-HN-${rnd()}`, category: new mongoose.Types.ObjectId(), productType: 'FINISHED_GOOD', hsnCode: '8714', gstRate: 18, uom: 'pcs' });
      await stock(p, 10);
      const res = await challan(await approvedOrder(2, p));
      expect(res.status).toBe(409);
      expect(res.json.error).toMatch(/Pick the goods first/);
    });
  });
});
