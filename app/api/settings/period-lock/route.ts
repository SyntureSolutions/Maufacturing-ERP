import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PeriodLock from '@/models/PeriodLock';
import User from '@/models/User';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    return NextResponse.json(await PeriodLock.find().lean());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Moving a lock forward is allowed to Finance/Admin. Moving it back (reopening a period) needs an Admin who re-enters their password.
export async function PUT(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'FINANCE_MANAGER'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { kind, lockedUpTo, password } = await req.json();
    if (!['ACCOUNTING', 'INVENTORY'].includes(kind)) return NextResponse.json({ error: 'Invalid lock type.' }, { status: 400 });
    const date = lockedUpTo ? new Date(`${lockedUpTo}T00:00:00.000Z`) : null;

    await dbConnect();
    const existing: any = await PeriodLock.findOne({ kind });
    const reopening = !date || (existing && date < new Date(existing.lockedUpTo));
    if (reopening && existing) {
      if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Only an Admin can reopen a locked period.' }, { status: 403 });
      const dbUser: any = await User.findById(user.id).select('+password');
      if (!dbUser || !password || !(await dbUser.comparePassword(String(password)))) return NextResponse.json({ error: 'Admin password is required to reopen a period.' }, { status: 403 });
    }
    if (!date) {
      await PeriodLock.deleteOne({ kind });
      return NextResponse.json({ kind, lockedUpTo: null });
    }
    if (Number.isNaN(date.getTime())) return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
    const doc = await PeriodLock.findOneAndUpdate({ kind }, { $set: { lockedUpTo: date, updatedBy: user.name } }, { upsert: true, new: true });
    return NextResponse.json(doc);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
