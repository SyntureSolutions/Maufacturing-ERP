import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id, state, pickAll } from './harness';

// End-to-end: company profile -> proforma -> challan -> tax invoice -> e-invoice/e-way -> receipts/notes -> reports -> lock -> Tally
describe('sales to cash and accounting flow', () => {
  const m: any = {}, r: any = {}, d: any = {};

  beforeAll(async () => {
    await startDb();
    const load = async (p: string) => import(/* @vite-ignore */ p);
    for (const [k, p] of Object.entries({ Product: 'Product', Customer: 'Customer', SO: 'SalesOrder', Invoice: 'Invoice', Account: 'Account', Journal: 'JournalEntry', Voucher: 'Voucher', User: 'User', Lock: 'PeriodLock', Log: 'Notification' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`);
      m[k] = mod.default || mod;
    }
    m.NotificationLog = m.Log.NotificationLog;
    r.company = await load('@/app/api/settings/company/route');
    r.pi = await load('@/app/api/proforma/route');
    r.piOne = await load('@/app/api/proforma/[id]/route');
    r.dc = await load('@/app/api/delivery-challans/route');
    r.inv = await load('@/app/api/dispatch/invoices/route');
    r.invOne = await load('@/app/api/dispatch/invoices/[id]/route');
    r.vouchers = await load('@/app/api/vouchers/route');
    r.reports = await load('@/app/api/finance/reports/route');
    r.lock = await load('@/app/api/settings/period-lock/route');
    r.tally = await load('@/app/api/tally/export/route');
    r.customers = await load('@/app/api/customers/route');

    const cat = new mongoose.Types.ObjectId();
    d.bike = await m.Product.create({ name: 'City Bike', sku: 'FG-BIKE', category: cat, productType: 'FINISHED_GOOD', hsnCode: '8712', gstRate: 18, uom: 'pcs' });
    d.nohsn = await m.Product.create({ name: 'Mystery Part', sku: 'X-1', category: cat, uom: 'pcs' });
    // Buyer in Karnataka (29) -> inter-state; buyer in Maharashtra (27) -> intra-state
    d.kar = await m.Customer.create({ name: 'Bangalore Cycles', code: 'C-1', gstin: '29AABCT1332L1ZZ', billingAddress: '12 MG Road', city: 'Bengaluru', pincode: '560001', email: 'blr@example.com', phone: '9876543210', paymentTerms: 'NET 45' });
    d.mah = await m.Customer.create({ name: 'Pune Wheels', code: 'C-2', gstin: '27AAPFU0939F1ZV', billingAddress: '5 FC Road', city: 'Pune', pincode: '411004' });
    d.nopin = await m.Customer.create({ name: 'No Pincode Ltd', code: 'C-3', gstin: '29AABCT1332L1ZZ', billingAddress: 'Somewhere' });
    const so = (n: string, customer: any, product: any, qty: number, price: number) => m.SO.create({ soNumber: n, customer: customer._id, customerName: customer.name, items: [{ product: product._id, quantity: qty, unitPrice: price, totalPrice: qty * price }], totalAmount: qty * price, status: 'APPROVED', paymentTerms: 'NET 30' });
    d.so1 = await so('SO-T-1', d.kar, d.bike, 10, 20000);   // 200000 taxable, 236000 with IGST
    d.so2 = await so('SO-T-2', d.mah, d.bike, 1, 1000);     // intra-state, small (below e-way threshold)
    d.so3 = await so('SO-T-3', d.kar, d.nohsn, 1, 100);
    d.so4 = await so('SO-T-4', d.nopin, d.bike, 1, 1000);
    asAdmin();
  }, 120000);

  afterAll(stopDb);

  it('refuses GST documents until the company profile is complete, then validates it', async () => {
    const early = await call(r.pi.POST, 'POST', { salesOrderId: id(d.so1) });
    expect(early.status).toBe(500);
    expect(early.json.error).toContain('Company Settings');

    asRole('SALES');
    expect((await call(r.company.PUT, 'PUT', { legalName: 'Prodexa Pvt Ltd', gstin: '27AAPFU0939F1ZV' })).status).toBe(403);
    asRole('FINANCE_MANAGER');
    expect((await call(r.company.PUT, 'PUT', { legalName: 'Prodexa', gstin: 'BAD-GSTIN' })).status).toBe(400);
    const ok = await call(r.company.PUT, 'PUT', { legalName: 'Prodexa Pvt Ltd', gstin: '27AAPFU0939F1ZV', address1: '1 Factory Rd', city: 'Pune', pincode: '411001', bank: { name: 'HDFC', accountNo: '123456', ifsc: 'HDFC0001' } });
    expect(ok.status).toBe(200);
    expect(ok.json.stateCode).toBe('27'); // derived from GSTIN
  });

  it('flags products without HSN and customers without a pincode on e-documents', async () => {
    asAdmin();
    const noHsn = await call(r.pi.POST, 'POST', { salesOrderId: id(d.so3) });
    expect(noHsn.json.error).toContain('HSN');
  });

  it('issues a proforma with IGST for an inter-state buyer and validates the advance', async () => {
    expect((await call(r.pi.POST, 'POST', { salesOrderId: id(d.so1), advanceRequested: 999999 })).status).toBe(500); // > total
    const pi = await call(r.pi.POST, 'POST', { salesOrderId: id(d.so1), advanceRequested: 100000 });
    expect(pi.status).toBe(201);
    expect(pi.json.totalIGST).toBe(36000);
    expect(pi.json.totalCGST).toBe(0);
    expect(pi.json.totalAmount).toBe(236000);
    expect(pi.json.number).toMatch(/^PI-/);
    d.piId = id(pi.json);
  });

  it('creates a Rule 55 delivery challan (transporter, vehicle, LR) and logs the dispatch alert', async () => {
    const base = { salesOrderId: id(d.so1), transporterName: 'FastMove', vehicleNo: 'ka 01 ab 1234', lrNo: 'LR-9' };
    expect((await call(r.dc.POST, 'POST', { ...base, lrNo: '' })).status).toBe(400);
    await pickAll(id(d.so1), true);
    const dc = await call(r.dc.POST, 'POST', base);
    expect(dc.status).toBe(201);
    expect(dc.json.vehicleNo).toBe('KA01AB1234'); // normalised
    d.dcId = id(dc.json);
    const logs = await m.NotificationLog.find({ event: 'DISPATCH_ALERT' });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l: any) => l.status === 'SKIPPED')).toBe(true); // no provider configured -> recorded, not sent
  });

  it('converts the proforma to a tax invoice (Finance only) and posts a balanced journal', async () => {
    asRole('SALES');
    expect((await call(r.piOne.PATCH, 'PATCH', { action: 'convert' }, { id: d.piId })).status).toBe(403);
    asRole('FINANCE_MANAGER');
    const res = await call(r.piOne.PATCH, 'PATCH', { action: 'convert' }, { id: d.piId });
    expect(res.status).toBe(200);
    expect(res.json.invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{4}$/);
    expect(res.json.invoice.totalAmount).toBe(236000);
    d.invId = id(res.json.invoice);
    d.invNo = res.json.invoice.invoiceNumber;

    expect((await call(r.piOne.PATCH, 'PATCH', { action: 'convert' }, { id: d.piId })).status).toBe(409);
    const dup = await call(r.inv.POST, 'POST', { salesOrderId: id(d.so1) });
    expect(dup.status).toBe(409);
    expect(dup.json.error).toContain('already invoiced');

    const bal = async (code: string) => (await m.Account.findOne({ code })).balance;
    expect(await bal('1020')).toBe(236000);  // receivable
    expect(await bal('4010')).toBe(200000);  // sales
    expect(await bal('2020')).toBe(36000);   // output GST
    expect((await m.SO.findById(d.so1)).taxInvoiceStatus).toBe('INVOICED');
  });

  it('charges CGST + SGST for an intra-state buyer', async () => {
    const res = await call(r.inv.POST, 'POST', { salesOrderId: id(d.so2), dcId: undefined });
    expect(res.status).toBe(201);
    expect(res.json.totalCGST).toBe(90);
    expect(res.json.totalSGST).toBe(90);
    expect(res.json.totalIGST).toBe(0);
    d.smallInv = id(res.json);
  });

  it('builds the e-invoice JSON, tracks status, and validates the IRN returned by the portal', async () => {
    const get = (q: string) => call(r.invOne.GET, 'GET', undefined, { id: d.invId }, `?${q}`);
    const e = await get('doc=einvoice');
    expect(e.status).toBe(200);
    const payload = JSON.parse(e.text)[0];
    expect(payload.Version).toBe('1.1');
    expect(payload.SellerDtls.Gstin).toBe('27AAPFU0939F1ZV');
    expect(payload.BuyerDtls.Stcd).toBe('29');
    expect(payload.ValDtls.TotInvVal).toBe(236000);
    expect(payload.ItemList[0].IgstAmt).toBe(36000);

    const inv = await m.Invoice.findById(d.invId);
    expect(inv.einvoiceStatus).toBe('JSON_GENERATED');
    expect(inv.irnHash).toMatch(/^[0-9a-f]{64}$/);

    expect((await call(r.invOne.PATCH, 'PATCH', { action: 'record-irn', irn: 'abc' }, { id: d.invId })).status).toBe(400);
    expect((await call(r.invOne.PATCH, 'PATCH', { action: 'record-irn', irn: 'f'.repeat(64) }, { id: d.invId })).status).toBe(409); // not this invoice's IRN
    const ok = await call(r.invOne.PATCH, 'PATCH', { action: 'record-irn', irn: inv.irnHash, ackNo: '1122334455', signedQr: 'QR' }, { id: d.invId });
    expect(ok.status).toBe(200);
    expect(ok.json.einvoiceStatus).toBe('REGISTERED');

    // buyer without a pincode cannot be e-invoiced
    const bad = await call(r.inv.POST, 'POST', { salesOrderId: id(d.so4) });
    expect(bad.status).toBe(201);
    const badGet = await call(r.invOne.GET, 'GET', undefined, { id: id(bad.json) }, '?doc=einvoice');
    expect(badGet.status).toBe(422);
    expect(badGet.json.error).toContain('pincode');
  });

  it('builds e-way bill JSON only above the Rs 50,000 threshold and with transport data', async () => {
    const small = await call(r.invOne.GET, 'GET', undefined, { id: d.smallInv }, '?doc=eway&distance=10&vehicle=MH12AB1234');
    expect(small.status).toBe(422);
    const missing = await call(r.invOne.GET, 'GET', undefined, { id: d.invId }, '?doc=eway&distance=120');
    expect(missing.status).toBe(422);
    const ok = await call(r.invOne.GET, 'GET', undefined, { id: d.invId }, '?doc=eway&distance=120&vehicle=KA01AB1234&transporter=FastMove');
    expect(ok.status).toBe(200);
    const row = JSON.parse(ok.text).billLists[0];
    expect(row.docNo).toBe(d.invNo);
    expect(row.totInvValue).toBe(236000);
    expect(row.toStateCode).toBe(29);
    expect((await call(r.invOne.PATCH, 'PATCH', { action: 'record-eway', number: '123' }, { id: d.invId })).status).toBe(400);
    expect((await call(r.invOne.PATCH, 'PATCH', { action: 'record-eway', number: '271234567890' }, { id: d.invId })).json.ewayStatus).toBe('GENERATED');
  });

  it('takes the e-way bill distance from the customer master when none is typed', async () => {
    const inv: any = await m.Invoice.findById(d.invId);
    await m.Customer.updateOne({ _id: inv.customer }, { distanceKm: 650 });
    await m.Invoice.updateOne({ _id: d.invId }, { $unset: { transport: 1 } });
    const res = await call(r.invOne.GET, 'GET', undefined, { id: d.invId }, '?doc=eway&vehicle=KA01AB1234&transporter=FastMove');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.text).billLists[0].transDistance).toBe(650);
    // a distance typed for this dispatch wins
    const typed = await call(r.invOne.GET, 'GET', undefined, { id: d.invId }, '?doc=eway&distance=700&vehicle=KA01AB1234');
    expect(JSON.parse(typed.text).billLists[0].transDistance).toBe(700);
  });

  it('vouchers: validates input, settles invoices, applies credit notes and blocks over-settlement', async () => {
    const post = (b: any) => call(r.vouchers.POST, 'POST', b);
    asRole('SALES');
    expect((await post({ type: 'CASH_RECEIPT', amount: 10, partyType: 'CUSTOMER' })).status).toBe(403);
    asRole('FINANCE_MANAGER');

    expect((await post({ type: 'BANK_RECEIPT', amount: 100000, partyType: 'CUSTOMER', partyId: id(d.kar), refInvoiceId: d.invId })).status).toBe(400); // no UTR
    const rec = await post({ type: 'BANK_RECEIPT', amount: 100000, partyType: 'CUSTOMER', partyId: id(d.kar), refInvoiceId: d.invId, instrument: { utr: 'UTR1' } });
    expect(rec.status).toBe(201);
    expect(rec.json.number).toMatch(/^BR-/);
    expect((await m.Invoice.findById(d.invId)).status).toBe('PARTIAL');

    expect((await post({ type: 'CREDIT_NOTE', taxableAmount: 10000, gstPercent: 18 })).status).toBe(400); // needs an invoice
    // a note needs a reason; a rate difference sets its taxable value; the original invoice and the party's note are kept
    expect((await post({ type: 'CREDIT_NOTE', taxableAmount: 10000, gstPercent: 18, refInvoiceId: d.invId })).json.error).toMatch(/reason/);
    expect((await post({ type: 'CREDIT_NOTE', noteReason: 'RATE_DIFFERENCE', taxableAmount: 10000, gstPercent: 18, refInvoiceId: d.invId })).json.error).toMatch(/billed rate and actual rate/);
    expect((await post({ type: 'CREDIT_NOTE', noteReason: 'RATE_DIFFERENCE', rateDiff: { quantity: 10, billedRate: 20000, actualRate: 21000 }, gstPercent: 18, refInvoiceId: d.invId })).json.error).toMatch(/below the billed rate/);
    expect((await post({ type: 'CREDIT_NOTE', noteReason: 'RATE_DIFFERENCE', rateDiff: { quantity: 10, billedRate: 20000, actualRate: 19000 }, taxableAmount: 5000, gstPercent: 18, refInvoiceId: d.invId })).json.error).toMatch(/works out to 10000/);
    expect((await post({ type: 'CREDIT_NOTE', noteReason: 'OTHERS', itcDate: '2026-01-01', taxableAmount: 10000, gstPercent: 18, refInvoiceId: d.invId })).json.error).toMatch(/ITC date applies to debit notes/);
    expect((await post({ type: 'CREDIT_NOTE', noteReason: 'OTHERS', date: '2020-01-01', taxableAmount: 10000, gstPercent: 18, refInvoiceId: d.invId })).json.error).toMatch(/before the invoice/);
    const cn = await post({ type: 'CREDIT_NOTE', noteReason: 'Rate difference', rateDiff: { quantity: 10, billedRate: 20000, actualRate: 19000 }, partyNoteNo: 'BC-DN-7', partyNoteDate: new Date().toISOString().slice(0, 10), gstPercent: 18, refInvoiceId: d.invId });
    expect(cn.status, JSON.stringify(cn.json)).toBe(201);
    expect(cn.json.noteDetails).toMatchObject({ reason: 'RATE_DIFFERENCE', rateDiff: { quantity: 10, billedRate: 20000, actualRate: 19000 }, partyNoteNo: 'BC-DN-7' });
    expect(cn.json.refDoc.date).toBeTruthy();
    const print = await (await import('@/lib/printDocs')).PRINT_TYPES.voucher.load(id(cn.json), new URLSearchParams());
    expect(Object.fromEntries(print!.meta)).toMatchObject({ Reason: 'Rate difference', "Customer's debit note": expect.stringContaining('BC-DN-7') });
    expect(cn.json.amount).toBe(11800);
    expect((await m.Invoice.findById(d.invId)).creditedAmount).toBe(11800);

    // outstanding is now 236000 - 100000 - 11800 = 124200
    expect((await post({ type: 'CASH_RECEIPT', amount: 124300, partyType: 'CUSTOMER', refInvoiceId: d.invId })).status).toBe(400);
    expect((await post({ type: 'CASH_RECEIPT', amount: 124200, partyType: 'CUSTOMER', partyId: id(d.kar), refInvoiceId: d.invId })).status).toBe(201);
    expect((await m.Invoice.findById(d.invId)).status).toBe('PAID');

    expect((await post({ type: 'JOURNAL', journalLines: [{ accountCode: '5040', debit: 100 }, { accountCode: '1010', credit: 90 }] })).status).toBe(400);
    expect((await post({ type: 'JOURNAL', narration: 'depreciation', journalLines: [{ accountCode: '5040', debit: 500 }, { accountCode: '1010', credit: 500 }] })).status).toBe(201);
    expect((await post({ type: 'CONTRA', amount: 300, from: 'BANK', to: 'CASH' })).status).toBe(201);
    expect((await post({ type: 'CONTRA', amount: 300, from: 'BANK', to: 'BANK' })).status).toBe(400);
    const exp = await post({ type: 'EXPENSE', taxableAmount: 10000, gstPercent: 18, tdsPercent: 10, expensePayment: 'CREDIT', costCenter: 'Paint shop' });
    expect(exp.status).toBe(201);
    expect(exp.json.tdsAmount).toBe(1000);
    expect((await post({ type: 'PETTY_CASH', pettyKind: 'REPLENISH', amount: 2000, mode: 'CASH' })).status).toBe(201);
    expect((await post({ type: 'PETTY_CASH', pettyKind: 'EXPENSE', amount: 150, category: 'Tea' })).status).toBe(201);
    expect((await m.Account.findOne({ code: '1006' })).balance).toBe(1850); // petty cash imprest balance
  });

  it('books stay balanced: every posted journal has equal debits and credits', async () => {
    const entries = await m.Journal.find();
    expect(entries.length).toBeGreaterThan(5);
    for (const e of entries) expect(e.totalDebit).toBe(e.totalCredit);
  });

  it('reports: trial balance, P&L, balance sheet, ledger drill-down, aging', async () => {
    const get = (q: string) => call(r.reports.GET, 'GET', undefined, undefined, `?${q}`);
    const tb = await get('type=trial');
    expect(tb.status).toBe(200);
    expect(tb.json.difference).toBe(0);
    expect(tb.json.totalDebit).toBe(tb.json.totalCredit);

    const today = new Date().toISOString().slice(0, 10);
    const pnl = await get(`type=pnl&from=2000-01-01&to=${today}`);
    expect(pnl.json.totalRevenue).toBeGreaterThan(0);
    // revenue = invoice 200000 + 900 (small) + 1000 (no-pincode) less 10000 credit note taxable
    expect(pnl.json.totalRevenue).toBe(200000 + 1000 + 1000 - 10000);

    const bs = await get('type=bs');
    expect(bs.json.difference).toBe(0); // assets = liabilities + equity + profit

    const ledger = await get('type=ledger&account=1020&from=2000-01-01');
    expect(ledger.status).toBe(200);
    expect(ledger.json.lines.length).toBeGreaterThan(2);
    const last = ledger.json.lines[ledger.json.lines.length - 1];
    expect(last.balance).toBe(ledger.json.closing);
    expect((await get('type=ledger&account=9999')).status).toBe(404);

    const debtors = await get('type=debtors');
    expect(debtors.status).toBe(200);
    // fully-paid big invoice is excluded; the two small unpaid invoices remain
    const total = debtors.json.totals.total;
    expect(total).toBe(1180 + 1180);
    expect(debtors.json.totals['0-30']).toBe(total);
    expect((await get('type=nonsense')).status).toBe(400);
  });

  it('period lock blocks postings; reopening needs an Admin with the right password', async () => {
    await m.User.create({ _id: '65f011111111111111111100', name: 'Test Admin', email: 'admin@test.com', password: 'secret123', role: 'ADMIN' });
    asAdmin();
    const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    expect((await call(r.lock.PUT, 'PUT', { kind: 'ACCOUNTING', lockedUpTo: future })).status).toBe(200);

    asRole('FINANCE_MANAGER');
    const blocked = await call(r.vouchers.POST, 'POST', { type: 'CONTRA', amount: 10, from: 'BANK', to: 'CASH' });
    expect(blocked.status).toBe(422);
    expect(blocked.json.error).toContain('locked');
    const blockedInv = await call(r.inv.POST, 'POST', { salesOrderId: id(d.so3) });
    expect(blockedInv.status).toBe(500); // HSN error comes first; use a valid SO below
    const so5 = await m.SO.create({ soNumber: 'SO-T-5', customer: d.mah._id, customerName: 'Pune Wheels', items: [{ product: d.bike._id, quantity: 1, unitPrice: 500, totalPrice: 500 }], totalAmount: 500, status: 'APPROVED' });
    const lockedInv = await call(r.inv.POST, 'POST', { salesOrderId: id(so5) });
    expect(lockedInv.json.error).toContain('locked');
    expect(await m.Invoice.countDocuments({ soNumber: 'SO-T-5' })).toBe(0); // nothing half-created

    // reopening: Finance cannot, Admin needs the password
    const reopen = (role: string, password?: string) => { if (role === 'ADMIN') asAdmin(); else asRole(role); return call(r.lock.PUT, 'PUT', { kind: 'ACCOUNTING', lockedUpTo: '2000-01-01', password }); };
    expect((await reopen('FINANCE_MANAGER')).status).toBe(403);
    expect((await reopen('ADMIN')).status).toBe(403);
    expect((await reopen('ADMIN', 'wrong')).status).toBe(403);
    expect((await reopen('ADMIN', 'secret123')).status).toBe(200);

    asRole('FINANCE_MANAGER');
    expect((await call(r.vouchers.POST, 'POST', { type: 'CONTRA', amount: 10, from: 'BANK', to: 'CASH' })).status).toBe(201);
  });

  it('exports balanced Tally XML for the selected types and date range', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const q = (types: string, extra = '') => call(r.tally.GET, 'GET', undefined, undefined, `?from=2000-01-01&to=${today}&types=${types}${extra}`);
    expect((await call(r.tally.GET, 'GET', undefined, undefined, '?from=bad&to=bad&types=SALES')).status).toBe(400);
    expect((await q('NOPE')).status).toBe(400);

    const prev = await q('SALES,RECEIPT', '&preview=1');
    expect(prev.json.counts.Sales).toBeGreaterThanOrEqual(3);
    expect(prev.json.counts.Receipt).toBe(2);
    expect(prev.json.warnings).toEqual([]);

    const xml = await q('SALES,RECEIPT');
    expect(xml.status).toBe(200);
    expect(xml.text.startsWith('<?xml')).toBe(true);
    expect(xml.text).toContain(`<VOUCHERNUMBER>${d.invNo}</VOUCHERNUMBER>`);
    expect(xml.text).toContain('<AMOUNT>-236000.00</AMOUNT>');
    expect(xml.text).toContain('Output IGST');
    expect((xml.text.match(/<VOUCHER /g) || []).length).toBe(prev.json.total);
    asRole('SALES');
    expect((await q('SALES')).status).toBe(403);
  });

  it('customer master: GSTIN validation and derived state code', async () => {
    asAdmin();
    expect((await call(r.customers.POST, 'POST', { name: 'X', billingAddress: 'a', gstin: 'NOPE' })).status).toBe(400);
    expect((await call(r.customers.POST, 'POST', { name: 'X', billingAddress: 'a', pincode: '12' })).status).toBe(400);
    const ok = await call(r.customers.POST, 'POST', { name: 'New Buyer', billingAddress: 'Addr', gstin: '29AABCT1332L1ZZ', pincode: '560001', city: 'Bengaluru' });
    expect(ok.status).toBe(201);
    expect(ok.json.stateCode).toBe('29');
    expect(ok.json.code).toMatch(/^CUST-/);
  });
});
