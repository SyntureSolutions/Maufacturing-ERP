import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Batch from '@/models/Batch';
import { verifyAuth } from '@/lib/auth';
import { assertPeriodOpen } from '@/lib/accounting';
import { logAuditEvent } from '@/lib/audit';
import { HttpError, statusOf } from '@/lib/httpError';

/** Who may change a batch's quantity by hand. Staff and viewers cannot. */
const ADJUST_ROLES = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER'];
const REASONS = ['DAMAGE', 'EXPIRED', 'RETURN', 'CORRECTION'];

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ADJUST_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden: only Admin, Manager or Supply Chain can adjust stock.' }, { status: 403 });

    await dbConnect();
    await assertPeriodOpen('INVENTORY');
    const { batchId, adjustmentQuantity, reason, type } = await req.json();

    const qty = Math.abs(Number(adjustmentQuantity));
    if (!batchId || !Number.isFinite(qty) || qty <= 0) throw new HttpError(400, 'Batch and a quantity above zero are required.');
    if (!REASONS.includes(String(reason))) throw new HttpError(400, `Reason must be one of ${REASONS.join(', ')}.`);
    if (type !== 'INCREMENT' && type !== 'DECREMENT') throw new HttpError(400, 'Type must be INCREMENT or DECREMENT.');

    const batch: any = await Batch.findById(batchId);
    if (!batch) throw new HttpError(404, 'Batch not found');
    if (batch.qualityStatus && batch.qualityStatus !== 'APPROVED' && type === 'INCREMENT') {
      throw new HttpError(409, 'Stock cannot be added to a batch that has not passed QC.');
    }

    const amount = type === 'INCREMENT' ? qty : -qty;
    // One atomic write: the quantity can never go below zero or below what is already reserved, even with two people adjusting at once
    const res = await Batch.updateOne(
      { _id: batch._id, $expr: { $gte: [{ $add: ['$currentQuantity', amount] }, { $max: [0, { $ifNull: ['$allocatedQuantity', 0] }] }] } },
      { $inc: { currentQuantity: amount } },
    );
    if (!res.modifiedCount) throw new HttpError(409, 'Not enough free stock for this adjustment (some of it is reserved by orders). Resolve those orders first.');

    const after = await Batch.findById(batch._id);
    await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'EDIT', resource: 'Batch', resourceId: String(batch._id), resourceName: batch.batchNumber, details: `Stock ${type === 'INCREMENT' ? '+' : '-'}${qty} (${reason}): ${batch.currentQuantity} -> ${after?.currentQuantity}.`, reason: String(reason) });
    return NextResponse.json({ message: 'Adjustment recorded successfully', batch: after });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: statusOf(error) });
  }
}
