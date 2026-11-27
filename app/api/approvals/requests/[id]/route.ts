import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { ApprovalRequest } from '@/models/ApprovalMatrix';
import { verifyAuth } from '@/lib/auth';
import { applyOutcome, canAct } from '@/lib/approvals';
import { statusOf } from '@/lib/httpError';

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  let lockedId: string | null = null;
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    const { action, remarks } = await req.json();
    if (!['approve', 'reject'].includes(action)) return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
    if (action === 'reject' && !String(remarks || '').trim()) return NextResponse.json({ error: 'Rejection remarks are required.' }, { status: 400 });

    await dbConnect();
    // Claim the request so two simultaneous decisions cannot both act on it (and create the document twice)
    const request: any = await ApprovalRequest.findOneAndUpdate({ _id: id, status: 'PENDING', locked: { $ne: true } }, { locked: true }, { returnDocument: 'after' });
    if (!request) {
      const exists = await ApprovalRequest.exists({ _id: id });
      return NextResponse.json({ error: exists ? 'This request is already decided or being processed.' : 'Request not found.' }, { status: exists ? 409 : 404 });
    }
    lockedId = String(request._id);

    if (!canAct(request, user.role)) return NextResponse.json({ error: 'This request is not waiting for your role.' }, { status: 403 });
    if (request.requestedBy === user.name && user.role !== 'ADMIN') return NextResponse.json({ error: 'You cannot approve your own request.' }, { status: 403 });

    const level = request.levels[request.currentLevel];
    level.status = action === 'approve' ? 'APPROVED' : 'REJECTED';
    level.actedBy = user.name; level.actedAt = new Date(); level.remarks = remarks;
    if (action === 'reject') request.status = 'REJECTED';
    else if (request.currentLevel + 1 >= request.levels.length) request.status = 'APPROVED';
    else request.currentLevel += 1;

    // The final approval creates / releases the document first. If that fails (locked period, stock gone...),
    // the request stays pending and nothing is recorded.
    if (request.status === 'APPROVED') await applyOutcome(request);

    request.locked = false;
    await request.save();
    lockedId = null;
    if (request.status === 'REJECTED') await applyOutcome(request);
    return NextResponse.json(request);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err, 409) });
  } finally {
    if (lockedId) await ApprovalRequest.updateOne({ _id: lockedId }, { locked: false }).catch(() => {});
  }
}
