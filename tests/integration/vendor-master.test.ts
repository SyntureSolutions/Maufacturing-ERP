import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asAdmin, asRole, id } from './harness';

// Supplier fields from the ERP Vendor Master Template. The rows below are the template's own rows,
// with the General_Data_LFA1, Company_Code_LFB1 and Purchasing_Org_LFM1 tabs merged per Vendor ID.
const TEMPLATE_ROWS = [
  {
    code: 'V-10001', accountGroup: 'Foreign Supplier', name: 'Daikin Industries', name2: 'HVAC Division', searchTerm: 'DAIKIN', address: 'Umeda Center Bldg', city: 'Osaka', pincode: '530-8323', region: 'Osaka', country: 'JP', phone: '+81-6-6373-4312', email: 'sales@daikin.co.jp', pan: 'JP987654321', gstin: 'JP-VAT-123',
    companyCode: '1000', reconciliationAccount: '211000 (Trade Payables)', paymentTerms: 'Net 60', paymentMethod: 'Wire Transfer', toleranceGroup: 'TOL-A', withholdingTaxCode: 'W01',
    purchasingOrg: 'PO01', orderCurrency: 'USD', incoterm: 'CIF', minOrderValue: 50000, pricingSchemaGroup: 'SCH-FOREIGN', orderingAddress: 'V-10001', invoicingParty: 'V-10001',
  },
  {
    code: 'V-10002', accountGroup: 'Domestic Supplier', name: 'Alpha Ducting & Fab', searchTerm: 'ALPHA', address: 'Plot 45, MIDC', city: 'Pune', pincode: '410501', region: 'MH', country: 'IN', phone: '+91-9876543210', email: 'orders@alphaducts.in', pan: 'ABCDE1234F', gstin: '27ABCDE1234F1Z5',
    companyCode: '1000', reconciliationAccount: '211000 (Trade Payables)', paymentTerms: 'Net 30', paymentMethod: 'NEFT/RTGS', toleranceGroup: 'TOL-B', withholdingTaxCode: 'W19',
    purchasingOrg: 'PO01', orderCurrency: 'INR', incoterm: 'EXW', minOrderValue: 10000, pricingSchemaGroup: 'SCH-DOMESTIC', orderingAddress: 'V-10002', invoicingParty: 'V-10002',
  },
];

