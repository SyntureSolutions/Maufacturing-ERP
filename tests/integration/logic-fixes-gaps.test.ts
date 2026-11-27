import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';
import * as accounting from '@/lib/accounting';

// The database can be made "unreachable" for one test (item 6 of the plan)
vi.mock('@/lib/mongodb', async () => {
  const m = (await import('mongoose')).default;
  return { default: async () => { if ((globalThis as any).__dbDown) throw new Error('connection refused'); return m; } };
});

// TEST_PLAN_LOGIC_FIXES section B: the checks that had no automated test
describe('logic review fixes: gaps in coverage (PO, GRN, stock, work orders)', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const rnd = () => Math.random().toString(36).slice(2, 8).toUpperCase();
  const gate = { gateEntryNo: 'GE-1', vendorChallanNo: 'VC-1', vehicleNo: 'MH12AB1234', checklist: { quantityVerified: true, packingIntact: true, documentsVerified: true } };
  const mkPo = (qty: number, extra: any = {}) => m.PO.create({ poNumber: `PO-G-${rnd()}`, supplier: d.sup._id, status: 'ORDERED', totalAmount: qty * 100, items: [{ product: d.prod._id, quantity: qty, receivedQuantity: 0, unitPrice: 100, totalPrice: qty * 100 }], ...extra });
  const grn = (po: any, lines: any[], role = 'ADMIN') => { role === 'ADMIN' ? asAdmin() : asRole(role); return call(r.grns.POST, 'POST', { poId: id(po), ...gate, items: lines.map(l => ({ product: id(d.prod), expiryDate: '2030-01-01', ...l })) }); };
  const createPo = (role: string, qty: number, price: number, extra: any = {}) => { asRole(role); return call(r.purchase.POST, 'POST', { supplier: id(d.sup), items: [{ product: id(d.prod), quantity: qty, unitPrice: price }], ...extra }); };
  const patchPo = (po: any, body: any, role = 'ADMIN') => { role === 'ADMIN' ? asAdmin() : asRole(role); return call(r.purchaseId.PATCH, 'PATCH', body, { id: id(po) }); };
  const mkBatch = (over: any = {}) => m.Batch.create({ batchNumber: `B-${rnd()}`, product: d.prod._id, initialQuantity: 10, currentQuantity: 10, allocatedQuantity: 0, purchasePrice: 25, expiryDate: new Date('2031-01-01'), qualityStatus: 'APPROVED', location: `WH-${rnd()}`, ...over });
  const lockInventory = async () => { asAdmin(); expect((await call(r.lock.PUT, 'PUT', { kind: 'INVENTORY', lockedUpTo: new Date(Date.now() + 86400000).toISOString().slice(0, 10) })).status).toBe(200); };
  const unlockInventory = async () => { asAdmin(); expect((await call(r.lock.PUT, 'PUT', { kind: 'INVENTORY', lockedUpTo: '2000-01-01', password: 'secret123' })).status).toBe(200); };

  beforeAll(async () => {
    await startDb();
    for (const [k, p] of Object.entries({ Product: 'Product', Supplier: 'Supplier', PO: 'PurchaseOrder', GRN: 'GRN', Batch: 'Batch', Journal: 'JournalEntry', Voucher: 'Voucher', Audit: 'AuditLog', Transfer: 'StockTransferOrder', Count: 'CycleCount', WO: 'WorkOrder', User: 'User', BOM: 'BillOfMaterials' })) {
      const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod;
    }
    m.Request = (await import('@/models/ApprovalMatrix')).ApprovalRequest;
    r.purchase = await import('@/app/api/purchase/route');
    r.purchaseId = await import('@/app/api/purchase/[id]/route');
    r.grns = await import('@/app/api/grn/route');
    r.grn = await import('@/app/api/grn/[id]/route');
    r.adjust = await import('@/app/api/inventory/adjust/route');
    r.transfers = await import('@/app/api/inventory/transfers/route');
    r.counts = await import('@/app/api/inventory/cycle-counts/route');
    r.countPost = await import('@/app/api/inventory/cycle-counts/[id]/post/route');
    r.production = await import('@/app/api/production/[id]/route');
    r.lock = await import('@/app/api/settings/period-lock/route');
    r.rules = await import('@/app/api/approvals/rules/route');
    r.requests = await import('@/app/api/approvals/requests/route');
    d.prod = await m.Product.create({ name: 'Steel Tube', sku: 'RM-GAP', category: new mongoose.Types.ObjectId(), uom: 'pcs', productType: 'RAW_MATERIAL', hsnCode: '7306', gstRate: 18 });
    d.sup = await m.Supplier.create({ name: 'Local Steel', code: 'S-GAP', gstin: '27AAPFU0939F1ZV', paymentTerms: 'NET 30' });
    await m.User.create({ _id: '65f011111111111111111100', name: 'Test Admin', email: 'a@test.com', password: 'secret123', role: 'ADMIN' });   // needed to reopen a locked period
    asAdmin();
  }, 120000);
  afterAll(stopDb);
  afterEach(() => { vi.restoreAllMocks(); (globalThis as any).__dbDown = false; });

  // ======================= Purchase orders =======================
  describe('purchase orders', () => {
    it('1. under the supply-chain limit a new PO is ordered at once; over it, it waits for approval', async () => {
      const small = await createPo('SUPPLY_CHAIN_MANAGER', 10, 100);                       // 1,000
      expect(small.status).toBe(201);
      expect(small.json).toMatchObject({ status: 'ORDERED', approvalTier: 'TIER_1_SUPPLY_CHAIN', approvalRequiredRole: 'SUPPLY_CHAIN_MANAGER', totalAmount: 1000 });
      expect(small.json.approvedBy.role).toBe('SUPPLY_CHAIN_MANAGER');
      const mid = await createPo('SUPPLY_CHAIN_MANAGER', 100, 1000);                       // 100,000: above 50,000
      expect(mid.json).toMatchObject({ status: 'PENDING_APPROVAL', approvalTier: 'TIER_2_FINANCE', approvalRequiredRole: 'FINANCE_MANAGER' });
      expect(mid.json.approvedBy).toBeUndefined();
      const big = await createPo('FINANCE_MANAGER', 1000, 1000);                          // 1,000,000: above 500,000
      expect(big.json).toMatchObject({ status: 'PENDING_APPROVAL', approvalTier: 'TIER_3_EXECUTIVE', approvalRequiredRole: 'ADMIN' });
      const exactly = await createPo('SUPPLY_CHAIN_MANAGER', 1, 50000);                    // exactly the limit is still tier 1
      expect(exactly.json.status).toBe('ORDERED');
    });

    it('2. editing the lines of a waiting PO recomputes its total and tier and clears the approval', async () => {
      const created = await createPo('FINANCE_MANAGER', 100, 1000);                        // 100,000: tier 2
      expect(created.json.approvalRequiredRole).toBe('FINANCE_MANAGER');
      await m.PO.updateOne({ _id: created.json._id }, { approvedBy: { name: 'Someone', role: 'FINANCE_MANAGER', date: new Date() } });
      const up = await patchPo(created.json, { items: [{ product: id(d.prod), quantity: 700, unitPrice: 1000 }] }, 'FINANCE_MANAGER');   // 700,000: tier 3
      expect(up.status, JSON.stringify(up.json)).toBe(200);
      expect(up.json).toMatchObject({ totalAmount: 700000, originalAmount: 700000, approvalTier: 'TIER_3_EXECUTIVE', approvalRequiredRole: 'ADMIN', status: 'PENDING_APPROVAL' });
      expect(up.json.approvedBy).toBeUndefined();
      expect(up.json.items[0]).toMatchObject({ quantity: 700, totalPrice: 700000 });
      // and back down: the tier follows the new total
      const down = await patchPo(created.json, { items: [{ product: id(d.prod), quantity: 2, unitPrice: 1000 }] }, 'FINANCE_MANAGER');
      expect(down.json).toMatchObject({ totalAmount: 2000, approvalTier: 'TIER_1_SUPPLY_CHAIN', approvalRequiredRole: 'SUPPLY_CHAIN_MANAGER', status: 'PENDING_APPROVAL' });
      // bad edits are refused and change nothing
      expect((await patchPo(created.json, { items: [{ product: id(d.prod), quantity: -1, unitPrice: 1 }] })).status).toBe(400);
      expect((await patchPo(created.json, { items: [{ product: id(d.prod), quantity: 1, unitPrice: 1 }, { product: id(d.prod), quantity: 1, unitPrice: 1 }] })).status).toBe(400);
      expect(((await m.PO.findById(created.json._id).lean()) as any).totalAmount).toBe(2000);
    });

    it('3. a PO waiting in the approval matrix cannot be released or edited by hand', async () => {
      asAdmin();
      expect((await call(r.rules.PUT, 'PUT', { module: 'PURCHASE_ORDER', rules: [{ minAmount: 1, levels: ['ADMIN'] }] })).status).toBe(200);
      const po = await mkPo(10, { status: 'DRAFT' });
      asRole('SUPPLY_CHAIN_MANAGER');
      const sent = await call(r.requests.POST, 'POST', { module: 'PURCHASE_ORDER', refId: id(po) });
      expect(sent.status, JSON.stringify(sent.json)).toBe(201);
      expect(await m.Request.countDocuments({ module: 'PURCHASE_ORDER', refId: id(po), status: 'PENDING' })).toBe(1);

      expect((await patchPo(po, { status: 'ORDERED' })).status).toBe(409);                                   // even Admin cannot bypass the inbox
      expect((await patchPo(po, { items: [{ product: id(d.prod), quantity: 1, unitPrice: 1 }] })).status).toBe(409);
      asAdmin();
      expect((await call(r.purchase.POST, 'POST', { action: 'UPDATE_STATUS', poId: id(po), newStatus: 'ORDERED' })).status).toBe(409);
      expect(((await m.PO.findById(po._id).lean()) as any).status).toBe('DRAFT');
      await call(r.rules.PUT, 'PUT', { module: 'PURCHASE_ORDER', rules: [] });
    });

    it('4. negotiation: only Admin or Finance; finalizing never lowers the approval level; not after ordering', async () => {
      const big = await createPo('FINANCE_MANAGER', 600, 1000);                             // 600,000: needs Admin
      expect(big.json.approvalRequiredRole).toBe('ADMIN');
      const act = (role: string, body: any) => { role === 'ADMIN' ? asAdmin() : asRole(role); return call(r.purchase.POST, 'POST', { poId: big.json._id, ...body }); };
      for (const role of ['SUPPLY_CHAIN_MANAGER', 'MANAGER']) {
        for (const action of ['START_NEGOTIATION', 'SUBMIT_COUNTER_OFFER', 'FINALIZE_NEGOTIATION', 'RESET_NEGOTIATION']) expect((await act(role, { action, counterAmount: 1, finalAmount: 1 })).status, `${role} ${action}`).toBe(403);
      }
      expect((await act('FINANCE_MANAGER', { action: 'START_NEGOTIATION', counterAmount: 400000 })).status).toBe(200);
      expect((await act('FINANCE_MANAGER', { action: 'SUBMIT_COUNTER_OFFER', counterAmount: -5 })).status).toBe(400);
      const fin = await act('FINANCE_MANAGER', { action: 'FINALIZE_NEGOTIATION', finalAmount: 100000, notes: 'agreed' });
      expect(fin.status, JSON.stringify(fin.json)).toBe(200);
      expect(fin.json).toMatchObject({ totalAmount: 100000, negotiationStatus: 'AGREED', savingsAmount: 500000 });
      expect(fin.json.approvalRequiredRole).toBe('ADMIN');                                  // 100,000 alone would need Finance, but it never goes down
      expect(fin.json.approvalTier).toBe('TIER_3_EXECUTIVE');
      expect((await patchPo(big.json, { status: 'ORDERED' }, 'FINANCE_MANAGER')).status).toBe(403);   // so Finance still cannot release it
      expect((await patchPo(big.json, { status: 'ORDERED' })).status).toBe(200);                      // Admin can
      expect((await act('ADMIN', { action: 'FINALIZE_NEGOTIATION', finalAmount: 1 })).status).toBe(409);   // once ordered the price is the vendor's
      expect((await act('ADMIN', { action: 'NO_SUCH_ACTION' })).status).toBe(400);
    });

    it('5. the read-only viewer is refused with the read-only message', async () => {
      asRole('VIEWER');
      const res = await call(r.purchase.POST, 'POST', { supplier: id(d.sup), items: [{ product: id(d.prod), quantity: 1, unitPrice: 1 }] });
      expect(res.status).toBe(403);
      expect(res.json.error).toContain('read-only');
      const po = await mkPo(1);
      const edit = await call(r.purchaseId.PATCH, 'PATCH', { notes: 'x' }, { id: id(po) });
      expect(edit.status).toBe(403);
    });

    it('6. listing purchase orders with the database down gives 503, not sample data; creating one saves nothing', async () => {
      asAdmin();
      (globalThis as any).__dbDown = true;
      const list = await call(r.purchase.GET, 'GET');
      expect(list.status).toBe(503);
      expect(JSON.stringify(list.json)).not.toContain('po-1');
      const before = await m.PO.countDocuments();
      const create = await call(r.purchase.POST, 'POST', { supplier: id(d.sup), items: [{ product: id(d.prod), quantity: 1, unitPrice: 1 }] });
      expect(create.status).toBe(503);
      (globalThis as any).__dbDown = false;
      expect(await m.PO.countDocuments()).toBe(before);
      expect((await call(r.purchase.GET, 'GET')).status).toBe(200);
    });
  });

  // ======================= GRN =======================
  describe('goods received', () => {
    it('7. a failure while making batches undoes the whole receipt', async () => {
      const po = await mkPo(10);
      const real = m.Batch.create.bind(m.Batch);
      let calls = 0;
      vi.spyOn(m.Batch, 'create').mockImplementation(((...a: any[]) => (++calls === 2 ? Promise.reject(new Error('disk full')) : (real as any)(...a))) as any);
      const res = await grn(po, [{ receivedQty: 3, expiryDate: '2030-01-01' }, { receivedQty: 4, expiryDate: '2031-01-01' }]);
      vi.restoreAllMocks();
      expect(res.status).toBe(500);
      expect(await m.GRN.countDocuments({ po: po._id })).toBe(0);
      expect(await m.Batch.countDocuments({ po: po._id })).toBe(0);                          // the first batch was removed again
      const p: any = await m.PO.findById(po._id).lean();
      expect(p.items[0].receivedQuantity).toBe(0);
      expect(p.status).toBe('ORDERED');
      // the same receipt works afterwards
      expect((await grn(po, [{ receivedQty: 3 }, { receivedQty: 4, expiryDate: '2031-01-01' }])).status).toBe(201);
      expect(((await m.PO.findById(po._id).lean()) as any).items[0].receivedQuantity).toBe(7);
    });

    it('8. a failure while booking an inspection puts the line, the batch and the books back', async () => {
      const po = await mkPo(10);
      const g = (await grn(po, [{ receivedQty: 10 }])).json;
      const batchBefore: any = await m.Batch.findOne({ grn: g._id }).lean();
      expect(batchBefore).toMatchObject({ currentQuantity: 10, qualityStatus: 'PENDING_QC', store: 'QUARANTINE' });
      const journals0 = await m.Journal.countDocuments();
      vi.spyOn(accounting, 'postVoucher').mockRejectedValueOnce(new Error('ledger unavailable'));
      asRole('QUALITY_INSPECTOR');
      const res = await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: 0, acceptedQty: 6, returnQty: 4 }] }, { id: g._id });
      vi.restoreAllMocks();
      expect(res.status).toBe(500);
      const after: any = await m.GRN.findById(g._id).lean();
      expect(after.items[0]).toMatchObject({ inspection: 'PENDING', acceptedQty: 0, returnQty: 0, scrapQty: 0 });
      expect(after.status).toBe('QUARANTINE');
      const batch: any = await m.Batch.findOne({ grn: g._id }).lean();
      expect(batch).toMatchObject({ currentQuantity: 10, qualityStatus: 'PENDING_QC', store: 'QUARANTINE' });
      expect(await m.Journal.countDocuments({ reference: g.number })).toBe(0);               // the receipt journal was taken back
      expect(await m.Journal.countDocuments()).toBe(journals0);
      expect(((await m.PO.findById(po._id).lean()) as any).items[0].receivedQuantity).toBe(10);
      // and the inspection can simply be done again
      const again = await call(r.grn.PATCH, 'PATCH', { action: 'inspect', items: [{ index: 0, acceptedQty: 6, returnQty: 4 }] }, { id: g._id });
      expect(again.status, JSON.stringify(again.json)).toBe(200);
      expect(await m.Journal.countDocuments({ reference: g.number, referenceType: 'GRN_RECEIPT' })).toBe(1);
    });

    it('9. the received date is set only when the PO is fully received, and not moved by later receipts', async () => {
      const po = await mkPo(10);
      expect((await grn(po, [{ receivedQty: 4 }])).status).toBe(201);
      let p: any = await m.PO.findById(po._id).lean();
      expect(p.status).toBe('PARTIALLY_RECEIVED');
      expect(p.receivedDate).toBeUndefined();
      expect((await grn(po, [{ receivedQty: 3 }])).status).toBe(201);
      p = await m.PO.findById(po._id).lean();
      expect(p.receivedDate).toBeUndefined();                                                // still partial
      expect((await grn(po, [{ receivedQty: 3 }])).status).toBe(201);
      p = await m.PO.findById(po._id).lean();
      expect(p.status).toBe('RECEIVED');
      expect(p.receivedDate).toBeTruthy();
    });

    it('10. two lines of the same product in one receipt get different batch numbers', async () => {
      const po = await mkPo(10);
      const res = await grn(po, [{ receivedQty: 3, expiryDate: '2030-01-01' }, { receivedQty: 4, expiryDate: '2031-01-01' }, { receivedQty: 2, expiryDate: '2032-01-01' }]);
      expect(res.status, JSON.stringify(res.json)).toBe(201);
      const batches: any[] = await m.Batch.find({ grn: res.json._id }).lean();
      expect(batches).toHaveLength(3);
      expect(new Set(batches.map(b => b.batchNumber)).size).toBe(3);
      expect(batches.map(b => b.batchNumber)[0]).toContain(res.json.number);
      expect(batches.every(b => b.store === 'QUARANTINE' && b.qualityStatus === 'PENDING_QC')).toBe(true);
      // each GRN line points at its own batch
      const stored: any = await m.GRN.findById(res.json._id).lean();
      expect(new Set(stored.items.map((i: any) => String(i.batch))).size).toBe(3);
    });
  });

  // ======================= Stock =======================
  describe('stock adjustments', () => {
    const adjust = (batch: any, body: any, role = 'MANAGER') => { asRole(role); return call(r.adjust.POST, 'POST', { batchId: id(batch), adjustmentQuantity: 1, reason: 'CORRECTION', type: 'DECREMENT', ...body }); };

    it('11. roles, reason, reservations, QC state, period lock and audit are all enforced', async () => {
      const batch = await mkBatch({ currentQuantity: 10, allocatedQuantity: 6 });
      for (const role of ['STAFF', 'SALES', 'FINANCE_MANAGER', 'QUALITY_INSPECTOR', 'VIEWER']) expect((await adjust(batch, {}, role)).status, role).toBe(403);
      expect((await adjust(batch, { reason: 'BECAUSE' })).status).toBe(400);
      expect((await adjust(batch, { reason: undefined })).status).toBe(400);
      expect((await adjust(batch, { type: 'SIDEWAYS' })).status).toBe(400);
      for (const q of [0, -0, 'x']) expect((await adjust(batch, { adjustmentQuantity: q })).status, String(q)).toBe(400);
      expect((await call(r.adjust.POST, 'POST', { adjustmentQuantity: 1, reason: 'DAMAGE', type: 'DECREMENT' })).status).toBe(400);     // no batch
      expect((await adjust({ _id: new mongoose.Types.ObjectId() }, {})).status).toBe(404);

      expect((await adjust(batch, { adjustmentQuantity: 5 })).status).toBe(409);                   // 10 - 5 = 5 would leave less than the 6 reserved
      expect((await adjust(batch, { adjustmentQuantity: 11 })).status).toBe(409);                  // below zero
      expect(((await m.Batch.findById(batch._id).lean()) as any).currentQuantity).toBe(10);       // nothing moved by any refusal

      const ok = await adjust(batch, { adjustmentQuantity: 4, reason: 'DAMAGE' });                 // exactly down to the reserved quantity
      expect(ok.status, JSON.stringify(ok.json)).toBe(200);
      expect(ok.json.batch.currentQuantity).toBe(6);
      const up = await adjust(batch, { type: 'INCREMENT', adjustmentQuantity: 2, reason: 'RETURN' });
      expect(up.json.batch.currentQuantity).toBe(8);
      expect(await m.Audit.countDocuments({ resourceName: batch.batchNumber, resource: 'Batch', reason: 'DAMAGE' })).toBe(1);   // reason and user are on the audit trail
      const entry: any = await m.Audit.findOne({ resourceName: batch.batchNumber, reason: 'DAMAGE' }).lean();
      expect(entry.details).toContain('10 -> 6');

      const quarantined = await mkBatch({ qualityStatus: 'PENDING_QC' });
      expect((await adjust(quarantined, { type: 'INCREMENT' })).status).toBe(409);                 // cannot add stock to a batch that has not passed QC
      expect((await adjust(quarantined, { type: 'DECREMENT' })).status).toBe(200);                 // taking stock out is fine

      await lockInventory();
      expect((await adjust(batch, { adjustmentQuantity: 1 })).status).not.toBe(200);
      await unlockInventory();
      expect(((await m.Batch.findById(batch._id).lean()) as any).currentQuantity).toBe(8);
      expect((await adjust(batch, { adjustmentQuantity: 1 })).status).toBe(200);
    });

    it('two adjustments at the same moment cannot both take the last free units', async () => {
      const batch = await mkBatch({ currentQuantity: 10, allocatedQuantity: 6 });
      const both = await Promise.all([adjust(batch, { adjustmentQuantity: 3 }), adjust(batch, { adjustmentQuantity: 3 })]);
      expect(both.map(x => x.status).sort()).toEqual([200, 409]);
      expect(((await m.Batch.findById(batch._id).lean()) as any).currentQuantity).toBe(7);
    });
  });

  describe('stock transfers', () => {
    const create = (items: any[], role = 'STAFF', extra: any = {}) => { asRole(role); return call(r.transfers.POST, 'POST', { fromWarehouse: 'W1', toWarehouse: 'W2', items, ...extra }); };
    const act = (transferId: string, action: string, extra: any = {}, role = 'STAFF') => { asRole(role); return call(r.transfers.PATCH, 'PATCH', { transferId, action, ...extra }); };
    const stockOf = async (b: any) => ((await m.Batch.findById(b._id).lean()) as any).currentQuantity;

    it('12a. who can create one, and what a transfer needs to be accepted', async () => {
      const batch = await mkBatch({ currentQuantity: 10, allocatedQuantity: 8 });
      expect((await create([{ batchId: id(batch), requestedQuantity: 1 }], 'SALES')).status).toBe(403);
      expect((await create([{ batchId: id(batch), requestedQuantity: 1 }], 'VIEWER')).status).toBe(403);
      expect((await create([{ batchId: id(batch), requestedQuantity: 1 }], 'FINANCE_MANAGER')).status).toBe(403);
      expect((await create([{ batchId: id(batch), requestedQuantity: 5 }])).status).toBe(409);       // only 2 are free (10 - 8 reserved)
      expect((await create([{ batchId: id(batch), requestedQuantity: 0 }])).status).toBe(400);
      expect((await create([{ batchId: 'nope', requestedQuantity: 1 }])).status).toBe(400);
      expect((await create([{ batchId: id(batch), requestedQuantity: 1 }, { batchId: id(batch), requestedQuantity: 1 }])).status).toBe(400);   // the same batch twice
      expect((await create([{ batchId: String(new mongoose.Types.ObjectId()), requestedQuantity: 1 }])).status).toBe(404);
      expect((await create([{ batchId: id(batch), requestedQuantity: 1 }], 'STAFF', { toWarehouse: 'W1' })).status).toBe(400);
      const quarantined = await mkBatch({ qualityStatus: 'PENDING_QC' });
      expect((await create([{ batchId: id(quarantined), requestedQuantity: 1 }])).status).toBe(409);
      const ok = await create([{ batchId: id(batch), requestedQuantity: 2 }]);
      expect(ok.status, JSON.stringify(ok.json)).toBe(201);
      expect(ok.json.transferNumber).toMatch(/^STO-\d{4}-\d{4}$/);
      expect(ok.json.items[0]).toMatchObject({ batchNumber: batch.batchNumber, unitCost: 25 });
      expect(await stockOf(batch)).toBe(10);                                                         // creating takes nothing yet
    });

    it('12b. dispatch takes the stock once; receive needs a dispatch first, cannot exceed what was sent, and records any shortage', async () => {
      const batch = await mkBatch({ currentQuantity: 10, purchasePrice: 77, expiryDate: new Date('2032-05-05'), po: new mongoose.Types.ObjectId() });
      const t = (await create([{ batchId: id(batch), requestedQuantity: 8 }])).json;
      expect((await act(t._id, 'RECEIVE')).status).toBe(409);                                        // not in transit yet
      const sent = await act(t._id, 'DISPATCH');
      expect(sent.status, JSON.stringify(sent.json)).toBe(200);
      expect(sent.json.status).toBe('DISPATCHED');
      expect(await stockOf(batch)).toBe(2);
      expect((await act(t._id, 'DISPATCH')).status).toBe(409);                                       // a second click
      expect(await stockOf(batch)).toBe(2);                                                          // deducted once
      expect((await act(t._id, 'RECEIVE', { receivedItems: [{ receivedQuantity: 9 }] })).status).toBe(400);   // more than was sent
      expect((await act(t._id, 'RECEIVE', { receivedItems: [{ receivedQuantity: -1 }] })).status).toBe(400);
      expect((await act(t._id, 'RECEIVE', { receivedItems: [{ receivedQuantity: 6 }] }, 'SALES')).status).toBe(403);
      const got = await act(t._id, 'RECEIVE', { receivedItems: [{ receivedQuantity: 6 }] });
      expect(got.status, JSON.stringify(got.json)).toBe(200);
      expect(got.json.status).toBe('RECEIVED');
      expect(got.json.items[0]).toMatchObject({ dispatchedQuantity: 8, receivedQuantity: 6, shortageQuantity: 2 });   // the shortage is kept
      expect((await act(t._id, 'RECEIVE')).status).toBe(409);                                        // received once only
      const dest: any = await m.Batch.findOne({ batchNumber: new RegExp(`^${batch.batchNumber}-T`) }).lean();
      expect(dest).toBeTruthy();
      expect(dest).toMatchObject({ currentQuantity: 6, initialQuantity: 6, allocatedQuantity: 0, purchasePrice: 77, location: 'W2', store: 'W2', qualityStatus: 'APPROVED' });
      expect(String(dest.product)).toBe(String(d.prod._id));
      expect(new Date(dest.expiryDate).toISOString().slice(0, 10)).toBe('2032-05-05');            // the real expiry, not an invented one
      expect(String(dest.po)).toBe(String(batch.po));
      expect(await m.Batch.countDocuments({ batchNumber: new RegExp(`^${batch.batchNumber}-T`) })).toBe(1);
    });

    it('12c. a dispatch that fails on its second line gives the first line\'s stock back and the transfer stays a draft', async () => {
      const a = await mkBatch({ currentQuantity: 10 }), b = await mkBatch({ currentQuantity: 10 });
      const t = (await create([{ batchId: id(a), requestedQuantity: 4 }, { batchId: id(b), requestedQuantity: 4 }])).json;
      await m.Batch.updateOne({ _id: b._id }, { currentQuantity: 2 });                              // someone used the stock after the transfer was planned
      const res = await act(t._id, 'DISPATCH');
      expect(res.status).toBe(409);
      expect(await stockOf(a)).toBe(10);                                                             // line 1 was taken and put back
      expect(await stockOf(b)).toBe(2);
      const after: any = await m.Transfer.findById(t._id).lean();
      expect(after.status).toBe('DRAFT');
      expect(after.dispatchDate).toBeUndefined();
      await m.Batch.updateOne({ _id: b._id }, { currentQuantity: 10 });
      expect((await act(t._id, 'DISPATCH')).status).toBe(200);                                       // fixed: it can now go
      expect(await stockOf(a)).toBe(6);
      expect(await stockOf(b)).toBe(6);
    });

    it('two dispatches at the same moment take the stock once', async () => {
      const batch = await mkBatch({ currentQuantity: 10 });
      const t = (await create([{ batchId: id(batch), requestedQuantity: 5 }])).json;
      const both = await Promise.all([act(t._id, 'DISPATCH'), act(t._id, 'DISPATCH')]);
      expect(both.map(x => x.status).sort()).toEqual([200, 409]);
      expect(await stockOf(batch)).toBe(5);
    });
  });

  describe('cycle counts', () => {
    const newCount = async (batches: any[], warehouse: string) => { asRole('STAFF'); const c = await call(r.counts.POST, 'POST', { warehouse }); expect(c.status, JSON.stringify(c.json)).toBe(201); return c.json; };
    const save = (countId: string, items: any[], action = 'SAVE_DRAFT', role = 'STAFF') => { asRole(role); return call(r.counts.PATCH, 'PATCH', { countId, items, action }); };
    const post = (countId: string, body: any = { action: 'APPROVE' }, role = 'MANAGER') => { asRole(role); return call(r.countPost.POST, 'POST', body, { id: countId }); };
    const stockOf = async (b: any) => ((await m.Batch.findById(b._id).lean()) as any).currentQuantity;

    it('13a. only an open count can be edited; the system quantity and cost sent by a client are ignored', async () => {
      const wh = `CC-${rnd()}`;
      const batch = await mkBatch({ location: wh, currentQuantity: 10, purchasePrice: 40 });
      const count = await newCount([batch], wh);
      expect(count.items[0]).toMatchObject({ systemQuantity: 10, unitCost: 40 });
      const saved = await save(count._id, [{ countedQuantity: 7, systemQuantity: 999, unitCost: 0.01, variance: 5000, varianceValue: 1e9 }]);
      expect(saved.status, JSON.stringify(saved.json)).toBe(200);
      expect(saved.json.items[0]).toMatchObject({ systemQuantity: 10, unitCost: 40, countedQuantity: 7, variance: -3, varianceValue: -120 });
      expect(saved.json).toMatchObject({ totalVarianceQuantity: -3, totalVarianceValue: -120, status: 'IN_PROGRESS' });
      expect((await save(count._id, [{ countedQuantity: -1 }])).status).toBe(400);
      expect((await save(count._id, [{ countedQuantity: 'abc' }])).status).toBe(400);
      expect((await save(count._id, [{ countedQuantity: 7 }], 'SAVE_DRAFT', 'SALES')).status).toBe(403);
      expect((await save(count._id, [{ countedQuantity: 7 }], 'SAVE_DRAFT', 'VIEWER')).status).toBe(403);
      const sub = await save(count._id, [{ countedQuantity: 7 }], 'SUBMIT_FOR_APPROVAL');
      expect(sub.json.status).toBe('PENDING_APPROVAL');
      expect((await save(count._id, [{ countedQuantity: 1 }])).status).toBe(409);                    // submitted: no more changes
      expect(await m.Count.countDocuments({ _id: count._id, 'items.0.countedQuantity': 7 })).toBe(1);
      expect((await save(String(new mongoose.Types.ObjectId()), [{ countedQuantity: 1 }])).status).toBe(404);
      expect((await call(r.counts.PATCH, 'PATCH', { countId: count._id })).status).toBe(400);
    });

    it('13b. posting applies the difference once, even if stock moved since the count, and the roles are enforced', async () => {
      const wh = `CC-${rnd()}`;
      const batch = await mkBatch({ location: wh, currentQuantity: 10 });
      const count = await newCount([batch], wh);
      await save(count._id, [{ countedQuantity: 8 }], 'SUBMIT_FOR_APPROVAL');                        // 2 fewer than the system said
      await m.Batch.updateOne({ _id: batch._id }, { currentQuantity: 15 });                         // 5 units arrived after the count
      for (const role of ['STAFF', 'SALES', 'VIEWER', 'QUALITY_INSPECTOR', 'FINANCE_MANAGER']) expect((await post(count._id, { action: 'APPROVE' }, role)).status, role).toBe(403);
      expect((await post(count._id, { action: 'MAYBE' })).status).toBe(400);
      const ok = await post(count._id);
      expect(ok.status, JSON.stringify(ok.json)).toBe(200);
      expect(await stockOf(batch)).toBe(13);                                                         // 15 - 2: the correction, not an overwrite with 8
      expect(ok.json.count).toMatchObject({ status: 'POSTED', approvedBy: 'Test MANAGER' });
      expect((await post(count._id)).status).toBe(409);                                              // posted twice
      expect(await stockOf(batch)).toBe(13);                                                         // changed once
      expect(await m.Audit.countDocuments({ resourceName: ok.json.count.countNumber, action: 'APPROVE' })).toBe(1);
      expect((await save(count._id, [{ countedQuantity: 1 }])).status).toBe(409);                    // and it is closed for editing
    });

    it('13c. a correction that would cut into reserved stock is refused and the count goes back to waiting', async () => {
      const wh = `CC-${rnd()}`;
      const low = await mkBatch({ location: wh, currentQuantity: 10, allocatedQuantity: 9 });
      const fine = await mkBatch({ location: wh, currentQuantity: 10 });
      const count = await newCount([low, fine], wh);
      const idx = (n: string) => count.items.findIndex((i: any) => i.batchNumber === n);
      const items: any[] = []; items[idx(low.batchNumber)] = { countedQuantity: 5 }; items[idx(fine.batchNumber)] = { countedQuantity: 12 };   // -5 on the reserved batch, +2 on the other
      await save(count._id, items, 'SUBMIT_FOR_APPROVAL');
      const res = await post(count._id);
      expect(res.status).toBe(409);
      expect(res.json.error).toContain(low.batchNumber);
      expect(await stockOf(low)).toBe(10);
      expect(await stockOf(fine)).toBe(10);                                                          // the +2 that was already applied is taken back
      expect(((await m.Count.findById(count._id).lean()) as any).status).toBe('PENDING_APPROVAL');
      await m.Batch.updateOne({ _id: low._id }, { allocatedQuantity: 0 });                           // reservation released: now it works
      expect((await post(count._id)).status).toBe(200);
      expect(await stockOf(low)).toBe(5);
      expect(await stockOf(fine)).toBe(12);
    });

    it('13d. a count can be rejected only while it is waiting; two approvals at once apply it once', async () => {
      const wh = `CC-${rnd()}`;
      const batch = await mkBatch({ location: wh, currentQuantity: 10 });
      const a = await newCount([batch], wh);
      expect((await post(a._id, { action: 'REJECT' }, 'STAFF')).status).toBe(403);
      const rej = await post(a._id, { action: 'REJECT', rejectionReason: 'recount please' });         // still in progress: may be rejected
      expect(rej.status).toBe(200);
      expect(rej.json).toMatchObject({ status: 'CANCELLED', rejectionReason: 'recount please' });
      expect((await post(a._id, { action: 'REJECT' })).status).toBe(409);                            // already cancelled
      expect((await post(a._id, { action: 'APPROVE' })).status).toBe(409);                           // a cancelled count cannot be posted
      const b = await newCount([batch], wh);
      await save(b._id, [{ countedQuantity: 6 }], 'SUBMIT_FOR_APPROVAL');
      const both = await Promise.all([post(b._id), post(b._id)]);
      expect(both.map(x => x.status).sort()).toEqual([200, 409]);
      expect(await stockOf(batch)).toBe(6);                                                          // not 2
      expect((await post(b._id, { action: 'REJECT' })).status).toBe(409);                            // a posted count cannot be rejected
      expect((await call(r.countPost.POST, 'POST', { action: 'APPROVE' }, { id: 'nope' })).status).toBe(400);
      expect((await post(String(new mongoose.Types.ObjectId()))).status).toBe(404);
    });
  });

  // ======================= Work orders =======================
  describe('work orders', () => {
    it('14. only production-side roles can change a work order\'s status', async () => {
      const bom = await m.BOM.create({ product: d.prod._id, version: '1', status: 'ACTIVE', components: [], routingSteps: [{ stepNumber: 1, description: 'Make', estimatedTimeMinutes: 5 }] });
      const wo = await m.WO.create({ woNumber: `WO-G-${rnd()}`, product: d.prod._id, bom: bom._id, quantity: 5, demandType: 'MTS', status: 'PLANNED' });
      const patch = (status: string, role: string) => { role === 'ADMIN' ? asAdmin() : asRole(role); return call(r.production.PATCH, 'PATCH', { status }, { id: id(wo) }); };
      for (const role of ['SALES', 'FINANCE_MANAGER', 'HR_MANAGER', 'SUPPLY_CHAIN_MANAGER', 'VIEWER']) expect((await patch('CANCELLED', role)).status, role).toBe(403);
      expect(((await m.WO.findById(wo._id).lean()) as any).status).toBe('PLANNED');                  // none of them changed it
      const held = await patch('ON_HOLD', 'PRODUCTION_MANAGER');
      expect(held.status, JSON.stringify(held.json)).toBe(200);
      expect(((await m.WO.findById(wo._id).lean()) as any).status).toBe('ON_HOLD');
      for (const role of ['MANAGER', 'STAFF', 'QUALITY_INSPECTOR', 'ADMIN']) expect((await patch('ON_HOLD', role)).status, role).toBe(200);
    });
  });
});
