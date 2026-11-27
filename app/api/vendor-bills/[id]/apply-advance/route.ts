import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import { applyAdvance } from '@/lib/payables';
import { logAuditEvent } from '@/lib/audit';
import { statusOf } from '@/lib/httpError';

const ROLES = ['ADMIN', 'FINANCE_MANAGER'];

// Use an advance paid earlier to the same supplier to settle (part of) this bill. No new money moves, so no new journal is posted.
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Only Finance can apply supplier advances.' }, { status: 403 });
    const { id } = await context.params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send the details as a JSON object.' }, { status: 400 });
    await dbConnect();
    const r = await applyAdvance(id, String(body.voucherId || ''), body.amount, user);
    await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'EDIT', resource: 'VENDOR_BILL', resourceId: id, resourceName: r.billNumber, details: `Applied ${r.amount} of advance ${r.advanceNumber} to the bill.` }).catch(() => {});
    return NextResponse.json(r, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
