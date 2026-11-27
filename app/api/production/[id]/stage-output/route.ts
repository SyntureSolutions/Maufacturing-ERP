import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import WorkOrder from '@/models/WorkOrder';
import ScrapEntry from '@/models/ScrapEntry';
import SFGStock from '@/models/SFGStock';
import { verifyAuth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { HttpError, statusOf } from '@/lib/httpError';
import { postInlineScrap, undoWipPosting } from '@/lib/costing';

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'STAFF'];
const OVERRIDE_ROLES = ['ADMIN', 'MANAGER'];

// Log output of one stage: input -> good / scrap / rework. Good units flow to the next stage (or to FG for the last one).
// Material must have been issued to the work order first (otherwise the finished goods would carry no cost); a Manager/Admin can override with a written reason.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let locked = false;
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Work order not found.');
    const b = await req.json();
    const input = Number(b.input), good = Number(b.good), scrap = Number(b.scrap) || 0, rework = Number(b.rework) || 0;
    const operator = String(b.operator || '').trim();

    if (!operator) throw new HttpError(400, 'Operator is required for stage output.');
    if (![input, good, scrap, rework].every(n => Number.isFinite(n) && n >= 0) || input <= 0) throw new HttpError(400, 'Enter valid, non-negative quantities.');
    if (Math.abs(good + scrap + rework - input) > 1e-6) throw new HttpError(400, 'Good + scrap + rework must equal the input quantity.');
    if (scrap > 0 && !String(b.notes || '').trim()) throw new HttpError(400, 'Add a reason for the scrapped quantity.');

    await dbConnect();
    // one stage entry at a time per work order, so two people logging together cannot both use the same available units
    const got = await WorkOrder.findOneAndUpdate({ _id: id, outputLock: { $ne: true } }, { $set: { outputLock: true } }, { new: false });
    if (!got) {
      if (!(await WorkOrder.exists({ _id: id }))) throw new HttpError(404, 'Work order not found.');
      throw new HttpError(409, 'Another stage entry is being saved for this work order. Try again in a moment.');
    }
    locked = true;

    const wo = await WorkOrder.findById(id);
    if (!wo) throw new HttpError(404, 'Work order not found.');
    if (wo.status !== 'IN_PROGRESS') throw new HttpError(409, 'Start the work order (IN_PROGRESS) before logging stage output.');

    const stage = wo.stages?.find((s: any) => s.seq === Number(b.seq));
    if (!stage) throw new HttpError(404, 'Stage not found. Configure the routing first.');
    const available = stage.inQty - stage.good - stage.scrap;
    if (input > available + 1e-6) throw new HttpError(409, `Only ${available} unit(s) are available at ${stage.name}.`);

    // Material gate: nothing has been issued to this work order yet
    if (!((wo.materialCost || 0) > 0)) {
      const reason = String(b.overrideReason || '').trim();
      if (!(b.overrideMaterial && OVERRIDE_ROLES.includes(user.role) && reason.length >= 10)) {
        throw new HttpError(409, `No material has been issued to ${wo.woNumber}, so the output would have no cost. Issue the material requisition first, or ask a Manager/Admin to override with a written reason.`);
      }
      await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'OVERRIDE', resource: 'WorkOrder', resourceId: id, resourceName: `Work Order ${wo.woNumber}`, details: 'Logged stage output with no material issued.', reason });
    }

    const isLast = stage.seq === wo.stages!.length;
    const next = isLast ? null : wo.stages!.find((s: any) => s.seq === stage.seq + 1);
    const scrapBefore = (wo.stages || []).reduce((n: number, s: any) => n + (s.scrap || 0), 0);

    const undo: (() => Promise<any>)[] = [];
    try {
      if (scrap > 0) {
        const entry = await ScrapEntry.create({ store: isLast ? 'FG_SCRAP' : 'SFG_SCRAP', workOrder: wo._id, woNumber: wo.woNumber, stageName: stage.name, product: wo.product, quantity: scrap, reason: b.notes, operator });
        undo.push(() => ScrapEntry.deleteOne({ _id: entry._id }));
        // the material in the scrapped units is a loss now, not later
        const posted = await postInlineScrap(wo, scrap, scrapBefore, `${wo.woNumber} S${stage.seq} scrap`, user.id);
        if (posted.journal) undo.push(() => undoWipPosting(wo, posted));
      }
      if (next && good > 0) {
        // record this output as a new SFG lot
        const lotCount = await SFGStock.countDocuments({ workOrder: wo._id });
        const lot = await SFGStock.create({
          batchCode: `SFG-${wo.woNumber}-S${stage.seq}-${lotCount + 1}`, workOrder: wo._id, woNumber: wo.woNumber, product: wo.product,
          stageSeq: stage.seq, stageName: stage.name, inputQty: input, quantity: good, remainingQty: good, qcStatus: 'PENDING', conversionRatio: Math.round((good / input) * 10000) / 10000,
        });
        undo.push(() => SFGStock.deleteOne({ _id: lot._id }));
      }
      if (stage.seq > 1) {
        // this stage uses up units of the lots the previous stage made (guarded, so a lot is never taken below zero)
        let toIssue = good + scrap;
        const lots = await SFGStock.find({ workOrder: wo._id, stageSeq: stage.seq - 1, remainingQty: { $gt: 0 } }).sort({ createdAt: 1 });
        for (const lot of lots) {
          if (toIssue <= 1e-9) break;
          const take = Math.min(lot.remainingQty, toIssue);
          const res = await SFGStock.updateOne({ _id: lot._id, remainingQty: { $gte: take - 1e-9 } }, { $inc: { remainingQty: -take } });
          if (!res.modifiedCount) continue;
          undo.push(() => SFGStock.updateOne({ _id: lot._id }, { $inc: { remainingQty: take } }));
          toIssue -= take;
        }
      }

      stage.good += good; stage.scrap += scrap; stage.rework += rework;
      if (next) next.inQty += good; else wo.fgReceivedQty = (wo.fgReceivedQty || 0) + good;
      wo.stageLogs!.push({ seq: stage.seq, stageName: stage.name, input, good, scrap, rework, operator, notes: b.notes, at: new Date() } as any);
      await wo.save();
    } catch (err) {
      for (const u of undo.reverse()) await u().catch(() => {});
      throw err;
    }
    return NextResponse.json(await WorkOrder.findById(id));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  } finally {
    if (locked) await WorkOrder.updateOne({ _id: id }, { $set: { outputLock: false } });
  }
}
