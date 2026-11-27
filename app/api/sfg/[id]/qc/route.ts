import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import SFGStock from '@/models/SFGStock';
import ScrapEntry from '@/models/ScrapEntry';
import WorkOrder from '@/models/WorkOrder';
import { verifyAuth } from '@/lib/auth';
import { assertPeriodOpen } from '@/lib/accounting';
import { logAuditEvent } from '@/lib/audit';

const ROLES = ['ADMIN', 'QUALITY_INSPECTOR'];

// Quality inspection of a semi-finished lot in the SFG store: what is still in the lot is approved, except any units rejected, which move to the SFG reject store.
// Body: { rejectedQty?, reason?, signature }. One decision per lot.
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Only a quality inspector can approve or reject semi-finished goods.' }, { status: 403 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'SFG lot not found.' }, { status: 404 });
    const b = await req.json().catch(() => null);
    if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Send the decision as a JSON object.' }, { status: 400 });
    const rejected = b.rejectedQty === undefined || b.rejectedQty === '' ? 0 : Number(b.rejectedQty);
    const signature = String(b.signature || '').trim(), reason = String(b.reason || '').trim();
    if (!Number.isFinite(rejected) || rejected < 0) return NextResponse.json({ error: 'Rejected quantity must be zero or more.' }, { status: 400 });
    if (!signature) return NextResponse.json({ error: 'Inspector digital signature (typed name) is required.' }, { status: 400 });
    if (rejected > 0 && !reason) return NextResponse.json({ error: 'Add a reason for the rejected units.' }, { status: 400 });

    await dbConnect();
    await assertPeriodOpen('INVENTORY');
    const lot: any = await SFGStock.findById(id).lean();
    if (!lot) return NextResponse.json({ error: 'SFG lot not found.' }, { status: 404 });
    if (lot.qcStatus !== 'PENDING') return NextResponse.json({ error: `This lot has already been ${String(lot.qcStatus).toLowerCase()}.` }, { status: 409 });
    if (lot.remainingQty <= 1e-9) return NextResponse.json({ error: 'No units of this lot are left in the store to inspect (they have gone on to the next stage).' }, { status: 409 });
    if (rejected > lot.remainingQty + 1e-9) return NextResponse.json({ error: `Only ${lot.remainingQty} unit(s) are in the store.` }, { status: 409 });

    // one decision per lot, and the units must still be there: claimed in one guarded update
    const allRejected = rejected >= lot.remainingQty - 1e-9;
    const claimed: any = await SFGStock.findOneAndUpdate(
      { _id: id, qcStatus: 'PENDING', remainingQty: { $gte: rejected - 1e-9 } },
      { qcStatus: allRejected ? 'REJECTED' : 'APPROVED', qcRejectedQty: rejected, qcBy: user.name, qcSignature: signature, qcReason: reason || undefined, qcAt: new Date(), $inc: { remainingQty: -rejected } }, { new: true });
    if (!claimed) return NextResponse.json({ error: 'The lot was just inspected or used by someone else. Reload and try again.' }, { status: 409 });
    if (rejected > 0 && claimed.stageSeq) {
      // rejected units are no longer available to the next stage of the same work order
      await WorkOrder.updateOne({ _id: lot.workOrder, 'stages.seq': claimed.stageSeq + 1 }, { $inc: { 'stages.$.inQty': -rejected } });
    }
    if (rejected > 0) await ScrapEntry.create({ store: 'SFG_REJECT', workOrder: lot.workOrder, woNumber: lot.woNumber, stageName: `${lot.stageName} (QC)`, product: lot.product, quantity: rejected, reason, operator: user.name });
    await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'APPROVE', resource: 'SFG_LOT', resourceId: id, resourceName: lot.batchCode, details: `SFG QC: ${claimed.remainingQty} approved, ${rejected} rejected.` }).catch(() => {});
    return NextResponse.json({ lot: claimed, approved: claimed.remainingQty, rejected });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
