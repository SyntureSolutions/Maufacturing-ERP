import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startDb, stopDb, call, asAdmin, id } from './harness';

// GST registration status, constitution of business and e-way distance on customers and vendors: the registration
// must agree with the GSTIN and country; parties saved before it was asked are read from their GSTIN.
describe('party GST profile', () => {
  const r: any = {};
  beforeAll(async () => {
    await startDb();
    r.customers = await import('@/app/api/customers/route');
    r.customer = await import('@/app/api/customers/[id]/route');
    r.suppliers = await import('@/app/api/suppliers/route');
    r.supplier = await import('@/app/api/suppliers/[id]/route');
    r.party = await import('@/lib/partyMaster');
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  const cust = (extra: any) => call(r.customers.POST, 'POST', { name: 'Pune Wheels', billingAddress: '5 FC Road', city: 'Pune', pincode: '411004', ...extra });

  it('saves registration, constitution (by code or label) and distance', async () => {
    const res = await cust({ gstin: '27AAPFU0939F1ZV', gstRegistration: 'REGISTERED', constitution: 'Private Limited Company', distanceKm: '42.4' });
    expect(res.status).toBeLessThan(300);
    expect(res.json).toMatchObject({ gstRegistration: 'REGISTERED', constitution: 'PRIVATE_LTD', distanceKm: 42 });
  });

  it('keeps the registration consistent with the GSTIN and country', async () => {
    expect((await cust({ gstRegistration: 'REGISTERED' })).json.error).toMatch(/needs a GSTIN/);
    expect((await cust({ gstRegistration: 'SEZ' })).json.error).toMatch(/needs a GSTIN/);
    expect((await cust({ gstin: '27AAPFU0939F1ZV', gstRegistration: 'UNREGISTERED' })).json.error).toMatch(/has a GSTIN/);
    expect((await cust({ gstRegistration: 'OVERSEAS' })).json.error).toMatch(/other than India/);
    expect((await cust({ country: 'DE', pincode: '', gstRegistration: 'REGISTERED' })).json.error).toMatch(/Overseas/);
    expect((await cust({ gstRegistration: 'SOMETHING' })).status).toBe(400);
    expect((await cust({ distanceKm: 5000 })).json.error).toMatch(/0 to 4,000 km/);
    expect((await cust({ constitution: 'Club' })).status).toBe(400);
    expect((await cust({ gstRegistration: 'CONSUMER' })).status).toBeLessThan(300);
  });

  it('checks an update against the GSTIN already on record, and can clear the distance', async () => {
    const made = await cust({ gstin: '27AAPFU0939F1ZV', distanceKm: 10 });
    const cid = id(made.json);
    expect((await call(r.customer.PATCH, 'PATCH', { gstRegistration: 'UNREGISTERED' }, { id: cid })).status).toBe(400);
    const ok = await call(r.customer.PATCH, 'PATCH', { gstRegistration: 'COMPOSITION', distanceKm: '' }, { id: cid });
    expect(ok.json).toMatchObject({ gstRegistration: 'COMPOSITION' });
    expect(ok.json.distanceKm ?? null).toBeNull();
  });

  it('applies the same rules to vendors', async () => {
    const bad = await call(r.suppliers.POST, 'POST', { name: 'Mill Stores', gstRegistration: 'REGISTERED' });
    expect(bad.json.error).toMatch(/needs a GSTIN/);
    const good = await call(r.suppliers.POST, 'POST', { name: 'Spice Traders', gstin: '27AAPFU0939F1ZV', gstRegistration: 'composition', constitution: 'PARTNERSHIP', distanceKm: 120 });
    expect(good.status).toBeLessThan(300);
    expect(good.json).toMatchObject({ gstRegistration: 'COMPOSITION', constitution: 'PARTNERSHIP', distanceKm: 120 });
    const upd = await call(r.supplier.PATCH, 'PATCH', { gstRegistration: 'UNREGISTERED' }, { id: id(good.json) });
    expect(upd.status).toBe(400);
  });

  it('reads parties saved before the question was asked from their GSTIN and country', () => {
    const of = r.party.gstRegistrationOf;
    expect(of({ gstin: '27AAPFU0939F1ZV' })).toBe('REGISTERED');
    expect(of({})).toBe('UNREGISTERED');
    expect(of({ country: 'JP' })).toBe('OVERSEAS');
    expect(of({ gstRegistration: 'SEZ', gstin: 'X' })).toBe('SEZ');
  });
});
