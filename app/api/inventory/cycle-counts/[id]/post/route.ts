import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import CycleCount from '@/models/CycleCount';
import Batch from '@/models/Batch';
import { verifyAuth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { assertPeriodOpen } from '@/lib/accounting';
import { HttpError, statusOf } from '@/lib/httpError';

/** Posting a count changes stock, so it is an approver's job: not the person who counted. */
const POST_ROLES = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER'];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!POST_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden: only Admin, Manager or Supply Chain can approve a count.' }, { status: 403 });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid cycle count id.');
    await dbConnect();

    const { action, rejectionReason } = await req.json(); // 'APPROVE' | 'REJECT'

    if (action === 'REJECT') {
      const rejected: any = await CycleCount.findOneAndUpdate(
        { _id: id, status: { $in: ['PENDING_APPROVAL', 'IN_PROGRESS'] } },
        { status: 'CANCELLED', rejectionReason: rejectionReason || 'Variance rejected by Supervisor for recount.' },
        { new: true },
      );
      if (!rejected) throw new HttpError(409, 'Only a count that is waiting for approval can be rejected.');
      await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'REJECT', resource: 'CycleCount', resourceId: id, resourceName: rejected.countNumber, details: `Rejected cycle count ${rejected.countNumber}. Reason: ${rejectionReason || 'Recount requested'}` });
      return NextResponse.json(rejected);
    }
    if (action !== 'APPROVE') throw new HttpError(400, 'Action must be APPROVE or REJECT.');

    await assertPeriodOpen('INVENTORY');
    const countDoc: any = await CycleCount.findById(id);
    if (!countDoc) throw new HttpError(404, 'Cycle count not found.');

    // Claim the count first: PENDING_APPROVAL -> POSTED once, so a repeat or double click cannot apply the variances again
    const claimed = await CycleCount.updateOne({ _id: id, status: 'PENDING_APPROVAL' }, { $set: { status: 'POSTED', approvedBy: user.name, postedAt: new Date() } });
    if (!claimed.modifiedCount) throw new HttpError(409, `Count is ${countDoc.status}; only a count waiting for approval can be posted.`);

    const undo: (() => Promise<any>)[] = [() => CycleCount.updateOne({ _id: id }, { $set: { status: 'PENDING_APPROVAL' }, $unset: { approvedBy: 1, postedAt: 1 } })];
    const adjusted: string[] = [];
    try {
      for (const item of countDoc.items) {
        if (item.countedQuantity === undefined || item.countedQuantity === null) continue;
        // Apply the counted difference, not the counted total: stock may have moved since the count was taken
        const delta = Math.round((item.countedQuantity - item.systemQuantity) * 10000) / 10000;
        if (!delta) continue;
        const res = await Batch.updateOne({ _id: item.batch, $expr: { $gte: [{ $add: ['$currentQuantity', delta] }, { $max: [0, { $ifNull: ['$allocatedQuantity', 0] }] }] } }, { $inc: { currentQuantity: delta } });
        if (!res.modifiedCount) throw new HttpError(409, `${item.batchNumber}: the correction of ${delta} would take stock below zero or below what is reserved. Recount or release the reservations first.`);
        undo.push(() => Batch.updateOne({ _id: item.batch }, { $inc: { currentQuantity: -delta } }));
        adjusted.push(`${item.batchNumber} (${delta > 0 ? '+' : ''}${delta})`);
      }
    } catch (err) {
      for (const u of undo.reverse()) await u().catch(() => {});
      throw err;
    }

    const fresh = await CycleCount.findById(id);
    await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'APPROVE', resource: 'CycleCount', resourceId: id, resourceName: countDoc.countNumber, details: `Posted ${countDoc.countNumber}. Adjusted batches: ${adjusted.join(', ') || 'none (no variance)'}. Variance value: ₹${(countDoc.totalVarianceValue || 0).toLocaleString('en-IN')}.` });
    return NextResponse.json({ message: 'Cycle count approved and posted to inventory successfully.', count: fresh });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: statusOf(error) });
  }
}
