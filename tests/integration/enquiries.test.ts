import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id, state } from './harness';

// Leads: adding, correcting and cancelling an enquiry, and what locks it
describe('enquiries', () => {
  const m: any = {}, r: any = {};
  const ghost = () => String(new mongoose.Types.ObjectId());
  const body = (extra: any = {}) => ({ customerName: 'Hero Cycles', email: 'buy@hero.com', phone: '+91 98200 11223', source: 'TRADE_SHOW', notes: 'met at the expo', items: [{ productName: 'City Bike', estimatedQuantity: 40 }], ...extra });
  const add = (extra: any = {}, role = 'SALES') => { asRole(role); return call(r.list.POST, 'POST', body(extra)); };
  const patch = (e: any, b: any, role = 'SALES') => { asRole(role); return call(r.one.PATCH, 'PATCH', b, { id: id(e) }); };
  const fresh = async (e: any) => (await m.Enquiry.findById(e._id).lean()) as any;

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Enquiry: 'Enquiry', Quote: 'Quotation', Audit: 'AuditLog', Customer: 'Customer' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.list = await import('@/app/api/enquiries/route');
    r.one = await import('@/app/api/enquiries/[id]/route');
    r.convert = await import('@/app/api/enquiries/[id]/convert/route');
    r.followups = await import('@/app/api/enquiries/[id]/followups/route');
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  describe('adding a lead', () => {
    it('saves every field with the next number, as NEW, and audits it', async () => {
      const res = await add({ items: [{ productName: 'City Bike', estimatedQuantity: 40 }, { productName: 'Road Bike', estimatedQuantity: 5 }] });
      expect(res.status, JSON.stringify(res.json)).toBe(201);
      expect(res.json.enquiryNumber).toMatch(/^ENQ-\d{4}-\d{4}$/);
      expect(res.json).toMatchObject({ customerName: 'Hero Cycles', email: 'buy@hero.com', phone: '+91 98200 11223', source: 'TRADE_SHOW', notes: 'met at the expo', status: 'NEW', region: 'DOMESTIC' });
      expect(res.json.items).toHaveLength(2);
      expect(await m.Audit.countDocuments({ resourceName: res.json.enquiryNumber, action: 'CREATE' })).toBe(1);
    });

    it('numbers many enquiries made at the same moment without a clash', async () => {
      const made = await Promise.all(Array.from({ length: 8 }, () => add()));
      expect(made.every(x => x.status === 201)).toBe(true);
      expect(new Set(made.map(x => x.json.enquiryNumber)).size).toBe(8);
    });

    it('an export lead needs a country; a domestic one drops any country sent', async () => {
      expect((await add({ region: 'EXPORT' })).status).toBe(400);
      const ok = await add({ region: 'EXPORT', country: ' Germany ' });
      expect(ok.status, JSON.stringify(ok.json)).toBe(201);
      expect(ok.json).toMatchObject({ region: 'EXPORT', country: 'Germany' });
      const home = await add({ region: 'DOMESTIC', country: 'Germany' });
      expect(home.json.country || '').toBe('');
    });

    it('refuses bad values with the reason, and saves nothing', async () => {
      const before = await m.Enquiry.countDocuments({});
      const bad: any[] = [
        { customerName: '   ' }, { customerName: 'x'.repeat(201) }, { email: 'not-an-email' }, { phone: 'call me' }, { source: 'BILLBOARD' },
        { items: [] }, { items: 'bike' }, { items: [{ productName: '', estimatedQuantity: 1 }] }, { items: [{ productName: 'Bike', estimatedQuantity: 0 }] },
        { items: [{ productName: 'Bike', estimatedQuantity: -3 }] }, { items: [{ productName: 'Bike', estimatedQuantity: 'many' }] }, { notes: 'n'.repeat(2001) },
      ];
      for (const b of bad) expect((await add(b)).status, JSON.stringify(b).slice(0, 60)).toBe(400);
      asRole('SALES');
      expect((await call(r.list.POST, 'POST', ['x'] as any)).status).toBe(400);
      expect(await m.Enquiry.countDocuments({})).toBe(before);
    });

    it('only sales-side roles may add one', async () => {
      for (const role of ['VIEWER', 'FINANCE_MANAGER', 'QUALITY_INSPECTOR', 'HR_MANAGER']) expect((await add({}, role)).status, role).toBe(403);
      for (const role of ['ADMIN', 'MANAGER', 'SALES', 'STAFF']) expect((await add({}, role)).status, role).toBe(201);
    });
  });

  describe('correcting a lead', () => {
    it('changes only the fields sent and audits it', async () => {
      const e = (await add()).json;
      const res = await patch(e, { phone: '99999 88888', notes: 'call after Diwali', items: [{ productName: 'Road Bike', estimatedQuantity: 12 }] });
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      expect(res.json).toMatchObject({ customerName: 'Hero Cycles', email: 'buy@hero.com', phone: '99999 88888', notes: 'call after Diwali', source: 'TRADE_SHOW' });
      expect(res.json.items).toEqual([expect.objectContaining({ productName: 'Road Bike', estimatedQuantity: 12 })]);
      expect(await m.Audit.countDocuments({ resourceName: e.enquiryNumber, action: 'EDIT' })).toBe(1);
      const toExport = await patch(e, { region: 'EXPORT', country: 'Japan' });
      expect(toExport.json).toMatchObject({ region: 'EXPORT', country: 'Japan' });
    });

    it('refuses bad values and an empty request, leaving the enquiry as it was; clearing an optional field works', async () => {
      const e = (await add()).json;
      for (const b of [{ customerName: '' }, { email: 'nope' }, { items: [] }, { items: [{ productName: 'Bike', estimatedQuantity: 0 }] }, { region: 'EXPORT' }, {}]) {
        expect((await patch(e, b)).status, JSON.stringify(b)).toBe(400);
      }
      expect(((await fresh(e)) as any)).toMatchObject({ customerName: 'Hero Cycles', email: 'buy@hero.com' });
      const cleared = await patch(e, { email: '', notes: '' });
      expect(cleared.status).toBe(200);
      expect(cleared.json.email).toBe('');
    });

    it('is refused for the wrong roles and for unknown enquiries', async () => {
      const e = (await add()).json;
      for (const role of ['VIEWER', 'FINANCE_MANAGER', 'SUPPLY_CHAIN_MANAGER']) expect((await patch(e, { notes: 'x' }, role)).status, role).toBe(403);
      expect((await patch({ _id: ghost() }, { notes: 'x' })).status).toBe(404);
      expect((await patch({ _id: 'nope' }, { notes: 'x' })).status).toBe(404);
      asAdmin();
      state.user = null;
      expect((await call(r.one.PATCH, 'PATCH', { notes: 'x' }, { id: id(e) })).status).toBe(401);
      asAdmin();
    });
  });

  describe('cancelling a lead', () => {
    it('needs a reason, marks it rejected, cancels its pending follow-ups and audits it', async () => {
      const e = (await add()).json;
      asRole('SALES');
      expect((await call(r.followups.POST, 'POST', { dueAt: new Date(Date.now() + 864e5).toISOString(), mode: 'CALL' }, { id: id(e) })).status).toBe(201);
      expect((await patch(e, { action: 'cancel', reason: '' })).status).toBe(400);
      expect((await patch(e, { action: 'cancel', reason: 'abc' })).status).toBe(400);
      const res = await patch(e, { action: 'cancel', reason: 'customer went with a rival' });
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      expect(res.json).toMatchObject({ status: 'REJECTED', cancelReason: 'customer went with a rival', cancelledBy: 'Test SALES' });
      expect(res.json.followUps.every((f: any) => f.status === 'CANCELLED')).toBe(true);
      expect(await m.Audit.countDocuments({ resourceName: e.enquiryNumber, action: 'DELETE' })).toBe(1);
    });

    it('a cancelled enquiry cannot be edited, cancelled again or quoted', async () => {
      const e = (await add()).json;
      await patch(e, { action: 'cancel', reason: 'duplicate of another lead' });
      expect((await patch(e, { notes: 'x' })).status).toBe(409);
      expect((await patch(e, { action: 'cancel', reason: 'cancel it again' })).status).toBe(409);
      asRole('SALES');
      const q = await call(r.convert.POST, 'POST', { unitPrice: 1000 }, { id: id(e) });
      expect(q.status).toBe(409);
      expect(await m.Quote.countDocuments({ enquiryRef: e.enquiryNumber })).toBe(0);
    });
  });

  describe('quoting a lead', () => {
    it('locks it: once quoted it cannot be edited or cancelled, and it cannot be quoted twice', async () => {
      const e = (await add()).json;
      asRole('SALES');
      const q = await call(r.convert.POST, 'POST', { unitPrice: 1000 }, { id: id(e) });
      expect(q.status, JSON.stringify(q.json)).toBe(201);
      expect(await fresh(e)).toMatchObject({ status: 'QUALIFIED', convertedQuotationRef: q.json.quotation.quoteNumber });
      const edit = await patch(e, { notes: 'late change' });
      expect(edit.status).toBe(409);
      expect(edit.json.error).toContain('already been quoted');
      expect((await patch(e, { action: 'cancel', reason: 'changed my mind' })).status).toBe(409);
      asRole('SALES');
      expect((await call(r.convert.POST, 'POST', { unitPrice: 1000 }, { id: id(e) })).status).toBe(409);
      expect(await m.Quote.countDocuments({ enquiryRef: e.enquiryNumber })).toBe(1);
    });

    it('two conversions at the same moment make one quotation; a cancel and a conversion at the same moment cannot both win', async () => {
      const a = (await add()).json;
      asRole('SALES');
      const both = await Promise.all([call(r.convert.POST, 'POST', { unitPrice: 1000 }, { id: id(a) }), call(r.convert.POST, 'POST', { unitPrice: 1000 }, { id: id(a) })]);
      expect(both.map(x => x.status).sort()).toEqual([201, 409]);
      expect(await m.Quote.countDocuments({ enquiryRef: a.enquiryNumber })).toBe(1);

      const b = (await add()).json;
      const [conv, cancel] = await Promise.all([
        (async () => { asRole('SALES'); return call(r.convert.POST, 'POST', { unitPrice: 1000 }, { id: id(b) }); })(),
        (async () => { asRole('MANAGER'); return call(r.one.PATCH, 'PATCH', { action: 'cancel', reason: 'cancel at the same time' }, { id: id(b) }); })(),
      ]);
      const wins = [conv.status === 201, cancel.status === 200].filter(Boolean).length;
      expect(wins).toBe(1);
      const final = await fresh(b);
      expect(final.status).toBe(conv.status === 201 ? 'QUALIFIED' : 'REJECTED');
      expect(await m.Quote.countDocuments({ enquiryRef: b.enquiryNumber })).toBe(conv.status === 201 ? 1 : 0);
    });
  });
});
