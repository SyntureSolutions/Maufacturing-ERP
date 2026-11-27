import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import WorkOrder from '@/models/WorkOrder';
import BillOfMaterials from '@/models/BillOfMaterials';
import Batch from '@/models/Batch';
import Product from '@/models/Product';
import { verifyAuth } from '@/lib/auth';
import { assertPeriodOpen } from '@/lib/accounting';
import { logAuditEvent } from '@/lib/audit';
import { HttpError, statusOf } from '@/lib/httpError';
import { expectedOutputs } from '@/lib/bom';

// Scrap and by-products of a work order, as its BOM lists them.
// GET:  what is expected (for what has been made so far, or the planned quantity) and, once recorded, what actually came out.
// POST: { lines: [{ product, quantity }], notes } records the actual quantities, once, for every line of the BOM (0 allowed).
//       Scrap goes to the SCRAP store; by-products go to the FG store waiting for QC. A work order whose BOM has such
//       lines cannot be completed until this is recorded. Cost is not given here (costing comes later), so batches carry 0.

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'STAFF'];
type Ctx = { params: Promise<{ id: string }> };
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Made so far (good units out of the last stage), or the planned quantity when nothing is logged yet. */
const madeQty = (wo: any) => ((wo.fgReceivedQty || 0) > 0 ? wo.fgReceivedQty : wo.quantity);

async function view(wo: any) {
  const bom: any = await BillOfMaterials.findById(wo.bom).select('outputs baseQuantity version').lean();
  const recorded = !!wo.otherOutputsRecordedAt;
  const lines: any[] = recorded ? wo.otherOutputs.map((o: any) => ({ product: String(o.product), kind: o.kind, expectedQty: o.expectedQty, actualQty: o.actualQty, batchNumber: o.batchNumber }))
    : expectedOutputs(bom || {}, madeQty(wo));
  const items: any[] = await Product.find({ _id: { $in: lines.map(l => l.product) } }).select('name sku uom').lean();
  const byId = new Map(items.map(p => [String(p._id), p]));
  return {
    basis: recorded ? undefined : madeQty(wo), basisIs: (wo.fgReceivedQty || 0) > 0 ? 'MADE' : 'PLANNED',
    recorded, recordedAt: wo.otherOutputsRecordedAt, recordedBy: wo.otherOutputsRecordedBy, notes: wo.otherOutputsNotes,
    lines: lines.map(l => ({ ...l, name: byId.get(l.product)?.name, sku: byId.get(l.product)?.sku, uom: byId.get(l.product)?.uom })),
  };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 });
    await dbConnect();
    const wo: any = await WorkOrder.findById(id).lean();
    if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 });
    return NextResponse.json(await view(wo));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  let claimed = false, id = '';
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Your role cannot record production output.' }, { status: 403 });
    id = (await ctx.params).id;
    if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Work order not found.');
    const body = await req.json();
    await dbConnect();
    await assertPeriodOpen('INVENTORY');

    const wo: any = await WorkOrder.findById(id).lean();
    if (!wo) throw new HttpError(404, 'Work order not found.');
    if (wo.status !== 'IN_PROGRESS') throw new HttpError(409, wo.status === 'PLANNED' ? 'Start the work order before recording what it gave.' : `Work order ${wo.woNumber} is ${String(wo.status).toLowerCase()}.`);
    if (wo.otherOutputsRecordedAt) throw new HttpError(409, `Scrap and by-products of ${wo.woNumber} were already recorded by ${wo.otherOutputsRecordedBy}.`);
    const bom: any = await BillOfMaterials.findById(wo.bom).select('outputs baseQuantity').lean();
    const expected = expectedOutputs(bom || {}, madeQty(wo));
    if (!expected.length) throw new HttpError(400, 'The BOM of this work order lists no scrap or by-products to record.');

    // every BOM line needs a quantity, zero included, so nothing is skipped by accident
    const given = new Map<string, number>();
    for (const l of Array.isArray(body.lines) ? body.lines : []) given.set(String(l.product), l.quantity === '' || l.quantity === null || l.quantity === undefined ? NaN : Number(l.quantity));
    const items: any[] = await Product.find({ _id: { $in: expected.map(e => e.product) } }).select('name sku uom').lean();
    const byId = new Map(items.map(p => [String(p._id), p]));
    const lines = expected.map(e => {
      const p = byId.get(e.product);
      const q = given.get(e.product);
      if (q === undefined || !Number.isFinite(q)) throw new HttpError(400, `Enter how much ${p?.name || 'of each item'} came out (0 if none).`);
      if (q < 0) throw new HttpError(400, `Quantity of ${p?.name} cannot be negative.`);
      return { ...e, actualQty: r4(q), uom: p?.uom, name: p?.name };
    });

    // claim first, so two people recording at once cannot both put the stock in
    const got = await WorkOrder.updateOne({ _id: id, status: 'IN_PROGRESS', otherOutputsRecordedAt: { $exists: false } }, { $set: { otherOutputsRecordedAt: new Date(), otherOutputsRecordedBy: user.name } });
    if (!got.modifiedCount) throw new HttpError(409, 'Someone else just recorded the scrap and by-products of this work order. Reload to see it.');
    claimed = true;

    const made: any[] = [];
    try {
      const now = new Date();
      for (const [n, l] of lines.entries()) {
        if (l.actualQty <= 0) { made.push({ ...l }); continue; }
        const scrap = l.kind === 'SCRAP';
        const batch = await Batch.create({
          product: l.product, batchNumber: `${scrap ? 'SC' : 'BP'}-${wo.woNumber}-${n + 1}`, manufacturingDate: now,
          expiryDate: new Date(now.getFullYear() + 5, now.getMonth(), now.getDate()),
          initialQuantity: l.actualQty, currentQuantity: l.actualQty, purchasePrice: 0,
          // scrap is recoverable waste: kept apart in the SCRAP store. A by-product is real stock once QC releases it.
          store: scrap ? 'SCRAP' : 'FG', location: scrap ? 'SCRAP' : 'FG', qualityStatus: scrap ? 'APPROVED' : 'PENDING_QC',
        });
        made.push({ ...l, batch: batch._id, batchNumber: batch.batchNumber });
      }
      await WorkOrder.updateOne({ _id: id }, { $set: {
        otherOutputs: made.map(l => ({ product: l.product, kind: l.kind, expectedQty: l.expectedQty, actualQty: l.actualQty, uom: l.uom, batch: l.batch, batchNumber: l.batchNumber })),
        otherOutputsNotes: String(body.notes || '').trim() || undefined,
      } });
    } catch (err) {
      await Batch.deleteMany({ _id: { $in: made.filter(l => l.batch).map(l => l.batch) } }).catch(() => {});
      throw err;
    }
    claimed = false;

    await logAuditEvent({
      userId: user.id, userName: user.name, userRole: user.role, action: 'CREATE', resource: 'WorkOrder', resourceId: id, resourceName: `Work Order ${wo.woNumber}`,
      details: `Scrap and by-products recorded: ${made.map(l => `${l.name} ${l.actualQty} ${l.uom || ''} (expected ${l.expectedQty})`).join('; ')}.`,
    });
    return NextResponse.json(await view(await WorkOrder.findById(id).lean()), { status: 201 });
  } catch (err: any) {
    if (claimed) await WorkOrder.updateOne({ _id: id }, { $unset: { otherOutputsRecordedAt: 1, otherOutputsRecordedBy: 1, otherOutputs: 1 } }).catch(() => {});
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
