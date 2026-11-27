import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startDb, stopDb, call, asAdmin } from './harness';

// Customer master fields from the ERP Customer Master Template: general data, company code data and sales areas.
describe('customer master template fields', () => {
  const r: any = {};
  const base = { name: 'Apex Commercial Cooling', billingAddress: 'Plot 12, Industrial Estate', city: 'Pune', pincode: '411038' };

  beforeAll(async () => {
    await startDb();
    r.customers = await import('@/app/api/customers/route');
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('saves all three sections of the template', async () => {
    const res = await call(r.customers.POST, 'POST', {
      ...base, accountGroup: 'SOLD_TO', searchTerm: 'apex hvac', region: 'mh', country: 'in', pan: 'ABCDE1234F', contactPerson: 'Rohan',
      companyCode: '1000', reconciliationAccount: '121000', paymentTerms: 'Net 30', paymentMethod: 'NEFT/RTGS', dunningProcedure: 'DUN-01', creditLimit: 500000,
      salesAreas: [{ salesOrg: 'SO01', distributionChannel: '02', division: 'HV', salesDistrict: 'West India', pricingProcedure: 'PR-B2B', shippingConditions: 'Standard', incoterm: 'exw' }],
    });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json).toMatchObject({ accountGroup: 'SOLD_TO', searchTerm: 'APEX HVAC', region: 'MH', country: 'IN', contactPerson: 'Rohan', companyCode: '1000', reconciliationAccount: '121000', paymentMethod: 'NEFT/RTGS', dunningProcedure: 'DUN-01', creditLimit: 500000 });
    expect(res.json.salesAreas).toEqual([{ salesOrg: 'SO01', distributionChannel: '02', division: 'HV', salesDistrict: 'West India', pricingProcedure: 'PR-B2B', shippingConditions: 'Standard', incoterm: 'EXW' }]);
  });

  it('loads the template row C-20001 exactly as written across all three tabs', async () => {
    const res = await call(r.customers.POST, 'POST', {
      code: 'C-20001', accountGroup: 'Sold-To Party', name: 'Apex Commercial Cooling', searchTerm: 'APEX HVAC', billingAddress: 'Plot 12, Industrial Estate', city: 'Pune', pincode: '411038', region: 'MH', country: 'IN', phone: '+91-9876543210', email: 'purchase@apexcooling.in', pan: 'ABCDE1234F',
      companyCode: '1000', reconciliationAccount: '121000 (Trade Receivables)', paymentTerms: 'Net 30', paymentMethod: 'NEFT/RTGS', dunningProcedure: 'DUN-01 (Standard)', creditLimit: 500000,
      salesAreas: [{ salesOrg: 'SO01 (North Region)', distributionChannel: '02 (Wholesale)', division: 'HV (HVAC)', salesDistrict: 'West India', pricingProcedure: 'PR-B2B', shippingConditions: 'Standard', incoterm: 'EXW' }],
    });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json).toMatchObject({ code: 'C-20001', accountGroup: 'SOLD_TO', pan: 'ABCDE1234F', reconciliationAccount: '121000', dunningProcedure: 'DUN-01', creditLimit: 500000 });
    expect(res.json.salesAreas[0]).toMatchObject({ salesOrg: 'SO01', distributionChannel: '02', division: 'HV', incoterm: 'EXW' });
    expect((await call(r.customers.POST, 'POST', { ...base, code: 'C-20001' })).status).toBe(409); // Customer ID already used
  });

  it('keeps a foreign customer\'s postal code and tax id as written', async () => {
    const res = await call(r.customers.POST, 'POST', { ...base, name: 'Osaka Buyer', pincode: '530-8323', country: 'JP', pan: 'JP987654321' });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json).toMatchObject({ country: 'JP', pincode: '530-8323', taxId: 'JP987654321', pan: '', gstin: '' });
  });

  it('defaults to a sold-to party in India with no sales areas', async () => {
    const res = await call(r.customers.POST, 'POST', { ...base, name: 'Plain Buyer' });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ accountGroup: 'SOLD_TO', country: 'IN', salesAreas: [] });
    expect(res.json.creditLimit).toBeUndefined();
  });

  it('takes the PAN from the GSTIN when none is given', async () => {
    const res = await call(r.customers.POST, 'POST', { ...base, name: 'GST Buyer', gstin: '27AAPFU0939F1ZV' });
    expect(res.status).toBe(201);
    expect(res.json.pan).toBe('AAPFU0939F');
  });

  it('keeps fields that an update does not send', async () => {
    const created = (await call(r.customers.POST, 'POST', { ...base, name: 'Keep Ltd', paymentMethod: 'Wire Transfer', salesAreas: [{ salesOrg: 'SO03', distributionChannel: '01', division: 'LT' }] })).json;
    const res = await call(r.customers.POST, 'POST', { _id: created._id, ...base, name: 'Keep Ltd', accountGroup: 'PAYER' });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ accountGroup: 'PAYER', paymentMethod: 'Wire Transfer' });
    expect(res.json.salesAreas).toHaveLength(1);
  });

  it('accepts values exactly as the template drop-downs write them and stores the codes', async () => {
    const res = await call(r.customers.POST, 'POST', {
      ...base, name: 'Metro City MEP Contractors', accountGroup: 'Ship-To Party',
      salesAreas: [{ salesOrg: 'SO01 (North Region)', distributionChannel: '02 (Wholesale)', division: 'HV (HVAC)' }],
    });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.accountGroup).toBe('SHIP_TO');
    expect(res.json.salesAreas[0]).toMatchObject({ salesOrg: 'SO01', distributionChannel: '02', division: 'HV' });
  });

  it('refuses bad values', async () => {
    const bad = async (extra: any) => (await call(r.customers.POST, 'POST', { ...base, ...extra })).status;
    expect(await bad({ accountGroup: 'Distributor' })).toBe(400);
    expect(await bad({ salesAreas: [{ salesOrg: 'SO09', distributionChannel: '02', division: 'HV' }] })).toBe(400);
    expect(await bad({ salesAreas: [{ salesOrg: 'SO01', distributionChannel: '07', division: 'HV' }] })).toBe(400);
    expect(await bad({ salesAreas: [{ salesOrg: 'SO01', distributionChannel: '02', division: 'XX' }] })).toBe(400);
    expect(await bad({ country: 'India' })).toBe(400);
    expect(await bad({ pincode: '530-8323' })).toBe(400); // Indian pincodes are 6 digits
    expect(await bad({ salesAreas: [{ salesOrg: 'SO01', distributionChannel: '02', division: 'HV', incoterm: 'XYZ' }] })).toBe(400);
    expect(await bad({ pan: '1234' })).toBe(400);
    expect(await bad({ creditLimit: -1 })).toBe(400);
    expect(await bad({ salesAreas: [{ salesOrg: 'SO01', distributionChannel: '02' }] })).toBe(400);
    expect(await bad({ salesAreas: [{ salesOrg: 'SO01', distributionChannel: '02', division: 'HV' }, { salesOrg: 'so01', distributionChannel: '02', division: 'hv' }] })).toBe(400);
  });
});
