import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// A1: a customer can be read, corrected and deleted by id
describe('customer edit and delete', () => {
  const m: any = {}, r: any = {};
  const rnd = () => Math.random().toString(36).slice(2, 7);
  const make = async (extra: any = {}) => {
    asAdmin();
    const res = await call(r.list.POST, 'POST', { name: `Cust ${rnd()}`, billingAddress: '12 Main Road', city: 'Pune', ...extra });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    return res.json;
  };

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Customer: 'Customer', SO: 'SalesOrder', Audit: 'AuditLog' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.list = await import('@/app/api/customers/route');
    r.one = await import('@/app/api/customers/[id]/route');
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('reads one customer, and answers 404 for an unknown or malformed id', async () => {
    const c = await make({ creditLimit: 5000 });
    const res = await call(r.one.GET, 'GET', undefined, { id: id(c) });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ code: c.code, creditLimit: 5000 });
    expect((await call(r.one.GET, 'GET', undefined, { id: String(new mongoose.Types.ObjectId()) })).status).toBe(404);
    expect((await call(r.one.GET, 'GET', undefined, { id: 'nope' })).status).toBe(404);
  });

  it('a patch changes only the fields sent and adds template fields to an existing customer', async () => {
    const c = await make({ phone: '999', salesAreas: [{ salesOrg: 'SO01', distributionChannel: '01', division: 'HV' }] });
    const res = await call(r.one.PATCH, 'PATCH', { accountGroup: 'PAYER', searchTerm: 'acme', region: 'mh', paymentMethod: 'Wire Transfer', pan: 'AAPFU0939F' }, { id: id(c) });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json).toMatchObject({ name: c.name, phone: '999', billingAddress: '12 Main Road', accountGroup: 'PAYER', searchTerm: 'ACME', region: 'MH', paymentMethod: 'Wire Transfer', pan: 'AAPFU0939F' });
    expect(res.json.salesAreas).toHaveLength(1);                                   // untouched
    const again = await call(r.one.PATCH, 'PATCH', { salesAreas: [{ salesOrg: 'SO02', distributionChannel: '02', division: 'LT' }] }, { id: id(c) });
    expect(again.json.salesAreas).toEqual([expect.objectContaining({ salesOrg: 'SO02', division: 'LT' })]);
    expect(again.json.accountGroup).toBe('PAYER');
  });

  it('a patch can deactivate a customer and a GSTIN sets the state code', async () => {
    const c = await make();
    const res = await call(r.one.PATCH, 'PATCH', { isActive: false, gstin: '27AAPFU0939F1ZV' }, { id: id(c) });
    expect(res.json).toMatchObject({ isActive: false, stateCode: '27', gstin: '27AAPFU0939F1ZV' });
  });

  it('refuses bad values, a blank name, and a changed Customer ID, leaving the customer as it was', async () => {
    const c = await make();
    for (const body of [{ name: '  ' }, { billingAddress: '' }, { gstin: 'BAD' }, { creditLimit: -5 }, { salesAreas: [{ salesOrg: 'XX', distributionChannel: '01', division: 'HV' }] }, { code: 'OTHER-1' }]) {
      expect((await call(r.one.PATCH, 'PATCH', body, { id: id(c) })).status, JSON.stringify(body)).toBe(400);
    }
    expect((await call(r.one.PATCH, 'PATCH', { phone: '1' }, { id: String(new mongoose.Types.ObjectId()) })).status).toBe(404);
    const after: any = await m.Customer.findById(c._id).lean();
    expect(after).toMatchObject({ name: c.name, code: c.code, billingAddress: '12 Main Road' });
  });

  it('only Admin, Manager, Sales and Finance Manager may edit; only Admin and Manager may delete', async () => {
    const c = await make();
    for (const role of ['STAFF', 'VIEWER', 'PRODUCTION_MANAGER', 'SUPPLY_CHAIN_MANAGER', 'QUALITY_INSPECTOR']) {
      asRole(role);
      expect((await call(r.one.PATCH, 'PATCH', { phone: '1' }, { id: id(c) })).status, role).toBe(403);
    }
    for (const role of ['SALES', 'FINANCE_MANAGER']) {
      asRole(role);
      expect((await call(r.one.PATCH, 'PATCH', { phone: '2' }, { id: id(c) })).status, role).toBe(200);
      expect((await call(r.one.DELETE, 'DELETE', undefined, { id: id(c) })).status, role).toBe(403);
    }
    expect(await m.Customer.countDocuments({ _id: c._id })).toBe(1);
  });

  it('a customer with orders is kept (409); an unused one can be deleted', async () => {
    const used = await make(), unused = await make();
    await m.SO.create({ soNumber: `SO-A1-${rnd()}`, customer: used._id, customerName: used.name, status: 'DRAFT', totalAmount: 10, items: [] });
    asRole('MANAGER');
    const blocked = await call(r.one.DELETE, 'DELETE', undefined, { id: id(used) });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error).toContain('inactive');
    expect(await m.Customer.countDocuments({ _id: used._id })).toBe(1);
    expect((await call(r.one.DELETE, 'DELETE', undefined, { id: id(unused) })).status).toBe(200);
    expect(await m.Customer.countDocuments({ _id: unused._id })).toBe(0);
    expect((await call(r.one.DELETE, 'DELETE', undefined, { id: id(unused) })).status).toBe(404);
  });

  it('create through the list route still works with the shared rules', async () => {
    asAdmin();
    expect((await call(r.list.POST, 'POST', { name: 'No address' })).status).toBe(400);
    const res = await call(r.list.POST, 'POST', { name: 'Fine Ltd', billingAddress: 'x', gstin: '27AAPFU0939F1ZV' });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json).toMatchObject({ stateCode: '27', pan: 'AAPFU0939F' });
  });
});
