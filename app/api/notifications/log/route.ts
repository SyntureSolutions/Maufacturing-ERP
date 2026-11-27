import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { NotificationLog } from '@/models/Notification';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const ref = req.nextUrl.searchParams.get('refNumber');
    return NextResponse.json(await NotificationLog.find(ref ? { refNumber: ref } : {}).sort({ createdAt: -1 }).limit(200).lean());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