describe('vendor master template fields', () => {
  const r: any = {}, m: any = {};

  beforeAll(async () => {
    await startDb();
    m.Supplier = (await import('@/models/Supplier')).default;
    m.PO = (await import('@/models/PurchaseOrder')).default;
    r.list = await import('@/app/api/suppliers/route');
    r.one = await import('@/app/api/suppliers/[id]/route');
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('loads the template rows and stores every column', async () => {
    const jp = await call(r.list.POST, 'POST', TEMPLATE_ROWS[0]);
    expect(jp.status, JSON.stringify(jp.json)).toBe(201);
    expect(jp.json).toMatchObject({
      code: 'V-10001', accountGroup: 'FOREIGN', name: 'Daikin Industries', name2: 'HVAC Division', searchTerm: 'DAIKIN', city: 'Osaka', pincode: '530-8323', region: 'OSAKA', country: 'JP',
      taxId: 'JP987654321', vatNumber: 'JP-VAT-123', gstin: '', pan: '', // a foreign VAT number never lands in the GSTIN, which drives the GST state
      companyCode: '1000', reconciliationAccount: '211000', paymentTerms: 'Net 60', paymentMethod: 'Wire Transfer', toleranceGroup: 'TOL-A', withholdingTaxCode: 'W01',
      purchasingOrg: 'PO01', orderCurrency: 'USD', incoterm: 'CIF', minOrderValue: 50000, pricingSchemaGroup: 'SCH-FOREIGN', orderingAddress: 'V-10001', invoicingParty: 'V-10001',
    });
    const pune = await call(r.list.POST, 'POST', TEMPLATE_ROWS[1]);
    expect(pune.status, JSON.stringify(pune.json)).toBe(201);
    expect(pune.json).toMatchObject({ accountGroup: 'DOMESTIC', gstin: '27ABCDE1234F1Z5', pan: 'ABCDE1234F', orderCurrency: 'INR', incoterm: 'EXW' });
  });

  it('numbers a supplier with no Vendor ID and defaults to a domestic INR supplier', async () => {
    const res = await call(r.list.POST, 'POST', { name: 'Plain Vendor', gstin: '27AAPFU0939F1ZV' });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.code).toMatch(/^SUP-/);
    expect(res.json).toMatchObject({ accountGroup: 'DOMESTIC', country: 'IN', orderCurrency: 'INR', pan: 'AAPFU0939F' });
  });

  it('refuses bad values instead of inventing a supplier', async () => {
    const before = await m.Supplier.countDocuments();
    const bad = async (extra: any) => (await call(r.list.POST, 'POST', { name: 'Bad', ...extra })).status;
    expect(await bad({ accountGroup: 'Distributor' })).toBe(400);
    expect(await bad({ gstin: 'NOPE' })).toBe(400);
    expect(await bad({ pan: '1234' })).toBe(400);
    expect(await bad({ pincode: '530-8323' })).toBe(400);               // Indian pincodes are 6 digits
    expect(await bad({ accountGroup: 'Foreign Supplier' })).toBe(400);  // foreign but country left as IN
    expect(await bad({ country: 'JP', orderCurrency: 'DOLLARS' })).toBe(400);
    expect(await bad({ incoterm: 'XYZ' })).toBe(400);
    expect(await bad({ minOrderValue: -5 })).toBe(400);
    expect(await bad({ code: 'V-20001', orderingAddress: 'V-99999' })).toBe(400);
    expect(await bad({ name: '' })).toBe(400);
    expect(await bad({ code: 'V-10002' })).toBe(409);                    // Vendor ID already used
    expect(await m.Supplier.countDocuments()).toBe(before);
  });

  it('lets only purchasing and finance roles write', async () => {
    asRole('SALES');
    expect((await call(r.list.POST, 'POST', { name: 'Nope' })).status).toBe(403);
    asAdmin();
  });

  it('updates only the fields sent and keeps the Vendor ID', async () => {
    const s = await m.Supplier.findOne({ code: 'V-10002' });
    const res = await call(r.one.PATCH, 'PATCH', { paymentTerms: '2% 10 Net 30', invoicingParty: 'V-10001' }, { id: id(s) });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json).toMatchObject({ paymentTerms: '2% 10 Net 30', invoicingParty: 'V-10001', gstin: '27ABCDE1234F1Z5', incoterm: 'EXW' });
    expect((await call(r.one.PATCH, 'PATCH', { code: 'V-77777' }, { id: id(s) })).status).toBe(400);
    expect((await call(r.one.PATCH, 'PATCH', { orderCurrency: 'RUPEES' }, { id: id(s) })).status).toBe(400);
    expect((await call(r.one.PATCH, 'PATCH', { name: 'x' }, { id: '65f0111111111111111111ff' })).status).toBe(404);
  });

  it('keeps a supplier that is on a purchase order', async () => {
    const s = await m.Supplier.findOne({ code: 'V-10001' });
    await m.PO.collection.insertOne({ poNumber: 'PO-T-1', supplier: s._id, items: [], status: 'DRAFT' });
    expect((await call(r.one.DELETE, 'DELETE', undefined, { id: id(s) })).status).toBe(409);
    const spare = (await call(r.list.POST, 'POST', { name: 'Spare Vendor' })).json;
    expect((await call(r.one.DELETE, 'DELETE', undefined, { id: spare._id })).status).toBe(200);
    expect(await m.Supplier.exists({ _id: new mongoose.Types.ObjectId(spare._id) })).toBeNull();
  });
});
