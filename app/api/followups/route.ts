import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Enquiry from '@/models/Enquiry';
import { verifyAuth } from '@/lib/auth';

// Follow-up widget data: overdue, upcoming and recent history (customer communication log) across all enquiries
export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const region = req.nextUrl.searchParams.get('region');
    const enquiries = await Enquiry.find({ 'followUps.0': { $exists: true }, ...(region ? { region } : {}) }).lean() as any[];
    const now = new Date();
    const all = enquiries.flatMap(e => e.followUps.map((f: any) => ({ ...f, enquiryId: e._id, enquiryNumber: e.enquiryNumber, customerName: e.customerName, region: e.region || 'DOMESTIC' })));
    const pending = all.filter(f => f.status === 'PENDING').sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt));
    return NextResponse.json({
      overdue: pending.filter(f => new Date(f.dueAt) < now),
      upcoming: pending.filter(f => new Date(f.dueAt) >= now),
      history: all.filter(f => f.status !== 'PENDING').sort((a, b) => +new Date(b.doneAt || b.dueAt) - +new Date(a.doneAt || a.dueAt)).slice(0, 100),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
