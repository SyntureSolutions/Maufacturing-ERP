import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asAdmin, id } from './harness';
import { computeTax, spreadCharges } from '@/lib/gst';

// Line discount and document charges on a purchase order: a discounted line's unit price is the net rate (so receipts
// and stock cost use what is paid); freight and the like are spread over the lines for GST and are part of the PO total.
describe('PO discount and charges', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const oid = () => new mongoose.Types.ObjectId();

  beforeAll(async () => {
    await startDb();
    for (const n of ['Product', 'Supplier', 'PurchaseOrder', 'Batch', 'CompanySettings']) { const mod: any = await import(/* @vite-ignore */ `@/models/${n}`); m[n] = mod.default || mod; }
    r.po = await import('@/app/api/purchase/route');
    r.poOne = await import('@/app/api/purchase/[id]/route');
    r.grn = await import('@/app/api/grn/route');
    m.print = await import('@/lib/printDocs');
    asAdmin();
    await m.CompanySettings.create({ key: 'company', legalName: 'Prodexa', gstin: '27AABCP1234F1Z8', stateCode: '27' });
    d.tube = await m.Product.create({ name: 'Tube', sku: 'RM-TUBE', category: oid(), uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '7306', gstRate: 18 });
    d.chilli = await m.Product.create({ name: 'Chilli', sku: 'RM-CHILLI', category: oid(), uom: 'kg', productType: 'RAW_MATERIAL', purchaseUom: 'bag', purchaseConversion: 25, hsnCode: '0904', gstRate: 5 });
    d.sup = await m.Supplier.create({ name: 'Mill Stores', code: 'S-1', gstin: '27AAPFU0939F1ZV' });
  }, 120000);
  afterAll(stopDb);

  it('spreads charges over the lines by value, the last line taking the rounding', () => {
    expect(spreadCharges([300, 700], [{ label: 'Freight', amount: 100 }])).toEqual([30, 70]);
    expect(spreadCharges([1, 1, 1], [{ label: 'Freight', amount: 10 }])).toEqual([3.33, 3.33, 3.34]);
    const t = computeTax([
      { description: 'A', hsnCode: '7306', quantity: 10, unitPrice: 30, gstRate: 18 },
      { description: 'B', hsnCode: '0904', quantity: 7, unitPrice: 100, gstRate: 5 },
    ], '27', '27', [{ label: 'Freight', amount: 100 }]);
    expect(t.items.map(i => [i.goodsValue, i.chargeShare, i.taxableValue])).toEqual([[300, 30, 330], [700, 70, 770]]);
    // each part of the freight is taxed at its line's rate: 330 x 18% + 770 x 5%
    expect(t.totalCGST + t.totalSGST).toBe(97.9);
    expect(t).toMatchObject({ goodsTotal: 1000, chargesTotal: 100, subTotal: 1100, totalAmount: 1197.9 });
  });

  it('keeps the list rate and discount and makes the unit price the net rate; charges join the PO total', async () => {
    const res = await call(r.po.POST, 'POST', { supplier: id(d.sup), items: [
      { product: id(d.tube), quantity: 10, unitPrice: 100, discountPercent: 10 },
      { product: id(d.chilli), unit: 'bag', quantity: 4, unitPrice: 1250, discountPercent: 4 },
    ], charges: [{ label: 'Freight', amount: 500 }, { label: '', amount: 0 }] });
    expect(res.status).toBe(201);
    const [tube, chilli] = res.json.items;
    expect(tube).toMatchObject({ listPrice: 100, discountPercent: 10, unitPrice: 90, totalPrice: 900 });
    // 4 bags at Rs 1,250 less 4% = Rs 1,200 a bag = Rs 48/kg for 100 kg
    expect(chilli).toMatchObject({ quantity: 100, listPrice: 50, discountPercent: 4, unitPrice: 48, totalPrice: 4800, orderUnit: 'bag' });
    expect(res.json.charges).toEqual([{ label: 'Freight', amount: 500 }]);
    expect(res.json.totalAmount).toBe(6200); // 900 + 4,800 + 500 freight, before GST
    d.po = res.json._id;
  });

  it('refuses a bad discount or charge', async () => {
    const bad = (body: any) => call(r.po.POST, 'POST', { supplier: id(d.sup), items: [{ product: id(d.tube), quantity: 1, unitPrice: 10 }], ...body });
    expect((await bad({ items: [{ product: id(d.tube), quantity: 1, unitPrice: 10, discountPercent: 100 }] })).json.error).toMatch(/discount/);
    expect((await bad({ charges: [{ label: 'Freight', amount: -5 }] })).json.error).toMatch(/zero or more/);
    expect((await bad({ charges: [{ label: '', amount: 50 }] })).json.error).toMatch(/what the charge is for/);
  });

  it('keeps discounts and charges when the PO is edited without them', async () => {
    await m.PurchaseOrder.updateOne({ _id: d.po }, { status: 'DRAFT' });
    expect((await call(r.poOne.PATCH, 'PATCH', { supplier: id(d.sup) }, { id: d.po })).status).toBe(200);
    const po: any = await m.PurchaseOrder.findById(d.po).lean();
    expect(po.items.map((i: any) => [i.listPrice, i.discountPercent, i.unitPrice])).toEqual([[100, 10, 90], [50, 4, 48]]);
    expect(po.charges).toEqual([{ label: 'Freight', amount: 500 }]);
    expect(po.totalAmount).toBe(6200);
    await m.PurchaseOrder.updateOne({ _id: d.po }, { status: 'ORDERED' });
  });

  it('prints list rate, discount, goods and the charges, with GST on the charges', async () => {
    const spec = await m.print.PRINT_TYPES['purchase-order'].load(d.po, new URLSearchParams());
    expect(spec.rows[0]).toMatchObject({ rate: '100.00', disc: '10%', tv: '900.00' });
    expect(spec.rows[1]).toMatchObject({ rate: '1,250.00', disc: '4%', tv: '4,800.00' });
    const totals = Object.fromEntries(spec.totals.map((t: any) => [t[0], t[1]]));
    expect(totals).toMatchObject({ 'Goods value': 'Rs. 5,700.00', Freight: 'Rs. 500.00', 'Taxable value': 'Rs. 6,200.00' });
  });

  it('receives stock at the net rate', async () => {
    const res = await call(r.grn.POST, 'POST', {
      poId: d.po, gateEntryNo: 'G-1', vendorChallanNo: 'VC-1', vehicleNo: 'MH12AB1234',
      checklist: { quantityVerified: true, packingIntact: true, documentsVerified: true },
      items: [{ product: id(d.tube), receivedQty: 10, expiryDate: '2030-01-01' }],
    });
    expect(res.status).toBe(201);
    expect((await m.Batch.findOne({ product: d.tube._id }).lean()).purchasePrice).toBe(90);
  });

  it('puts the order charges on the first bill, taxed with the goods and booked to freight inward, then not again', async () => {
    const bills = await import('@/app/api/vendor-bills/route');
    const open = await import('@/app/api/vendor-bills/open/route');
    const { default: GRN } = await import('@/models/GRN');
    await GRN.updateMany({}, { $set: { 'items.$[].inspection': 'ACCEPTED' } }); // passed inspection
    const offered = (await call(open.GET, 'GET')).json.find((p: any) => p._id === d.po);
    expect(offered.chargesLeft).toEqual([{ label: 'Freight', amount: 500 }]);

    const res = await call(bills.POST, 'POST', { poId: d.po, vendorBillNumber: 'MS-101', billDate: new Date().toISOString().slice(0, 10), lines: [{ product: id(d.tube), quantity: 10 }] });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    // 900 of tubes + 500 freight, all at the tube's 18%
    expect(res.json).toMatchObject({ goodsTotal: 900, subTotal: 1400, totalCGST: 126, totalSGST: 126, totalAmount: 1652 });
    expect(res.json.charges).toEqual([{ label: 'Freight', amount: 500 }]);
    const { default: Account } = await import('@/models/Account');
    expect((await Account.findOne({ code: '5070' }).lean() as any)?.balance).toBe(500); // freight inward

    const again = (await call(open.GET, 'GET')).json.find((p: any) => p._id === d.po);
    expect(again?.chargesLeft ?? []).toEqual([]);
  });
});
