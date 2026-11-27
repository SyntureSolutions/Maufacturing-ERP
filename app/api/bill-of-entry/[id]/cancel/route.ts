import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import { cancelBillOfEntry } from '@/lib/billOfEntry';
import { logAuditEvent } from '@/lib/audit';
import { statusOf } from '@/lib/httpError';

const ROLES = ['ADMIN', 'FINANCE_MANAGER'];

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Only Finance can cancel a Bill of Entry.' }, { status: 403 });
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const reason = String(body?.reason || '').trim();
    if (reason.length < 5) return NextResponse.json({ error: 'Give a reason for cancelling (at least 5 characters).' }, { status: 400 });
    await dbConnect();
    const r = await cancelBillOfEntry(id, reason, user);
    await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'DELETE', resource: 'BILL_OF_ENTRY', resourceId: id, resourceName: r.number, details: 'Bill of Entry cancelled; entry reversed and goods cost restored.', reason }).catch(() => {});
    return NextResponse.json(r);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
