import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Voucher from '@/models/Voucher';
import { verifyAuth } from '@/lib/auth';
import { submitVoucher } from '@/lib/voucherPosting';
import { statusOf } from '@/lib/httpError';
import { canViewFinance } from '@/lib/accessRoles';

const ROLES = ['ADMIN', 'FINANCE_MANAGER'];

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewFinance(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    await dbConnect();
    const q = req.nextUrl.searchParams;
    const filter: any = {};
    if (q.get('type')) filter.type = q.get('type');
    if (q.get('from') || q.get('to')) filter.date = { ...(q.get('from') ? { $gte: new Date(q.get('from')!) } : {}), ...(q.get('to') ? { $lte: new Date(`${q.get('to')}T23:59:59.999Z`) } : {}) };
    return NextResponse.json(await Voucher.find(filter).sort({ date: -1, createdAt: -1 }).limit(300).lean());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Only Finance can post vouchers.' }, { status: 403 });
    const b = await req.json();

    await dbConnect();
    const result = await submitVoucher(b, user);
    if (result.pending) {
      return NextResponse.json({
        message: `Sent for approval (${result.approval.levels.map((l: any) => l.role.replace(/_/g, ' ').toLowerCase()).join(' → ')}). Nothing is posted until it is approved.`,
        pendingApproval: true, approvalId: result.approval._id,
      }, { status: 202 });
    }
    return NextResponse.json(result.voucher, { status: 201 });
  } catch (err: any) {
    const msg = err.message || 'Server error';
    return NextResponse.json({ error: msg }, { status: /balanced/.test(msg) ? 422 : statusOf(err) });
  }
}
