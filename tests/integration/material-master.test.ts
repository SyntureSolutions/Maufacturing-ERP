import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startDb, stopDb, call, asAdmin, id } from './harness';

// Product fields from the ERP Material Master Template: basic data, plant data and accounting.
describe('material master template fields', () => {
  const r: any = {}, d: any = {};

  beforeAll(async () => {
    await startDb();
    const Category: any = (await import('@/models/Category')).default;
    r.products = await import('@/app/api/products/route');
    r.product = await import('@/app/api/products/[id]/route');
    d.cat = await Category.create({ name: 'HVAC Equipment', slug: 'hvac-equipment' });
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  const row = (extra: any = {}) => ({
    sku: `MAT-${Math.random().toString(36).slice(2, 7)}`, name: '5-Ton Rooftop Packaged Unit, 3-Phase', category: id(d.cat), ...extra,
  });

  it('takes a template row as written and stores the codes', async () => {
    const res = await call(r.products.POST, 'POST', row({
      productType: 'HAWA (Trading Goods)', uom: 'EA', grossWeight: 350, netWeight: 335, oemName: 'Carrier', oemPartNumber: 'RTU-5T-3P',
      plant: 'PL01 (Main Hub)', mrpType: 'VB (Reorder Point)', minStockLevel: 5, safetyStock: 2, plannedDeliveryDays: 14, storageBin: 'ZONE-A-01', batchManaged: 'N',
      valuationClass: '3100 (Trading Goods)', priceControl: 'V (Moving Average)', purchasePrice: 2500,
    }));
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json).toMatchObject({
      productType: 'TRADING_GOOD', grossWeight: 350, netWeight: 335, oemName: 'Carrier', oemPartNumber: 'RTU-5T-3P',
      plant: 'PL01', mrpType: 'VB', minStockLevel: 5, safetyStock: 2, plannedDeliveryDays: 14, storageBin: 'ZONE-A-01', batchManaged: false,
      valuationClass: '3100', priceControl: 'V', purchasePrice: 2500,
    });
  });

  it('loads template row MAT-5002 exactly as written, with the material group and unit by name', async () => {
    const res = await call(r.products.POST, 'POST', {
      sku: 'MAT-5002', productType: 'ERSA (Spare Parts)', name: 'Copper Tubing 5/8 inch', materialGroup: 'hvac equipment', uom: 'M (Meter)', grossWeight: 0.45, netWeight: 0.45, oemName: 'Mueller', oemPartNumber: 'CT-58-100',
      plant: 'PL01 (Main Hub)', mrpType: 'VB (Reorder Point)', minStockLevel: 500, safetyStock: 100, plannedDeliveryDays: 3, storageBin: 'RACK-C-12', batchManaged: 'N',
      valuationClass: '3040 (Spare Parts)', priceControl: 'V (Moving Average)', purchasePrice: 4.5,
    });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json).toMatchObject({ sku: 'MAT-5002', productType: 'SPARE_PART', category: id(d.cat), uom: 'M', valuationClass: '3040', batchManaged: false, purchasePrice: 4.5 });
    expect((await call(r.products.POST, 'POST', row({ category: undefined, materialGroup: 'Refrigerants' }))).status).toBe(400); // not a category yet
  });

  it('leaves existing lower-case units alone', async () => {
    expect((await call(r.products.POST, 'POST', row({ uom: 'pcs' }))).json.uom).toBe('pcs');
  });

  it('maps the other template material types and keeps existing defaults', async () => {
    expect((await call(r.products.POST, 'POST', row({ productType: 'ERSA (Spare Parts)' }))).json.productType).toBe('SPARE_PART');
    expect((await call(r.products.POST, 'POST', row({ productType: 'DIEN' }))).json.productType).toBe('SERVICE');
    const plain = (await call(r.products.POST, 'POST', row())).json;
    expect(plain).toMatchObject({ productType: 'FINISHED_GOOD', mrpType: 'PD', priceControl: 'V', batchManaged: true, safetyStock: 0 });
  });

  it('refuses bad values on create', async () => {
    const status = async (extra: any) => (await call(r.products.POST, 'POST', row(extra))).status;
    expect(await status({ productType: 'ZZZZ (Unknown)' })).toBe(400);
    expect(await status({ mrpType: 'XX' })).toBe(400);
    expect(await status({ priceControl: 'Q' })).toBe(400);
    expect(await status({ grossWeight: 10, netWeight: 11 })).toBe(400);
    expect(await status({ safetyStock: -1 })).toBe(400);
  });

  it('checks values on update and reports a failed save instead of echoing the request', async () => {
    const p = (await call(r.products.POST, 'POST', row())).json;
    const ok = await call(r.product.PATCH, 'PATCH', { mrpType: 'ND (No Planning)', safetyStock: 7 }, { id: p._id });
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    expect(ok.json).toMatchObject({ mrpType: 'ND', safetyStock: 7 });
    expect((await call(r.product.PATCH, 'PATCH', { mrpType: 'XX' }, { id: p._id })).status).toBe(400);
    expect((await call(r.product.PATCH, 'PATCH', { safetyStock: 1 }, { id: '65f0111111111111111111ff' })).status).toBe(404);
  });

  it('stores the item master details: units and conversions, stock type, scrap, rack, ledgers, HSN description, inactive date', async () => {
    const Account: any = (await import('@/models/Account')).default;
    await Account.create({ code: '4011', name: 'Spare Parts Sales', type: 'REVENUE', category: 'Sales Revenue' });
    await Account.create({ code: '5011', name: 'Spare Parts Purchases', type: 'EXPENSE', category: 'Cost of Goods Sold' });
    const res = await call(r.products.POST, 'POST', row({
      uom: 'pcs', salesUom: 'box', salesConversion: 50, purchaseUom: 'carton (Carton)', purchaseConversion: '200', stockType: 'STOCKABLE', includeInValuation: true,
      isScrap: 'Y', rackNo: 'R-07', salesAccount: '4011', purchaseAccount: '5011', hsnCode: '8414', hsnDescription: 'Air or vacuum pumps, compressors and fans', remarks: 'Fragile',
    }));
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json).toMatchObject({ salesUom: 'box', salesConversion: 50, purchaseUom: 'carton', purchaseConversion: 200, stockType: 'STOCKABLE', isScrap: true, rackNo: 'R-07',
      salesAccount: '4011', purchaseAccount: '5011', hsnDescription: 'Air or vacuum pumps, compressors and fans', remarks: 'Fragile' });

    // an item made before these fields existed reads as one stock unit per unit, stockable and valued
    const plain = await call(r.products.POST, 'POST', row());
    expect(plain.json).toMatchObject({ salesConversion: 1, purchaseConversion: 1, stockType: 'STOCKABLE', includeInValuation: true, isScrap: false });

    const p = res.json._id;
    const upd = await call(r.product.PATCH, 'PATCH', { stockType: 'NON_STOCK', includeInValuation: false, isActive: false, deactivatedFrom: '2026-11-01', salesConversion: '' }, { id: p });
    expect(upd.status, JSON.stringify(upd.json)).toBe(200);
    expect(upd.json).toMatchObject({ stockType: 'NON_STOCK', includeInValuation: false, isActive: false, salesConversion: 1 });
    expect(new Date(upd.json.deactivatedFrom).toISOString().slice(0, 10)).toBe('2026-11-01');
    expect((await call(r.product.PATCH, 'PATCH', { deactivatedFrom: '' }, { id: p })).json.deactivatedFrom).toBeNull();
  });

  it('refuses bad item master details', async () => {
    const bad = async (extra: any) => (await call(r.products.POST, 'POST', row(extra)));
    expect((await bad({ salesConversion: 0 })).status).toBe(400);
    expect((await bad({ purchaseConversion: -5 })).status).toBe(400);
    expect((await bad({ purchaseConversion: 'two' })).status).toBe(400);
    expect((await bad({ stockType: 'SOMETIMES' })).status).toBe(400);
    expect((await bad({ deactivatedFrom: 'not a date' })).status).toBe(400);
    const ledger = await bad({ salesAccount: '9999' });
    expect(ledger.status).toBe(400);
    expect(ledger.json.error).toMatch(/9999 is not in the chart of accounts/);
    const p = (await call(r.products.POST, 'POST', row())).json._id;
    expect((await call(r.product.PATCH, 'PATCH', { purchaseAccount: 'NOPE' }, { id: p })).status).toBe(400);
    expect((await call(r.product.PATCH, 'PATCH', { salesConversion: 0 }, { id: p })).status).toBe(400);
  });
});
