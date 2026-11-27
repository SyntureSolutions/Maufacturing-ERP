import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Account from '@/models/Account';
import { verifyAuth } from '@/lib/auth';
import { canViewFinance } from '@/lib/accessRoles';
import { ACC, ensureAccount } from '@/lib/accounting';

// Chart of accounts. Standard ledgers used by the voucher engine are created on first read.
export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewFinance(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    await dbConnect();
    for (const def of Object.values(ACC)) await ensureAccount(def);
    return NextResponse.json(await Account.find({ isActive: true }).sort({ code: 1 }).lean());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
