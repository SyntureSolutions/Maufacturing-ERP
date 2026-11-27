import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { NextRequest } from 'next/server';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

describe('MRP, job work, approvals, DMS, notifications, CRM and BI', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const month = new Date().toISOString().slice(0, 7);

  beforeAll(async () => {
    await startDb();
    const load = async (p: string) => import(/* @vite-ignore */ p);
    const models: Record<string, string> = { Product: 'Product', BOM: 'BillOfMaterials', Batch: 'Batch', PO: 'PurchaseOrder', Supplier: 'Supplier', Customer: 'Customer', SO: 'SalesOrder', Account: 'Account', Job: 'JobWorkOrder', Enquiry: 'Enquiry', Quote: 'Quotation', Company: 'CompanySettings', Indent: 'PurchaseIndent', MRPRun: 'MRPRun', Invoice: 'Invoice', Attachment: 'Attachment' };
    for (const [k, p] of Object.entries(models)) { const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod; }
    const notif: any = await import('@/models/Notification'); m.Log = notif.NotificationLog; m.Template = notif.NotificationTemplate;
    const appr: any = await import('@/models/ApprovalMatrix'); m.Rule = appr.ApprovalRule; m.Request = appr.ApprovalRequest;
    r.forecasts = await load('@/app/api/forecasts/route');
    r.mrpRun = await load('@/app/api/mrp/run/route');
    r.mrpIndents = await load('@/app/api/mrp/indents/route');
    r.bomTree = await load('@/app/api/mrp/bom-tree/route');
    r.jobs = await load('@/app/api/jobwork/route');
    r.job = await load('@/app/api/jobwork/[id]/route');
    r.itc = await load('@/app/api/jobwork/itc04/route');
    r.rules = await load('@/app/api/approvals/rules/route');
    r.requests = await load('@/app/api/approvals/requests/route');
    r.request = await load('@/app/api/approvals/requests/[id]/route');
    r.attach = await load('@/app/api/attachments/route');
    r.attachOne = await load('@/app/api/attachments/[id]/route');
    r.dispatch = await load('@/app/api/purchase/[id]/dispatch/route');
    r.ack = await load('@/app/api/vendor-ack/route');
    r.templates = await load('@/app/api/notifications/templates/route');
    r.nlog = await load('@/app/api/notifications/log/route');
    r.followups = await load('@/app/api/enquiries/[id]/followups/route');
    r.followList = await load('@/app/api/followups/route');
    r.cron = await load('@/app/api/cron/followups/route');
    r.revise = await load('@/app/api/quotations/[id]/revise/route');
    r.quote = await load('@/app/api/quotations/[id]/route');
    r.loss = await load('@/app/api/quotations/loss-analytics/route');
    r.bi = await load('@/app/api/bi/route');
    r.notify = await load('@/lib/notify');

    const cat = new mongoose.Types.ObjectId();
    const mk = (name: string, sku: string, type: string, extra: any = {}) => m.Product.create({ name, sku, category: cat, uom: 'pcs', productType: type, hsnCode: '8712', ...extra });
    d.fg = await mk('Bike', 'FG', 'FINISHED_GOOD');
    d.sfg = await mk('Frame', 'SFG', 'SEMI_FINISHED');
    d.a = await mk('Tube', 'RM-A', 'RAW_MATERIAL', { minStockLevel: 10 });
    d.b = await mk('Steel', 'RM-B', 'RAW_MATERIAL');
    await m.BOM.create({ product: d.fg._id, version: '1', status: 'ACTIVE', components: [{ product: d.sfg._id, quantity: 1, unit: 'pcs', wastagePercentage: 0 }, { product: d.a._id, quantity: 2, unit: 'pcs', wastagePercentage: 0 }] });
    d.sfgBom = await m.BOM.create({ product: d.sfg._id, version: '1', status: 'ACTIVE', components: [{ product: d.b._id, quantity: 3, unit: 'pcs', wastagePercentage: 0 }] });
    const batch = (product: any, qty: number, extra: any = {}) => m.Batch.create({ product: product._id, batchNumber: `B-${Math.random().toString(36).slice(2, 8)}`, expiryDate: new Date('2030-01-01'), initialQuantity: qty, currentQuantity: qty, purchasePrice: 10, qualityStatus: 'APPROVED', store: 'W1', ...extra });
    d.batchA = await batch(d.a, 5);
    await batch(d.a, 1000, { store: 'QUARANTINE' }); // must be ignored by MRP
    await batch(d.b, 100);
    d.s1 = await m.Supplier.create({ name: 'Subcon Ltd', code: 'S-1', email: 'sub@example.com', gstin: '27AAPFU0939F1ZV' });
    d.cust = await m.Customer.create({ name: 'Pune Wheels', code: 'C-1', gstin: '27AAPFU0939F1ZV', billingAddress: 'FC Road', city: 'Pune', pincode: '411004', email: 'pw@example.com' });
    await m.Company.create({ key: 'company', legalName: 'Prodexa Pvt Ltd', gstin: '27AAPFU0939F1ZV', address1: '1 Rd', city: 'Pune', pincode: '411001', stateCode: '27' });
    asAdmin();
  }, 120000);

  afterAll(stopDb);

  // ---------------- MRP ----------------
  it('MRP: forecast validation and dual demand (orders + forecast, reduced by confirmed orders)', async () => {
    expect((await call(r.forecasts.PUT, 'PUT', { entries: [{ product: id(d.fg), month: '2026-13', quantity: 5 }] })).status).toBe(400);
    expect((await call(r.forecasts.PUT, 'PUT', { entries: [] })).status).toBe(400);
    expect((await call(r.forecasts.PUT, 'PUT', { entries: [{ product: id(d.fg), month, quantity: 20 }] })).json.saved).toBe(1);
    // idempotent upsert
    await call(r.forecasts.PUT, 'PUT', { entries: [{ product: id(d.fg), month, quantity: 20 }] });
    expect((await call(r.forecasts.GET, 'GET')).json).toHaveLength(1);

    await m.SO.create({ soNumber: 'SO-M-1', customer: d.cust._id, customerName: 'Pune Wheels', items: [{ product: d.fg._id, quantity: 5, unitPrice: 100, totalPrice: 500 }], totalAmount: 500, status: 'APPROVED', deliveryDate: new Date() });
    await m.PO.create({ poNumber: 'PO-M-1', supplier: d.s1._id, status: 'ORDERED', totalAmount: 100, items: [{ product: d.a._id, quantity: 10, receivedQuantity: 0, unitPrice: 10, totalPrice: 100 }] });
  });

  it('MRP: multi-level explosion, supply netting, quarantine excluded, reorder level applied', async () => {
    const prev = await call(r.mrpRun.POST, 'POST', { preview: true });
    expect(prev.status).toBe(200);
    const row = (sku: string) => prev.json.matrix.find((x: any) => x.sku === sku);
    expect(row('FG').grossReq).toBe(20);             // 5 (order) + 15 (forecast 20 - 5 already ordered)
    expect(row('SFG').itemType).toBe('SFG');
    expect(row('SFG').grossReq).toBe(20);
    expect(row('RM-A').grossReq).toBe(40);           // 20 bikes x 2
    expect(row('RM-B').grossReq).toBe(60);           // 20 frames x 3 (second level)
    expect(row('RM-A').inStock).toBe(5);             // quarantined 1000 ignored
    expect(row('RM-A').poPipeline).toBe(10);
    expect(row('RM-A').netIndentQty).toBe(35);       // 40 + reorder 10 - (5 + 10)
    expect(row('RM-B').netIndentQty).toBe(0);        // 100 in stock covers 60
    expect(row('FG').orderType).toBe('WORK_ORDER');
    expect(row('RM-A').orderType).toBe('PURCHASE');
  });

  it('MRP: saved run creates category-grouped indents once, only for purchasable shortfalls', async () => {
    const run = await call(r.mrpRun.POST, 'POST', {});
    expect(run.status).toBe(201);
    expect(run.json.plannedOrders.length).toBeGreaterThan(0);
    const created = await call(r.mrpIndents.POST, 'POST', { runId: id(run.json) });
    expect(created.status).toBe(200);
    expect(created.json.created).toHaveLength(1);
    const items = created.json.created[0].items;
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(35);
    expect(created.json.created[0].source).toBe('MRP');
    expect((await call(r.mrpIndents.POST, 'POST', { runId: id(run.json) })).status).toBe(409); // no duplicates
    expect((await call(r.mrpIndents.POST, 'POST', { runId: 'nope' })).status).toBe(400);
  });

  it('BOM explorer returns the tree and the engine refuses circular BOMs', async () => {
    const tree = await call(r.bomTree.GET, 'GET', undefined, undefined, `?product=${id(d.fg)}`);
    expect(tree.status).toBe(200);
    expect(tree.json.children.map((c: any) => c.sku).sort()).toEqual(['RM-A', 'SFG']);
    const sfg = tree.json.children.find((c: any) => c.sku === 'SFG');
    expect(sfg.children[0]).toMatchObject({ sku: 'RM-B', quantity: 3 });

    await m.BOM.updateOne({ _id: d.sfgBom._id }, { $push: { components: { product: d.fg._id, quantity: 1, unit: 'pcs', wastagePercentage: 0 } } });
    const loop = await call(r.mrpRun.POST, 'POST', { preview: true });
    expect(loop.status).toBe(500);
    expect(loop.json.error).toContain('BOM loop');
    await m.BOM.updateOne({ _id: d.sfgBom._id }, { $pull: { components: { product: d.fg._id } } });
  });

  // ---------------- Job work ----------------
  it('outward job work: stock deducted, deadline rules, partial receipt, reconciliation', async () => {
    await m.Batch.create({ product: d.b._id, batchNumber: 'B-JW', expiryDate: new Date('2030-01-01'), initialQuantity: 50, currentQuantity: 50, purchasePrice: 20, qualityStatus: 'APPROVED', store: 'W1' });
    const send = (b: any) => call(r.jobs.POST, 'POST', { kind: 'OUTWARD', party: id(d.s1), natureOfJob: 'Powder coating', ...b });
    expect((await send({ natureOfJob: '', items: [{ product: id(d.b), quantity: 10 }] })).status).toBe(400);
    const tooMuch = await send({ items: [{ product: id(d.b), quantity: 500 }] });
    expect(tooMuch.status).toBe(409);
    expect((await m.Batch.find({ product: d.b._id }).lean()).reduce((s: number, b: any) => s + b.currentQuantity, 0)).toBe(150); // nothing deducted on failure

    const ok = await send({ items: [{ product: id(d.b), quantity: 30 }], outputProduct: id(d.sfg), expectedOutputQty: 10, vehicleNo: 'MH12XY1' });
    expect(ok.status).toBe(201);
    expect(ok.json.number).toMatch(/^A-/);
    const years = (new Date(ok.json.dueDate).getFullYear() - new Date(ok.json.date).getFullYear());
    expect(years).toBe(1); // inputs return within 1 year
    const cap = await send({ goodsType: 'CAPITAL', items: [{ product: id(d.b), quantity: 5 }] });
    expect(new Date(cap.json.dueDate).getFullYear() - new Date(cap.json.date).getFullYear()).toBe(3);
    expect((await m.Batch.find({ product: d.b._id }).lean()).reduce((s: number, b: any) => s + b.currentQuantity, 0)).toBe(150 - 35);
    d.jobId = id(ok.json);

    const recv = (b: any) => call(r.job.PATCH, 'PATCH', { action: 'receive', ...b }, { id: d.jobId });
    expect((await recv({ items: [{ index: 0, consumed: 25, returned: 10, scrap: 0 }] })).status).toBe(409); // more than held
    expect((await recv({ items: [], outputQty: 0 })).status).toBe(400);
    const part = await recv({ items: [{ index: 0, consumed: 20, returned: 5, scrap: 2 }], outputQty: 9 });
    expect(part.status).toBe(200);
    expect(part.json.status).toBe('PARTIAL');
    expect(part.json.outputReceivedQty).toBe(9);
    expect(await m.Batch.countDocuments({ store: 'SFG', product: d.sfg._id })).toBe(1);   // SFG received into the SFG store
    expect(await m.Batch.countDocuments({ batchNumber: /^RET-/ })).toBe(1);               // returned raw material back in stock

    asRole('PRODUCTION_MANAGER');
    expect((await call(r.job.PATCH, 'PATCH', { action: 'writeoff', reason: 'lost' }, { id: d.jobId })).status).toBe(403);
    asAdmin();
    expect((await call(r.job.PATCH, 'PATCH', { action: 'writeoff', reason: '' }, { id: d.jobId })).status).toBe(400);
    const wo = await call(r.job.PATCH, 'PATCH', { action: 'writeoff', reason: 'lost at vendor' }, { id: d.jobId });
    expect(wo.json.status).toBe('CLOSED');
    expect(wo.json.items[0].scrap).toBe(2 + 3); // 3 still held written off
    expect((await call(r.job.PATCH, 'PATCH', { action: 'receive', items: [{ index: 0, consumed: 1 }] }, { id: d.jobId })).status).toBe(409);
  });

  it('ITC-04 register flags overdue challans', async () => {
    const open = await m.Job.findOne({ kind: 'OUTWARD', status: 'OPEN' });
    await m.Job.updateOne({ _id: open._id }, { dueDate: new Date(Date.now() - 86400000 * 5) });
    const res = await call(r.itc.GET, 'GET');
    expect(res.status).toBe(200);
    expect(res.json.summary.overdue).toBeGreaterThanOrEqual(1);
    expect(res.json.rows.find((x: any) => x.status === 'OVERDUE')).toBeTruthy();
    expect(res.json.quarters[0]).toMatch(/^\d{4}-\d{2} Q[1-4]$/);
  });

  it('inward job work: no stock valuation, custody tracking, return challan, service invoice', async () => {
    const stockBefore = await m.Batch.countDocuments();
    const bad = await call(r.jobs.POST, 'POST', { kind: 'INWARD', party: id(d.cust), items: [{ description: 'Customer shafts', quantity: 100 }], serviceRate: 0 });
    expect(bad.status).toBe(400);
    const job = await call(r.jobs.POST, 'POST', { kind: 'INWARD', party: id(d.cust), natureOfJob: 'Machining', serviceRate: 50, gstRate: 18, items: [{ description: 'Customer shafts', quantity: 100, uom: 'pcs' }] });
    expect(job.status).toBe(201);
    expect(await m.Batch.countDocuments()).toBe(stockBefore); // customer material is not our inventory
    const jid = id(job.json);
    const act = (b: any) => call(r.job.PATCH, 'PATCH', b, { id: jid });

    expect((await act({ action: 'process', quantity: 101 })).status).toBe(400);
    expect((await act({ action: 'return', quantity: 10, vehicleNo: 'MH1' })).status).toBe(400); // nothing processed yet
    expect((await act({ action: 'invoice' })).status).toBe(409);
    await act({ action: 'process', quantity: 60 });
    expect((await act({ action: 'return', quantity: 10, vehicleNo: '' })).status).toBe(400);
    const ret = await act({ action: 'return', quantity: 40, vehicleNo: 'mh 14 zz 9' });
    expect(ret.status).toBe(200);
    expect(ret.json.returns[0].challanNo).toMatch(/^B-\d{4}-0001$/);

    const inv = await act({ action: 'invoice' });
    expect(inv.status).toBe(200);
    expect(inv.json.invoice.subTotal).toBe(2000);        // 40 returned x 50 (billable = min(processed, returned))
    expect(inv.json.invoice.totalCGST).toBe(180);        // same state -> CGST + SGST
    expect(inv.json.invoice.totalAmount).toBe(2360);
    expect((await act({ action: 'invoice' })).status).toBe(409); // nothing more billable
    expect((await m.Account.findOne({ code: '4040' })).balance).toBe(2000);
  });

  // ---------------- Approvals ----------------
  it('approval matrix: rules admin-only, multi-level flow, reject -> re-draft -> resubmit', async () => {
    asRole('FINANCE_MANAGER');
    expect((await call(r.rules.PUT, 'PUT', { module: 'PURCHASE_ORDER', rules: [{ minAmount: 0, levels: ['ADMIN'] }] })).status).toBe(403);
    asAdmin();
    expect((await call(r.rules.PUT, 'PUT', { module: 'PURCHASE_ORDER', rules: [{ minAmount: 5, levels: ['ADMIN'] }, { minAmount: 5, levels: ['ADMIN'] }] })).status).toBe(400);
    expect((await call(r.rules.PUT, 'PUT', { module: 'PURCHASE_ORDER', rules: [{ minAmount: 5, levels: ['JANITOR'] }] })).status).toBe(400);
    expect((await call(r.rules.PUT, 'PUT', { module: 'PURCHASE_ORDER', rules: [{ minAmount: 100000, levels: ['SUPPLY_CHAIN_MANAGER', 'FINANCE_MANAGER'] }] })).json.saved).toBe(1);

    const small = await m.PO.create({ poNumber: 'PO-A-1', supplier: d.s1._id, status: 'DRAFT', totalAmount: 50000, items: [{ product: d.a._id, quantity: 1, unitPrice: 50000, totalPrice: 50000 }] });
    expect((await call(r.requests.POST, 'POST', { module: 'PURCHASE_ORDER', refId: id(small) })).status).toBe(409); // below every threshold

    const big = await m.PO.create({ poNumber: 'PO-A-2', supplier: d.s1._id, status: 'DRAFT', totalAmount: 150000, items: [{ product: d.a._id, quantity: 1, unitPrice: 150000, totalPrice: 150000 }] });
    const sub = await call(r.requests.POST, 'POST', { module: 'PURCHASE_ORDER', refId: id(big) });
    expect(sub.status).toBe(201);
    expect(sub.json.levels.map((l: any) => l.role)).toEqual(['SUPPLY_CHAIN_MANAGER', 'FINANCE_MANAGER']);
    const reqId = id(sub.json);

    const inbox = async (role: string) => { asRole(role); return (await call(r.requests.GET, 'GET', undefined, undefined, '?inbox=1')).json.length; };
    expect(await inbox('SUPPLY_CHAIN_MANAGER')).toBe(1);
    expect(await inbox('FINANCE_MANAGER')).toBe(0); // not their level yet
    expect(await inbox('SALES')).toBe(0);

    asRole('FINANCE_MANAGER');
    expect((await call(r.request.PATCH, 'PATCH', { action: 'approve' }, { id: reqId })).status).toBe(403);
    asRole('SUPPLY_CHAIN_MANAGER');
    expect((await call(r.request.PATCH, 'PATCH', { action: 'reject', remarks: '' }, { id: reqId })).status).toBe(400);
    const rej = await call(r.request.PATCH, 'PATCH', { action: 'reject', remarks: 'price too high' }, { id: reqId });
    expect(rej.json.status).toBe('REJECTED');
    const afterReject = await m.PO.findById(big._id);
    expect(afterReject.status).toBe('DRAFT');
    expect(afterReject.notes).toContain('price too high');

    asAdmin();
    const again = await call(r.requests.POST, 'POST', { module: 'PURCHASE_ORDER', refId: id(big) });
    expect(again.status).toBe(201);
    asRole('SUPPLY_CHAIN_MANAGER');
    expect((await call(r.request.PATCH, 'PATCH', { action: 'approve' }, { id: id(again.json) })).json.currentLevel).toBe(1);
    expect((await m.PO.findById(big._id)).status).toBe('DRAFT'); // still waiting for finance
    asRole('FINANCE_MANAGER');
    const done = await call(r.request.PATCH, 'PATCH', { action: 'approve' }, { id: id(again.json) });
    expect(done.json.status).toBe('APPROVED');
    const approved = await m.PO.findById(big._id);
    expect(approved.status).toBe('ORDERED');
    expect(approved.approvedBy.role).toBe('FINANCE_MANAGER');
    expect((await call(r.request.PATCH, 'PATCH', { action: 'approve' }, { id: id(again.json) })).status).toBe(409); // already decided
    d.po = approved;
  });

  // ---------------- Attachments ----------------
  const upload = (name: string, type: string, bytes: number | string, entityType = 'GRN', entityId = 'abc123') => {
    const fd = new FormData();
    fd.append('file', new File([typeof bytes === 'number' ? new Uint8Array(bytes) : bytes], name, { type }));
    fd.append('entityType', entityType); fd.append('entityId', entityId);
    return r.attach.POST(new NextRequest('http://localhost/api/attachments', { method: 'POST', body: fd })) as Promise<Response>;
  };

  it('DMS: upload rules, listing, safe download headers, delete permissions', async () => {
    asAdmin();
    expect((await upload('virus.exe', 'application/octet-stream', 10)).status).toBe(415);
    expect((await upload('big.pdf', 'application/pdf', 5 * 1024 * 1024 + 1)).status).toBe(413);
    expect((await upload('x.pdf', 'application/pdf', 10, 'bad type!')).status).toBe(400);

    const pdf = await upload('Test Cert (1).pdf', 'application/pdf', '%PDF-1.4 test');
    expect(pdf.status).toBe(201);
    const meta = await pdf.json();
    expect(meta.data).toBeUndefined(); // file bytes never returned in metadata
    const txt = await (await upload('notes.txt', 'text/plain', 'hello')).json();

    const list = await call(r.attach.GET, 'GET', undefined, undefined, '?entityType=GRN&entityId=abc123');
    expect(list.json).toHaveLength(2);
    expect(list.json[0].data).toBeUndefined();
    expect((await call(r.attach.GET, 'GET', undefined, undefined, '?entityType=GRN')).status).toBe(400);

    const dl = await call(r.attachOne.GET, 'GET', undefined, { id: id(meta) });
    expect(dl.status).toBe(200);
    expect(dl.text).toBe('%PDF-1.4 test');
    const res = await r.attachOne.GET(new NextRequest('http://localhost/x'), { params: Promise.resolve({ id: id(txt) }) });
    expect(res.headers.get('content-disposition')).toContain('attachment'); // non-previewable types always download
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const pdfRes = await r.attachOne.GET(new NextRequest('http://localhost/x'), { params: Promise.resolve({ id: id(meta) }) });
    expect(pdfRes.headers.get('content-disposition')).toContain('inline');
    expect(pdfRes.headers.get('content-security-policy')).toContain('sandbox');

    asRole('VIEWER');
    expect((await upload('v.pdf', 'application/pdf', 5)).status).toBe(403);
    asRole('STAFF');
    expect((await call(r.attachOne.DELETE, 'DELETE', undefined, { id: id(meta) })).status).toBe(403); // not uploader, not admin
    asAdmin();
    expect((await call(r.attachOne.DELETE, 'DELETE', undefined, { id: id(meta) })).status).toBe(200);
    expect((await call(r.attach.GET, 'GET', undefined, undefined, '?entityType=GRN&entityId=abc123')).json).toHaveLength(1);
  });

  // ---------------- Notifications ----------------
  it('notifications: default templates seeded, template validation, PO dispatch with acknowledgement link', async () => {
    const t = await call(r.templates.GET, 'GET');
    expect(t.json.templates.length).toBeGreaterThanOrEqual(7);
    expect(t.json.providers).toEqual({ EMAIL: false, SMS: false, WHATSAPP: false });
    expect((await call(r.templates.PUT, 'PUT', { event: 'PO_DISPATCH', channel: 'EMAIL', subject: 'Hi', body: 'Order {{orderNumber}}' })).status).toBe(400); // variable not for this event
    expect((await call(r.templates.PUT, 'PUT', { event: 'PO_DISPATCH', channel: 'EMAIL', subject: 'PO {{poNumber}}', body: 'CUSTOM {{poNumber}} {{ackLink}}' })).status).toBe(200);

    asRole('SALES');
    expect((await call(r.dispatch.POST, 'POST', {}, { id: id(d.po) })).status).toBe(403);
    asAdmin();
    const draft = await m.PO.create({ poNumber: 'PO-N-0', supplier: d.s1._id, status: 'DRAFT', totalAmount: 1, items: [{ product: d.a._id, quantity: 1, unitPrice: 1, totalPrice: 1 }] });
    expect((await call(r.dispatch.POST, 'POST', {}, { id: id(draft) })).status).toBe(409); // not approved

    const sent = await call(r.dispatch.POST, 'POST', {}, { id: id(d.po) });
    expect(sent.status).toBe(200);
    expect(sent.json.results.find((x: any) => x.channel === 'EMAIL').status).toBe('SKIPPED'); // provider not configured, but recorded
    const log = await m.Log.findOne({ event: 'PO_DISPATCH', channel: 'EMAIL' });
    expect(log.body).toContain('CUSTOM PO-A-2');
    expect(log.status).toBe('SKIPPED');
    const token = sent.json.ackLink.split('/').pop();
    expect(token).toMatch(/^[a-f0-9]{32}$/);

    // vendor acknowledges via the public link
    expect((await call(r.ack.GET, 'GET', undefined, undefined, '?token=zzz')).status).toBe(400);
    expect((await call(r.ack.GET, 'GET', undefined, undefined, `?token=${'0'.repeat(32)}`)).status).toBe(404);
    const info = await call(r.ack.GET, 'GET', undefined, undefined, `?token=${token}`);
    expect(info.json.poNumber).toBe('PO-A-2');
    expect((await call(r.ack.POST, 'POST', { token, name: '' })).status).toBe(400);
    expect((await call(r.ack.POST, 'POST', { token, name: 'Vendor Rep' })).status).toBe(200);
    expect((await call(r.ack.POST, 'POST', { token, name: 'Again' })).status).toBe(409);
    expect((await m.PO.findById(d.po._id)).dispatch.ackBy).toBe('Vendor Rep');
    expect((await call(r.nlog.GET, 'GET', undefined, undefined, '?refNumber=PO-A-2')).json.length).toBeGreaterThan(0);
  });

  it('phone numbers are normalised to E.164 before SMS / WhatsApp', async () => {
    expect(r.notify.toE164('98765 43210')).toBe('+919876543210');
    expect(r.notify.toE164('+14155552671')).toBe('+14155552671');
    expect(r.notify.toE164('919876543210')).toBe('+919876543210');
    expect(r.notify.toE164('12345')).toBeNull();
  });

  // ---------------- CRM follow-ups ----------------
  it('follow-ups: schedule, complete with outcome, overdue widget, protected cron reminder', async () => {
    const enq = await m.Enquiry.create({ enquiryNumber: 'ENQ-T-1', customerName: 'Export Buyer', region: 'EXPORT', country: 'Kenya', items: [{ productName: 'Bike', estimatedQuantity: 10 }] });
    const eid = id(enq);
    expect((await call(r.followups.POST, 'POST', { dueAt: 'not a date', mode: 'CALL' }, { id: eid })).status).toBe(400);
    expect((await call(r.followups.POST, 'POST', { dueAt: new Date().toISOString(), mode: 'FAX' }, { id: eid })).status).toBe(400);
    const past = new Date(Date.now() - 3600_000).toISOString();
    expect((await call(r.followups.POST, 'POST', { dueAt: past, mode: 'CALL', notes: 'send price list' }, { id: eid })).status).toBe(201);
    await call(r.followups.POST, 'POST', { dueAt: new Date(Date.now() + 7 * 86400000).toISOString(), mode: 'EMAIL' }, { id: eid });

    const widget = await call(r.followList.GET, 'GET');
    expect(widget.json.overdue).toHaveLength(1);
    expect(widget.json.upcoming).toHaveLength(1);
    expect(widget.json.overdue[0].region).toBe('EXPORT');

    // cron: disabled without a secret, rejects a wrong one, then reminds once
    const cron = (secret?: string) => r.cron.POST(new NextRequest('http://localhost/api/cron/followups', { method: 'POST', headers: secret ? { 'x-cron-secret': secret } : {} })) as Promise<Response>;
    delete process.env.CRON_SECRET;
    expect((await cron('x')).status).toBe(503);
    process.env.CRON_SECRET = 'topsecret'; process.env.FOLLOWUP_ALERT_EMAIL = 'sales@example.com';
    expect((await cron('wrong-secret')).status).toBe(401);
    expect((await cron()).status).toBe(401);
    const ran = await (await cron('topsecret')).json();
    expect(ran.checked).toBe(1);
    expect(await m.Log.countDocuments({ event: 'FOLLOWUP_DUE' })).toBe(1);

    const fid = String(widget.json.overdue[0]._id);
    expect((await call(r.followups.PATCH, 'PATCH', { followUpId: fid, action: 'complete', outcome: '' }, { id: eid })).status).toBe(400);
    expect((await call(r.followups.PATCH, 'PATCH', { followUpId: fid, action: 'complete', outcome: 'Sent list, will revert' }, { id: eid })).status).toBe(200);
    expect((await call(r.followups.PATCH, 'PATCH', { followUpId: fid, action: 'complete', outcome: 'again' }, { id: eid })).status).toBe(409);
    const after = await call(r.followList.GET, 'GET');
    expect(after.json.overdue).toHaveLength(0);
    expect(after.json.history[0].outcome).toContain('Sent list');
    expect((await call(r.followList.GET, 'GET', undefined, undefined, '?region=DOMESTIC')).json.upcoming).toHaveLength(0);
  });

  // ---------------- Quotations ----------------
  it('quotation revisions: history, GST, export validation, price lock on conversion, loss capture + analytics', async () => {
    const q = await m.Quote.create({ quoteNumber: 'QT-T-1', customer: d.cust._id, customerName: 'Pune Wheels', stage: 'QUOTATION_SENT', items: [{ product: d.fg._id, productName: 'Bike', quantity: 10, unitPrice: 1000, totalPrice: 10000 }], totalAmount: 10000, paymentTerms: 'NET 30' });
    const qid = id(q);
    const rev = (b: any) => call(r.revise.POST, 'POST', b, { id: qid });

    expect((await rev({ items: [{ productName: 'Bike', quantity: 10, unitPrice: 900 }] })).status).toBe(400); // note required
    expect((await rev({ note: 'x', items: [{ productName: 'Bike', quantity: 0, unitPrice: 900 }] })).status).toBe(400);
    expect((await rev({ note: 'x', orderType: 'EXPORT', items: [{ productName: 'Bike', quantity: 1, unitPrice: 9 }] })).status).toBe(400); // incomplete export terms

    const r2 = await rev({ note: 'Volume discount', items: [{ product: id(d.fg), productName: 'Bike', quantity: 10, unitPrice: 900 }], terms: 'Custom T&C', validUntil: '2030-01-01' });
    expect(r2.status).toBe(200);
    expect(r2.json.revision).toBe(2);
    expect(r2.json.totalAmount).toBe(9000);
    expect(r2.json.taxSummary.totalCGST).toBe(810); // Pune -> Pune: intra-state 18%
    expect(r2.json.taxSummary.grandTotal).toBe(10620);

    const hist = await call(r.revise.GET, 'GET', undefined, { id: qid });
    expect(hist.json.revisions.map((x: any) => x.rev)).toEqual([1, 2]);
    expect(hist.json.revisions[0].totalAmount).toBe(10000); // original preserved
    expect(hist.json.revisions[1].current).toBe(true);

    const exp = await rev({ note: 'Export version', orderType: 'EXPORT', currency: 'USD', exchangeRate: 83.5, incoterm: 'FOB', portOfLoading: 'Mumbai', portOfDischarge: 'Mombasa', country: 'Kenya', items: [{ product: id(d.fg), productName: 'Bike', quantity: 10, unitPrice: 900 }] });
    expect(exp.status).toBe(200);
    expect(exp.json.taxSummary).toBeNull(); // no GST on export quote
    expect(exp.json.revision).toBe(3);

    // winning the deal freezes price + terms and carries the export details to the sales order
    const won = await call(r.quote.PATCH, 'PATCH', { stage: 'PO_RECEIVED', poNumber: 'CUST-PO-1' }, { id: qid });
    expect(won.status).toBe(200);
    expect(won.json.createdSalesOrder.priceLocked).toBe(true);
    expect(won.json.createdSalesOrder.incoterm).toBe('FOB');
    expect(won.json.createdSalesOrder.orderType).toBe('EXPORT');
    expect(won.json.createdSalesOrder.currency).toBe('USD');
    expect((await rev({ note: 'late change' })).status).toBe(409); // closed quotation cannot be revised
    expect(await m.Log.countDocuments({ event: 'ORDER_CONFIRMATION' })).toBeGreaterThan(0);

    // loss reason is mandatory and feeds analytics
    const lost = await m.Quote.create({ quoteNumber: 'QT-T-2', customerName: 'Z', stage: 'UNDER_REVIEW', items: [{ productName: 'Bike', quantity: 1, unitPrice: 5000, totalPrice: 5000 }], totalAmount: 5000 });
    expect((await call(r.quote.PATCH, 'PATCH', { stage: 'LOST_DECLINED' }, { id: id(lost) })).status).toBe(400);
    expect((await call(r.quote.PATCH, 'PATCH', { stage: 'LOST_DECLINED', lossCategory: 'WEATHER', lossReason: 'x' }, { id: id(lost) })).status).toBe(400);
    expect((await call(r.quote.PATCH, 'PATCH', { stage: 'LOST_DECLINED', lossCategory: 'PRICE', lossReason: 'Competitor 10% cheaper' }, { id: id(lost) })).status).toBe(200);
    const an = await call(r.loss.GET, 'GET');
    expect(an.json).toEqual([{ category: 'PRICE', count: 1, value: 5000 }]);
  });

  // ---------------- BI ----------------
  it('BI datasets load for every source', async () => {
    const cat = await call(r.bi.GET, 'GET');
    expect(cat.json.map((s: any) => s.key).sort()).toEqual(['oee', 'production', 'purchases', 'sales', 'scrap', 'stages', 'supplierQuality']);
    for (const s of cat.json) {
      const res = await call(r.bi.GET, 'GET', undefined, undefined, `?source=${s.key}`);
      expect(res.status, s.key).toBe(200);
      expect(res.json.dimensions.length).toBeGreaterThan(0);
      expect(Array.isArray(res.json.rows)).toBe(true);
    }
    const purchases = await call(r.bi.GET, 'GET', undefined, undefined, '?source=purchases');
    expect(purchases.json.rows.length).toBeGreaterThan(0);
    expect((await call(r.bi.GET, 'GET', undefined, undefined, '?source=nope')).status).toBe(404);
  });
});
