import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id, pickAll } from './harness';

// Partial dispatch: one order, several challans and invoices; stock follows each shipment
describe('partial dispatch and invoicing', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const oid = () => new mongoose.Types.ObjectId();
  const bal = async (code: string) => (await m.Account.findOne({ code }))?.balance ?? 0;
  const batch = async () => (await m.Batch.findOne({ product: d.bike._id }).lean()) as any;
  const so = async (n: string, qty: number, price = 1000) => {
    const s = await m.SO.create({ soNumber: n, customer: d.cust._id, customerName: 'Pune Wheels', status: 'DRAFT', items: [{ product: d.bike._id, quantity: qty, unitPrice: price, totalPrice: qty * price }], totalAmount: qty * price });
    return s;
  };
  const fresh = async (s: any) => (await m.SO.findById(s._id).lean()) as any;
  const challan = async (s: any, lines?: any, extra: any = {}) => { await pickAll(id(s), true); asRole('SUPPLY_CHAIN_MANAGER'); return call(r.dc.POST, 'POST', { salesOrderId: id(s), transporterName: 'FastMove', vehicleNo: 'MH12AB1234', lrNo: `LR-${Math.random().toString(36).slice(2, 6)}`, ...(lines ? { lines } : {}), ...extra }); };
  const invoice = (s: any, dc?: any) => { asRole('FINANCE_MANAGER'); return call(r.inv.POST, 'POST', { salesOrderId: id(s), ...(dc ? { dcId: id(dc) } : {}) }); };

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Customer: 'Customer', SO: 'SalesOrder', Batch: 'Batch', DC: 'DeliveryChallan', Invoice: 'Invoice', Account: 'Account', Company: 'CompanySettings', Proforma: 'ProformaInvoice', Audit: 'AuditLog', User: 'User' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    r.dc = await import('@/app/api/delivery-challans/route');
    r.cancel = await import('@/app/api/delivery-challans/[id]/cancel/route');
    r.inv = await import('@/app/api/dispatch/invoices/route');
    r.pi = await import('@/app/api/proforma/route');
    r.piOne = await import('@/app/api/proforma/[id]/route');
    r.lineage = await import('@/app/api/lineage/route');
    r.lock = await import('@/app/api/settings/period-lock/route');
    r.legacy = await import('@/app/api/finance/invoices/route');
    d.approve = (await import('@/lib/salesOrderApproval')).approveSalesOrder;

    d.bike = await m.Product.create({ name: 'City Bike', sku: 'FG-BIKE', category: oid(), productType: 'FINISHED_GOOD', hsnCode: '8712', gstRate: 18, uom: 'pcs' });
    d.cust = await m.Customer.create({ name: 'Pune Wheels', code: 'C-2', gstin: '27AAPFU0939F1ZV', billingAddress: '5 FC Road', city: 'Pune', pincode: '411004', email: 'p@example.com', phone: '9876543210' });
    await m.Company.create({ key: 'company', legalName: 'Prodexa Pvt Ltd', gstin: '27AAPFU0939F1ZV', address1: '1 Rd', city: 'Pune', pincode: '411001', stateCode: '27' });
    await m.Batch.create({ product: d.bike._id, batchNumber: 'B-BIKE', expiryDate: new Date('2031-01-01'), initialQuantity: 10, currentQuantity: 10, purchasePrice: 500, qualityStatus: 'APPROVED', store: 'W1' });
    d.so = await so('SO-PD-1', 10);
    await d.approve(id(d.so), { name: 'Admin', role: 'ADMIN' });   // reserves the 10 bikes in stock
    await m.User.create({ _id: '65f011111111111111111100', name: 'Test Admin', email: 'admin@test.com', password: 'secret123', role: 'ADMIN' });   // needed to reopen a locked period
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('dispatches part of an order: the challan carries those lines, stock reserved for the order leaves, the order is in fulfilment', async () => {
    const res = await challan(d.so, [{ product: id(d.bike), quantity: 4 }]);
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.items).toHaveLength(1);
    expect(res.json.items[0]).toMatchObject({ quantity: 4, taxableValue: 4000 });
    expect(res.json.totalTaxable).toBe(4000);
    expect(res.json.stockMovements).toHaveLength(1);
    expect(res.json.stockMovements[0]).toMatchObject({ qty: 4, reserved: true });
    expect(res.json.stockShortfall).toEqual([]);
    const s = await fresh(d.so);
    expect(s.items[0].dispatchedQty).toBe(4);
    expect(s.status).toBe('IN_FULFILLMENT');
    expect(s.allocatedBatches[0].quantity).toBe(6);                      // 10 reserved, 4 gone
    const b = await batch();
    expect(b).toMatchObject({ currentQuantity: 6, allocatedQuantity: 6 });
    d.dc1 = res.json;
  });

  it('a partial invoice covers exactly that challan; the order shows partly invoiced; the books get that amount only', async () => {
    const res = await invoice(d.so, d.dc1);
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.items[0].quantity).toBe(4);
    expect(res.json.subTotal).toBe(4000);
    expect(res.json.totalAmount).toBe(4720);                             // 4000 + 18%
    expect(String(res.json.deliveryChallan)).toBe(id(d.dc1));
    const s = await fresh(d.so);
    expect(s.items[0].invoicedQty).toBe(4);
    expect(s.taxInvoiceStatus).toBe('PARTIAL');
    expect(s.status).toBe('IN_FULFILLMENT');
    expect(((await m.DC.findById(d.dc1._id).lean()) as any).status).toBe('INVOICED');
    expect(await bal('1020')).toBe(4720);                                // receivable
    expect(await bal('4010')).toBe(4000);
    d.inv1 = res.json;
  });

  it('the rest is dispatched in a second challan (defaults to what is left), completing the order, and invoiced separately', async () => {
    const res = await challan(d.so);
    expect(res.status).toBe(201);
    expect(res.json.items[0].quantity).toBe(6);
    const s = await fresh(d.so);
    expect(s.items[0].dispatchedQty).toBe(10);
    expect(s.status).toBe('FULFILLED');
    expect(await batch()).toMatchObject({ currentQuantity: 0, allocatedQuantity: 0 });
    expect((await challan(d.so)).status).toBe(409);                      // nothing left to dispatch
    d.dc2 = res.json;

    const inv = await invoice(d.so, d.dc2);
    expect(inv.status).toBe(201);
    expect(inv.json.totalAmount).toBe(7080);
    const after = await fresh(d.so);
    expect(after.taxInvoiceStatus).toBe('INVOICED');
    expect(after.items[0].invoicedQty).toBe(10);
    expect(await bal('1020')).toBe(4720 + 7080);
    expect((await invoice(d.so)).status).toBe(409);                      // all invoiced
    d.inv2 = inv.json;
  });

  it('the chain shows one order with two challans, each with its own invoice', async () => {
    asAdmin();
    const res = await call(r.lineage.GET, 'GET', undefined, undefined, '?type=SALES_ORDER&id=SO-PD-1');
    const nums = res.json.nodes.map((n: any) => n.number);
    for (const n of [d.dc1.number, d.dc2.number, d.inv1.invoiceNumber, d.inv2.invoiceNumber]) expect(nums, n).toContain(n);
    const edge = (a: string, b: string) => res.json.edges.some((e: any) => { const f = res.json.nodes.find((x: any) => x.key === e.from), t = res.json.nodes.find((x: any) => x.key === e.to); return f?.number === a && t?.number === b; });
    expect(edge(d.dc1.number, d.inv1.invoiceNumber)).toBe(true);
    expect(edge(d.dc2.number, d.inv2.invoiceNumber)).toBe(true);
    expect(edge(d.dc1.number, d.inv2.invoiceNumber)).toBe(false);
  });

  it('refuses to dispatch more than is left, an unknown product, bad quantities, wrong status and wrong roles', async () => {
    const s = await so('SO-PD-2', 10); await m.SO.updateOne({ _id: s._id }, { status: 'APPROVED' });
    const over = await challan(s, [{ product: id(d.bike), quantity: 11 }]);
    expect(over.status).toBe(409);
    expect(over.json.error).toContain('Only 10 left');
    expect((await challan(s, [{ product: String(oid()), quantity: 1 }])).status).toBe(400);
    for (const q of [0, -1, 'x']) expect((await challan(s, [{ product: id(d.bike), quantity: q }])).status, String(q)).toBe(400);
    expect((await challan(s, [{ product: id(d.bike), quantity: 1 }, { product: id(d.bike), quantity: 1 }])).status).toBe(400);   // same product twice
    const draft = await so('SO-PD-3', 1);
    expect((await challan(draft)).status).toBe(500);                     // not approved yet
    for (const role of ['VIEWER', 'HR_MANAGER', 'QUALITY_INSPECTOR']) { asRole(role); expect((await call(r.dc.POST, 'POST', { salesOrderId: id(s), transporterName: 'x', vehicleNo: 'x', lrNo: 'x' })).status, role).toBe(403); }
    expect((await fresh(s)).items[0].dispatchedQty).toBe(0);             // nothing was recorded by any refused request
    d.so2 = s;
  });

  it('two challans asked for at the same moment cannot dispatch more than the order holds', async () => {
    const both = await Promise.all([challan(d.so2, [{ product: id(d.bike), quantity: 6 }]), challan(d.so2, [{ product: id(d.bike), quantity: 6 }])]);
    expect(both.map(x => x.status).sort()).toEqual([201, 409]);
    const s = await fresh(d.so2);
    expect(s.items[0].dispatchedQty).toBe(6);
    expect(await m.DC.countDocuments({ salesOrder: d.so2._id })).toBe(1);   // the loser left nothing behind
  });

  it('goods that are not in stock cannot be picked, so the challan is refused; free stock is picked and used when nothing is reserved', async () => {
    // an order with no stock anywhere: there is nothing to pick, so nothing can be dispatched
    const bare = await so('SO-PD-NS', 3);
    await m.SO.updateOne({ _id: bare._id }, { status: 'APPROVED' });
    const none = await call(r.dc.POST, 'POST', { salesOrderId: id(bare), transporterName: 'FastMove', vehicleNo: 'MH12AB1234', lrNo: 'LR-NS' });
    expect(none.status).toBe(409);
    expect(none.json.error).toContain('picked');
    expect((await fresh(bare)).items[0].dispatchedQty).toBe(0);              // nothing was claimed
    expect(await m.DC.countDocuments({ lrNo: 'LR-NS' })).toBe(0);
    // free (unreserved) stock arrives: it is picked and the dispatch uses it
    await m.Batch.create({ product: d.bike._id, batchNumber: 'B-BIKE-2', expiryDate: new Date('2031-01-01'), initialQuantity: 5, currentQuantity: 5, purchasePrice: 500, qualityStatus: 'APPROVED', store: 'W1' });
    const first = await challan(d.so2, [{ product: id(d.bike), quantity: 3 }]);
    expect(first.status, JSON.stringify(first.json)).toBe(201);
    expect(first.json.stockMovements).toEqual([expect.objectContaining({ qty: 3, reserved: false })]);
    expect(first.json.stockShortfall).toEqual([]);
    d.dc3 = first.json;
    const next = await challan(d.so2, [{ product: id(d.bike), quantity: 1 }]);
    expect(next.json.stockMovements).toEqual([expect.objectContaining({ qty: 1, reserved: false })]);
    expect(((await m.Batch.findOne({ batchNumber: 'B-BIKE-2' }).lean()) as any).currentQuantity).toBe(1);
    d.dc4 = next.json;
  });

  it('cancelling a challan puts the goods back into stock and the quantity back on the order, and lets it be dispatched again', async () => {
    const before = ((await m.Batch.findOne({ batchNumber: 'B-BIKE-2' }).lean()) as any).currentQuantity;
    const cancel = (dc: any, body: any = { reason: 'wrong vehicle loaded' }, role = 'SALES') => { asRole(role); return call(r.cancel.POST, 'POST', body, { id: id(dc) }); };
    expect((await cancel(d.dc4, { reason: '' })).status).toBe(400);
    for (const role of ['VIEWER', 'STAFF', 'FINANCE_MANAGER', 'HR_MANAGER']) expect((await cancel(d.dc4, undefined, role)).status, role).toBe(403);
    expect((await cancel({ _id: 'nope' })).status).toBe(404);
    const res = await cancel(d.dc4);
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(((await m.Batch.findOne({ batchNumber: 'B-BIKE-2' }).lean()) as any).currentQuantity).toBe(before + 1);
    expect((await fresh(d.so2)).items[0].dispatchedQty).toBe(9);          // 6 + 3, the cancelled 1 is back
    expect((await cancel(d.dc4)).status).toBe(409);                       // already cancelled
    const [a, b] = await Promise.all([cancel(d.dc3), cancel(d.dc3)]);      // two people at once
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await fresh(d.so2)).items[0].dispatchedQty).toBe(6);           // not 3
    expect(await m.Audit.countDocuments({ resourceName: d.dc4.number, action: 'DELETE' })).toBe(1);

    // an invoiced challan cannot be cancelled
    const inv = await challan(d.so2, [{ product: id(d.bike), quantity: 2 }]);
    expect((await invoice(d.so2, inv.json)).status).toBe(201);
    const refused = await cancel(inv.json);
    expect(refused.status).toBe(409);
    expect(refused.json.error).toContain('invoiced');
    // dispatching what was cancelled works again
    expect((await challan(d.so2, [{ product: id(d.bike), quantity: 2 }])).status).toBe(201);
  });

  it('an invoice raised straight from the order covers only what is still uninvoiced; a proforma converts to exactly its own lines', async () => {
    const s = await so('SO-PD-4', 10); await m.SO.updateOne({ _id: s._id }, { status: 'APPROVED' });
    const dc = await challan(s, [{ product: id(d.bike), quantity: 3 }]);
    expect((await invoice(s, dc.json)).status).toBe(201);                 // 3 invoiced
    asRole('SALES');
    const pi = await call(r.pi.POST, 'POST', { salesOrderId: id(s) });
    expect(pi.status, JSON.stringify(pi.json)).toBe(201);
    expect(pi.json.items[0].quantity).toBe(7);                           // the proforma is for what is left to bill
    // meanwhile 2 more are invoiced directly
    asRole('FINANCE_MANAGER');
    const direct = await call(r.inv.POST, 'POST', { salesOrderId: id(s) });
    expect(direct.status).toBe(201);
    expect(direct.json.items[0].quantity).toBe(7);                       // everything left
    expect((await fresh(s)).taxInvoiceStatus).toBe('INVOICED');
    // the proforma can no longer be converted: its goods are already invoiced
    const conv = await call(r.piOne.PATCH, 'PATCH', { action: 'convert' }, { id: id(pi.json) });
    expect(conv.status).toBe(409);
    expect(conv.json.error).toContain('already invoiced');
    expect((await fresh(s)).items[0].invoicedQty).toBe(10);              // not 17
  });

  it('a proforma for part of what is left converts to just that part', async () => {
    const s = await so('SO-PD-5', 10); await m.SO.updateOne({ _id: s._id }, { status: 'APPROVED' });
    const dc = await challan(s, [{ product: id(d.bike), quantity: 4 }]);
    asRole('SALES');
    const pi = await call(r.pi.POST, 'POST', { salesOrderId: id(s) });
    expect(pi.json.items[0].quantity).toBe(10);
    asRole('FINANCE_MANAGER');
    expect((await invoice(s, dc.json)).status).toBe(201);                // 4 invoiced meanwhile: 6 remain
    const conv = await call(r.piOne.PATCH, 'PATCH', { action: 'convert' }, { id: id(pi.json) });
    expect(conv.status).toBe(409);                                       // the proforma still says 10, only 6 are left
    expect((await fresh(s)).items[0].invoicedQty).toBe(4);
  });

  it('a failed invoice gives the quantities back: a locked accounting period leaves the order untouched', async () => {
    const s = await so('SO-PD-6', 5); await m.SO.updateOne({ _id: s._id }, { status: 'APPROVED' });
    const dc = await challan(s);
    asAdmin();
    expect((await call(r.lock.PUT, 'PUT', { kind: 'ACCOUNTING', lockedUpTo: new Date(Date.now() + 86400000).toISOString().slice(0, 10) })).status).toBe(200);
    const res = await invoice(s, dc.json);
    expect(res.status).not.toBe(201);
    asAdmin();
    expect((await call(r.lock.PUT, 'PUT', { kind: 'ACCOUNTING', lockedUpTo: '2000-01-01', password: 'secret123' })).status).toBe(200);
    const after = await fresh(s);
    expect(after.items[0].invoicedQty).toBe(0);
    expect(after.taxInvoiceStatus).not.toBe('INVOICED');
    expect(((await m.DC.findById(dc.json._id).lean()) as any).status).toBe('ISSUED');
    expect((await invoice(s, dc.json)).status).toBe(201);                // works once the period is open
  });

  it('the older invoice screen cannot invoice an order again that the tracked flow has invoiced', async () => {
    asRole('FINANCE_MANAGER');
    const res = await call(r.legacy.POST, 'POST', { type: 'SALES', salesOrderId: id(d.so), invoiceNumber: 'LEGACY-1', items: [], totalAmount: 1 });
    expect(res.status).toBe(409);
    expect(res.json.error).toContain('already invoiced');
    expect(await m.Invoice.countDocuments({ invoiceNumber: 'LEGACY-1' })).toBe(0);
  });

  it('re-check: an empty selection of lines is refused instead of dispatching everything', async () => {
    const s = await so('SO-PD-7', 5); await m.SO.updateOne({ _id: s._id }, { status: 'APPROVED' });
    const res = await challan(s, []);
    expect(res.status).toBe(400);
    expect(((await fresh(s)).items[0].dispatchedQty)).toBe(0);
    expect(await m.DC.countDocuments({ salesOrder: s._id })).toBe(0);
  });

  it('re-check: invoicing a challan and cancelling it at the same moment cannot both succeed', async () => {
    for (let round = 0; round < 4; round++) {
      const s = await so(`SO-PD-R${round}`, 2); await m.SO.updateOne({ _id: s._id }, { status: 'APPROVED' });
      const dc = await challan(s);
      asRole('FINANCE_MANAGER');
      const inv = call(r.inv.POST, 'POST', { salesOrderId: id(s), dcId: id(dc.json) });
      asRole('SALES');
      const can = call(r.cancel.POST, 'POST', { reason: 'loaded on the wrong truck' }, { id: id(dc.json) });
      const [i, c] = await Promise.all([inv, can]);
      const final = (await m.DC.findById(dc.json._id).lean()) as any;
      const so2 = await fresh(s);
      if (i.status === 201) {
        expect(c.status).toBe(409);
        expect(final.status).toBe('INVOICED');
        expect(so2.items[0]).toMatchObject({ dispatchedQty: 2, invoicedQty: 2 });
      } else {
        expect(c.status).toBe(200);
        expect(final.status).toBe('CANCELLED');
        expect(so2.items[0]).toMatchObject({ dispatchedQty: 0, invoicedQty: 0 });
        expect(await m.Invoice.countDocuments({ soNumber: s.soNumber })).toBe(0);
      }
    }
  });

  it('re-check: stock that arrives after approval can be reserved for the order, only by the right roles, and not twice', async () => {
    const reserveRoute = await import('@/app/api/sales-orders/[id]/reserve/route');
    const prod = await m.Product.create({ name: 'Bell', sku: 'BELL', category: oid(), productType: 'FINISHED_GOOD', hsnCode: '8714', gstRate: 18, uom: 'pcs' });
    await m.Batch.create({ product: prod._id, batchNumber: 'B-BELL-1', expiryDate: new Date('2031-01-01'), initialQuantity: 4, currentQuantity: 4, purchasePrice: 5, qualityStatus: 'APPROVED', store: 'W1' });
    const s = await m.SO.create({ soNumber: 'SO-PD-8', customer: d.cust._id, customerName: 'Pune Wheels', status: 'DRAFT', items: [{ product: prod._id, quantity: 10, unitPrice: 5, totalPrice: 50 }], totalAmount: 50 });
    await d.approve(id(s), { name: 'Admin', role: 'ADMIN' });                         // 4 reserved, 6 short
    const reserve = (role = 'SALES') => { asRole(role); return call(reserveRoute.POST, 'POST', {}, { id: id(s) }); };
    expect((await fresh(s)).allocationShortfall[0].quantity).toBe(6);
    for (const role of ['VIEWER', 'STAFF', 'FINANCE_MANAGER', 'HR_MANAGER']) expect((await reserve(role)).status, role).toBe(403);
    const none = await reserve();
    expect(none.json).toMatchObject({ reservedNow: 0 });                              // nothing new in stock yet
    await m.Batch.create({ product: prod._id, batchNumber: 'B-BELL-2', expiryDate: new Date('2031-01-01'), initialQuantity: 5, currentQuantity: 5, purchasePrice: 5, qualityStatus: 'APPROVED', store: 'W1' });
    const more = await reserve();
    expect(more.status, JSON.stringify(more.json)).toBe(200);
    expect(more.json.reservedNow).toBe(5);
    expect(more.json.stillShort).toEqual([expect.objectContaining({ quantity: 1 })]);
    const after = await fresh(s);
    expect(after.allocatedBatches.reduce((t: number, a: any) => t + a.quantity, 0)).toBe(9);
    expect((await reserve()).json.reservedNow).toBe(0);                                // asking again adds nothing
    await m.Batch.create({ product: prod._id, batchNumber: 'B-BELL-3', expiryDate: new Date('2031-01-01'), initialQuantity: 5, currentQuantity: 5, purchasePrice: 5, qualityStatus: 'APPROVED', store: 'W1' });
    const both = await Promise.all([reserve(), reserve()]);
    expect(both.every(x => [200, 409].includes(x.status))).toBe(true);
    expect(both.filter(x => x.status === 200).length).toBeGreaterThanOrEqual(1);
    expect((await fresh(s)).allocatedBatches.reduce((t: number, a: any) => t + a.quantity, 0)).toBe(10);          // exactly what the order needs, never more
    expect((await m.Batch.find({ product: prod._id }).lean() as any[]).reduce((t, b) => t + b.allocatedQuantity, 0)).toBe(10);
    expect((await m.Batch.find({ product: prod._id }).lean() as any[]).every(b => b.allocatedQuantity <= b.currentQuantity)).toBe(true);
    const draft = await m.SO.create({ soNumber: 'SO-PD-9', customer: d.cust._id, customerName: 'x', status: 'DRAFT', items: [{ product: prod._id, quantity: 1, unitPrice: 1, totalPrice: 1 }], totalAmount: 1 });
    asRole('SALES');
    expect((await call(reserveRoute.POST, 'POST', {}, { id: id(draft) })).status).toBe(409);
  });
});
