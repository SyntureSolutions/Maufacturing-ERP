import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import SFGStock from '@/models/SFGStock';
import WorkOrder from '@/models/WorkOrder';
import { verifyAuth } from '@/lib/auth';
import { assertPeriodOpen } from '@/lib/accounting';
import { logAuditEvent } from '@/lib/audit';

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'];
const OPEN_STATUSES = ['PLANNED', 'IN_PROGRESS'];
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const available = (s: { inQty: number; good: number; scrap: number }) => r4(s.inQty - s.good - s.scrap);

class Conflict extends Error {}

// Mongo filter: the stage at array index `idx` still has at least `qty` units waiting (inQty - good - scrap >= qty)
const waitingAtLeast = (idx: number, qty: number) => ({
  $expr: { $let: {
    vars: { s: { $arrayElemAt: ['$stages', idx] } },
    in: { $gte: [{ $subtract: [{ $subtract: ['$$s.inQty', '$$s.good'] }, '$$s.scrap'] }, qty - 1e-9] },
  } },
});

/**
 * Re-issue semi-finished units from one work order's SFG lot into another work order of the SAME product.
 * The units skip the stages they have already passed: they leave the source work order at the stage after the lot's
 * stage, and join the target work order at that same stage. The target no longer has to process them from the start.
 *
 * Every step is an atomic, guarded update, so two people re-issuing at once cannot take more units than exist,
 * and a failure part-way undoes the steps already done.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const undo: (() => Promise<unknown>)[] = [];
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await context.params;
    const body = await req.json();
    const workOrderId = String(body.workOrderId || '');
    const quantity = r4(Number(body.quantity));
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(workOrderId)) return NextResponse.json({ error: 'Invalid lot or work order.' }, { status: 400 });
    if (!(quantity > 0)) return NextResponse.json({ error: 'Enter a quantity greater than zero.' }, { status: 400 });

    await dbConnect();
    await assertPeriodOpen('INVENTORY');

    // ---- friendly pre-checks (the guarded updates below are what actually protect the data) ----
    const lot: any = await SFGStock.findById(id).lean();
    if (!lot) return NextResponse.json({ error: 'SFG lot not found.' }, { status: 404 });
    if (lot.qcStatus === 'PENDING') return NextResponse.json({ error: 'This lot is waiting for quality inspection. Approve it first.' }, { status: 409 });
    if (lot.qcStatus === 'REJECTED') return NextResponse.json({ error: 'This lot was rejected at quality inspection.' }, { status: 409 });
    if (quantity > lot.remainingQty + 1e-9) return NextResponse.json({ error: `Only ${lot.remainingQty} unit(s) remain in this lot.` }, { status: 409 });
    if (String(lot.workOrder) === workOrderId) return NextResponse.json({ error: 'Choose a different work order from the lot\'s own.' }, { status: 400 });

    const target: any = await WorkOrder.findById(workOrderId).lean();
    const source: any = await WorkOrder.findById(lot.workOrder).lean();
    if (!target || !source) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 });
    if (String(target.product) !== String(lot.product)) return NextResponse.json({ error: 'The target work order makes a different product.' }, { status: 400 });
    if (!OPEN_STATUSES.includes(target.status)) return NextResponse.json({ error: `Target work order is ${target.status}.` }, { status: 409 });
    if (!target.stages?.length) return NextResponse.json({ error: 'Configure the target work order\'s routing first.' }, { status: 409 });

    // The lot holds output of stage `seq`; the units re-enter at stage seq + 1 (array index seq)
    const nextIdx = lot.stageSeq;
    if (!target.stages[nextIdx]) return NextResponse.json({ error: 'The target routing has no stage after this lot\'s stage.' }, { status: 409 });
    if (available(target.stages[0]) < quantity - 1e-9) return NextResponse.json({ error: `The target has only ${available(target.stages[0])} unit(s) still waiting at its first stage to be replaced.` }, { status: 409 });
    if (!source.stages?.[nextIdx] || available(source.stages[nextIdx]) < quantity - 1e-9) return NextResponse.json({ error: 'Those units have already been processed at the next stage of the source work order.' }, { status: 409 });

    // ---- 1. take the units out of the lot (atomic: fails if someone else took them first) ----
    const claimed = await SFGStock.updateOne({ _id: id, remainingQty: { $gte: quantity - 1e-9 } }, { $inc: { remainingQty: -quantity } });
    if (!claimed.modifiedCount) throw new Conflict('Those units were just taken by another re-issue. Refresh and check what remains.');
    undo.push(() => SFGStock.updateOne({ _id: id }, { $inc: { remainingQty: quantity } }));

    // ---- 2. source work order gives up the units waiting at the next stage ----
    const fromSource = await WorkOrder.updateOne({ _id: source._id, ...waitingAtLeast(nextIdx, quantity) }, { $inc: { [`stages.${nextIdx}.inQty`]: -quantity } });
    if (!fromSource.modifiedCount) throw new Conflict('Those units have already been processed at the next stage of the source work order.');
    undo.push(() => WorkOrder.updateOne({ _id: source._id }, { $inc: { [`stages.${nextIdx}.inQty`]: quantity } }));

    // ---- 3. target no longer needs to process these units from the start ----
    const fromTarget = await WorkOrder.updateOne({ _id: target._id, status: { $in: OPEN_STATUSES }, ...waitingAtLeast(0, quantity) }, { $inc: { 'stages.0.inQty': -quantity } });
    if (!fromTarget.modifiedCount) throw new Conflict('The target work order changed: it no longer has enough units waiting at its first stage.');
    undo.push(() => WorkOrder.updateOne({ _id: target._id }, { $inc: { 'stages.0.inQty': quantity } }));

    // ---- 4. units join the target at the matching stage, with a trace ----
    const at = new Date();
    const into = await WorkOrder.updateOne({ _id: target._id }, {
      $inc: { [`stages.${nextIdx}.inQty`]: quantity },
      $push: { sfgReceived: { lot: lot._id, batchCode: lot.batchCode, fromWorkOrder: source.woNumber, quantity, atStage: lot.stageSeq + 1, at, by: user.name } },
    });
    if (!into.modifiedCount) throw new Conflict('Could not add the units to the target work order.');
    undo.push(() => WorkOrder.updateOne({ _id: target._id }, { $inc: { [`stages.${nextIdx}.inQty`]: -quantity }, $pop: { sfgReceived: 1 } }));

    // ---- 5. traces on the lot and on the source (the stock movement itself is already complete) ----
    await Promise.all([
      SFGStock.updateOne({ _id: id }, { $push: { reissues: { workOrder: target._id, woNumber: target.woNumber, quantity, at, by: user.name } } }),
      WorkOrder.updateOne({ _id: source._id }, { $push: { sfgIssuedOut: { lot: lot._id, batchCode: lot.batchCode, toWorkOrder: target.woNumber, quantity, atStage: lot.stageSeq + 1, at, by: user.name } } }),
    ]);

    await logAuditEvent({
      userId: user.id || user._id, userName: user.name, userRole: user.role, action: 'EDIT', resource: 'SFGStock', resourceId: id, resourceName: `SFG lot ${lot.batchCode}`,
      details: `Re-issued ${quantity} unit(s) from ${source.woNumber} to ${target.woNumber}, joining at stage ${lot.stageSeq + 1}.`,
    }).catch(() => {});

    const [freshLot, freshTarget] = await Promise.all([SFGStock.findById(id).lean(), WorkOrder.findById(target._id).select('woNumber stages sfgReceived').lean()]);
    return NextResponse.json({ lot: freshLot, target: freshTarget, source: { _id: source._id, woNumber: source.woNumber } });
  } catch (err: any) {
    // undo completed steps in reverse order so a failure leaves the books exactly as they were
    for (const fn of undo.reverse()) { try { await fn(); } catch { /* best effort */ } }
    const status = err instanceof Conflict ? 409 : /locked/.test(err.message) ? 422 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
