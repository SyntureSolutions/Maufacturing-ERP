import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import { releasePayment } from '@/lib/payables';
import { statusOf } from '@/lib/httpError';

const ROLES = ['ADMIN', 'FINANCE_MANAGER'];

// Release a payment against one vendor bill. Over the approval threshold it is queued (202) and nothing is posted until approved.
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Only Finance can release supplier payments.' }, { status: 403 });
    const { id } = await context.params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send the payment details as a JSON object.' }, { status: 400 });
    await dbConnect();
    const r: any = await releasePayment(id, { requestId: body.requestId, amount: body.amount, mode: body.mode, utr: body.utr, chequeNo: body.chequeNo, date: body.date, narration: body.narration }, user);
    if (r.pending) {
      return NextResponse.json({
        message: `Sent for approval (${r.approval.levels.map((l: any) => l.role.replace(/_/g, ' ').toLowerCase()).join(' → ')}). Nothing is posted until it is approved.`,
        pendingApproval: true, approvalId: r.approval._id, amount: r.amount, billNumber: r.billNumber, duplicate: !!r.duplicate,
      }, { status: 202 });
    }
    return NextResponse.json({ voucher: r.voucher, amount: r.amount, billNumber: r.billNumber, duplicate: !!r.duplicate }, { status: r.duplicate ? 200 : 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
