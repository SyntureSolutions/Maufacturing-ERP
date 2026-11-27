import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// Bills of materials: drafts are checked and editable; activating makes one default per item (the old one goes obsolete);
// the Admin can put activation behind the approval matrix; base quantity and purchase units scale into stock units
// for MRP, the material requisition and work orders.
describe('BOM lifecycle', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const oid = () => new mongoose.Types.ObjectId();
  const create = (body: any) => call(r.list.POST, 'POST', body);
  const patch = (bomId: string, body: any) => call(r.one.PATCH, 'PATCH', body, { id: bomId });

  beforeAll(async () => {
    await startDb();
    for (const n of ['Product', 'BillOfMaterials', 'Batch', 'WorkOrder']) { const mod: any = await import(/* @vite-ignore */ `@/models/${n}`); m[n] = mod.default || mod; }
    const appr: any = await import('@/models/ApprovalMatrix'); m.Request = appr.ApprovalRequest;
    r.list = await import('@/app/api/production/bom/route');
    r.one = await import('@/app/api/production/bom/[id]/route');
    r.rules = await import('@/app/api/approvals/rules/route');
    r.decide = await import('@/app/api/approvals/requests/[id]/route');
    r.wo = await import('@/app/api/production/route');
    m.mrn = await import('@/lib/mrn');
    m.mrp = await import('@/lib/mrpEngine');
    const item = (sku: string, extra: any = {}) => m.Product.create({ name: sku, sku, category: oid(), uom: 'kg', ...extra });
    d.masala = await item('FG-MASALA', { productType: 'FINISHED_GOOD' });
    d.chilli = await item('RM-CHILLI', { productType: 'RAW_MATERIAL', purchaseUom: 'bag', purchaseConversion: 25 });
    d.salt = await item('RM-SALT', { productType: 'RAW_MATERIAL' });
    d.premix = await item('SF-PREMIX', { productType: 'SEMI_FINISHED' });
    d.design = await item('SV-DESIGN', { productType: 'SERVICE' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('refuses a BOM that does not add up', async () => {
    const ok = { product: id(d.masala), baseQuantity: 100, components: [{ product: id(d.salt), quantity: 10 }] };
    expect((await create({ ...ok, baseQuantity: 0 })).json.error).toMatch(/Base quantity/);
    expect((await create({ ...ok, components: [] })).json.error).toMatch(/at least one component/);
    expect((await create({ ...ok, components: [{ product: id(d.masala), quantity: 1 }] })).json.error).toMatch(/component of itself/);
    expect((await create({ ...ok, components: [{ product: id(d.salt), quantity: 0 }] })).json.error).toMatch(/more than zero/);
    expect((await create({ ...ok, components: [{ product: id(d.salt), quantity: 1 }, { product: id(d.salt), quantity: 2 }] })).json.error).toMatch(/twice/);
    expect((await create({ ...ok, components: [{ product: id(d.salt), quantity: 1, unit: 'litre' }] })).json.error).toMatch(/not one of its units/);
    expect((await create({ ...ok, components: [{ product: id(d.design), quantity: 1 }] })).json.error).toMatch(/service/);
    expect((await create({ ...ok, components: [{ product: id(d.salt), quantity: 1, wastagePercentage: 100 }] })).json.error).toMatch(/wastage/);
    asRole('STAFF');
    expect((await create(ok)).status).toBe(403);
    asAdmin();
    expect(await m.BillOfMaterials.countDocuments()).toBe(0);
  });

  it('creates a draft with a base quantity and purchase units from the item master', async () => {
    const res = await create({ product: id(d.masala), baseQuantity: 100, components: [{ product: id(d.chilli), quantity: 2, unit: 'Bag', wastagePercentage: 2 }, { product: id(d.salt), quantity: 10 }] });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ version: '1', status: 'DRAFT', isDefault: false, baseQuantity: 100, createdBy: 'Test Admin' });
    expect(res.json.components[0]).toMatchObject({ unit: 'bag', unitFactor: 25 });
    expect(res.json.components[1]).toMatchObject({ unit: 'kg', unitFactor: 1 });
    d.v1 = res.json._id;
    // a draft is edited in place; the item it makes cannot change
    expect((await patch(d.v1, { notes: 'First recipe' })).json.notes).toBe('First recipe');
    expect((await patch(d.v1, { product: id(d.premix) })).status).toBe(400);
  });

  it('will not let a draft be used for a work order', async () => {
    const res = await call(r.wo.POST, 'POST', { product: id(d.masala), bom: d.v1, quantity: 50 });
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/Only an active BOM/);
  });

  it('activates a draft straight away when the approval matrix has no rule, and locks it', async () => {
    const res = await patch(d.v1, { action: 'activate' });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ status: 'ACTIVE', isDefault: true, activatedBy: 'Test Admin' });
    expect((await patch(d.v1, { notes: 'changed' })).status).toBe(409);
    expect((await call(r.one.DELETE, 'DELETE', undefined, { id: d.v1 })).status).toBe(409);
  });

  it('scales by base quantity and purchase units for the requisition and MRP', async () => {
    const wo = await call(r.wo.POST, 'POST', { product: id(d.masala), bom: d.v1, quantity: 250 });
    expect(wo.status).toBe(201);
    const mrn: any = await m.mrn.createMrnForWorkOrder(await m.WorkOrder.findById(wo.json._id), 'Test');
    const line = (p: any) => mrn.items.find((i: any) => String(i.product) === id(p));
    // 2 bags of 25 kg per 100 kg, +2% => 250 kg needs 127.5 kg; salt 10 kg per 100 kg => 25 kg
    expect(line(d.chilli)).toMatchObject({ requiredQty: 127.5, uom: 'kg' });
    expect(line(d.salt)).toMatchObject({ requiredQty: 25, uom: 'kg' });
    await m.mrn.releaseMrn(mrn);
    await m.WorkOrder.deleteMany({});

    const rows = await m.mrp.runMRP([{ product: id(d.masala), quantity: 100, requiredDate: new Date(), source: 'test' }], { includeReorder: false });
    expect(rows.find((x: any) => x.sku === 'RM-CHILLI').grossReq).toBe(51);
    expect(rows.find((x: any) => x.sku === 'RM-SALT').grossReq).toBe(10);
  });

  it('accepts part quantities on a work order (kg, litres)', async () => {
    const wo = await call(r.wo.POST, 'POST', { product: id(d.masala), bom: d.v1, quantity: 12.5 });
    expect(wo.status).toBe(201);
    expect(wo.json.quantity).toBe(12.5);
    expect((await call(r.wo.POST, 'POST', { product: id(d.masala), bom: d.v1, quantity: 0 })).status).toBe(400);
    expect((await call(r.wo.POST, 'POST', { product: id(d.premix), bom: d.v1, quantity: 5 })).json.error).toMatch(/not for this item/);
    await m.WorkOrder.deleteMany({});
  });

  it('changes an active BOM only through a new version, which retires the old default when activated', async () => {
    const copy = await patch(d.v1, { action: 'new-version' });
    expect(copy.status).toBe(201);
    expect(copy.json).toMatchObject({ version: '2', status: 'DRAFT', isDefault: false, copiedFrom: d.v1, baseQuantity: 100 });
    d.v2 = copy.json._id;
    await patch(d.v2, { components: [{ product: id(d.chilli), quantity: 50, unit: 'kg' }, { product: id(d.salt), quantity: 12 }] });
    expect((await patch(d.v2, { action: 'activate' })).json).toMatchObject({ status: 'ACTIVE', isDefault: true });
    const v1 = await m.BillOfMaterials.findById(d.v1).lean();
    expect(v1).toMatchObject({ status: 'OBSOLETE', isDefault: false });
    expect(await m.BillOfMaterials.countDocuments({ product: d.masala._id, isDefault: true })).toBe(1);
    const rows = await m.mrp.runMRP([{ product: id(d.masala), quantity: 100, requiredDate: new Date(), source: 'test' }], { includeReorder: false });
    expect(rows.find((x: any) => x.sku === 'RM-SALT').grossReq).toBe(12);
  });

  it('refuses a BOM that makes a loop through other items', async () => {
    const premix = await create({ product: id(d.premix), components: [{ product: id(d.salt), quantity: 1 }] });
    await patch(premix.json._id, { action: 'activate' });
    const withPremix = await patch(d.v2, { action: 'new-version' });
    await patch(withPremix.json._id, { components: [{ product: id(d.premix), quantity: 10 }] });
    await patch(withPremix.json._id, { action: 'activate' }); // masala now needs premix
    const loop = await patch(premix.json._id, { action: 'new-version' });
    const res = await patch(loop.json._id, { components: [{ product: id(d.masala), quantity: 1 }] }); // premix made from masala
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/loop: SF-PREMIX → FG-MASALA → SF-PREMIX/);
  });

  it('sends activation for approval when the Admin sets a BOM activation rule, and rejects back to draft', async () => {
    asRole('MANAGER');
    expect((await call(r.rules.PUT, 'PUT', { module: 'BOM_ACTIVATION', rules: [{ minAmount: 0, levels: ['PRODUCTION_MANAGER'] }] })).status).toBe(403);
    asAdmin();
    expect((await call(r.rules.PUT, 'PUT', { module: 'BOM_ACTIVATION', rules: [{ minAmount: 5000, levels: ['PRODUCTION_MANAGER'] }] })).status).toBe(400);
    expect((await call(r.rules.PUT, 'PUT', { module: 'BOM_ACTIVATION', rules: [{ minAmount: 0, levels: ['PRODUCTION_MANAGER', 'MANAGER'] }] })).status).toBe(200);

    asRole('PRODUCTION_MANAGER', 'Planner');
    const before: any = await m.BillOfMaterials.findOne({ product: d.masala._id, isDefault: true }).lean();
    const next = await patch(String(before._id), { action: 'new-version' });
    const sent = await patch(next.json._id, { action: 'activate' });
    expect(sent.status).toBe(202);
    expect(sent.json.request.levels).toEqual(['PRODUCTION_MANAGER', 'MANAGER']);
    expect((await m.BillOfMaterials.findById(next.json._id).lean()).status).toBe('PENDING_APPROVAL');
    expect((await patch(next.json._id, { notes: 'x' })).status).toBe(409); // locked while it waits
    // the current version stays in use meanwhile
    expect(String((await m.BillOfMaterials.findOne({ product: d.masala._id, isDefault: true }).lean())._id)).toBe(String(before._id));

    const reqId = id(await m.Request.findOne({ module: 'BOM_ACTIVATION', refId: next.json._id }));
    expect((await call(r.decide.PATCH, 'PATCH', { action: 'approve' }, { id: reqId })).status).toBe(403); // cannot approve own request
    asRole('PRODUCTION_MANAGER', 'Second Planner');
    expect((await call(r.decide.PATCH, 'PATCH', { action: 'approve' }, { id: reqId })).status).toBe(200);
    asRole('MANAGER', 'Plant Head');
    expect((await call(r.decide.PATCH, 'PATCH', { action: 'reject', remarks: 'Salt too high' }, { id: reqId })).status).toBe(200);
    const back: any = await m.BillOfMaterials.findById(next.json._id).lean();
    expect(back).toMatchObject({ status: 'DRAFT', isDefault: false, rejection: { by: 'Plant Head', role: 'MANAGER', remarks: 'Salt too high' } });

    // sent again, approved at both levels: it becomes the default
    asRole('PRODUCTION_MANAGER', 'Planner');
    expect((await patch(next.json._id, { action: 'activate' })).status).toBe(202);
    const again = id(await m.Request.findOne({ module: 'BOM_ACTIVATION', refId: next.json._id, status: 'PENDING' }));
    asRole('PRODUCTION_MANAGER', 'Second Planner');
    await call(r.decide.PATCH, 'PATCH', { action: 'approve' }, { id: again });
    asRole('MANAGER', 'Plant Head');
    expect((await call(r.decide.PATCH, 'PATCH', { action: 'approve' }, { id: again })).status).toBe(200);
    expect(await m.BillOfMaterials.findById(next.json._id).lean()).toMatchObject({ status: 'ACTIVE', isDefault: true, activatedBy: 'Plant Head' });
    expect((await m.BillOfMaterials.findById(before._id).lean()).status).toBe('OBSOLETE');
    asAdmin();
    await call(r.rules.PUT, 'PUT', { module: 'BOM_ACTIVATION', rules: [] });
  });

  it('lists only real BOMs and deletes drafts nobody uses', async () => {
    const all = (await call(r.list.GET, 'GET')).json;
    expect(all.every((b: any) => mongoose.isValidObjectId(b._id))).toBe(true);
    const draft = all.find((b: any) => b.status === 'DRAFT');
    expect((await call(r.one.DELETE, 'DELETE', undefined, { id: draft._id })).json.deleted).toBe(true);
    expect((await call(r.list.GET, 'GET', undefined, undefined, `?product=${id(d.premix)}`)).json.every((b: any) => b.product.sku === 'SF-PREMIX')).toBe(true);
  });
});
