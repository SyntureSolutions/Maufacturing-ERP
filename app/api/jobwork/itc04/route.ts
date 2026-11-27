import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import JobWorkOrder from '@/models/JobWorkOrder';
import { verifyAuth } from '@/lib/auth';
import { heldQty, itc04Quarter, itc04Status } from '@/lib/jobwork';

// ITC-04 register: material sent to job workers, what came back, and what is still outstanding against the 1 / 3 year limit
export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const orders = await JobWorkOrder.find({ kind: 'OUTWARD' }).sort({ date: 1 }).lean() as any[];
    const now = new Date();
    const rows = orders.flatMap(o => {
      const { status, daysToDue } = itc04Status(o, now);
      return o.items.map((i: any) => ({
        challanNo: o.number, date: o.date, quarter: itc04Quarter(new Date(o.date)), jobWorker: o.partyName, gstin: o.partyGstin, goodsType: o.goodsType, natureOfJob: o.natureOfJob,
        description: i.description, hsnCode: i.hsnCode, uom: i.uom, sent: i.quantity, value: i.value, consumed: i.consumed, returned: i.returned, scrap: i.scrap, held: heldQty(i),
        dueDate: o.dueDate, daysToDue, status,
      }));
    });
    const outstanding = rows.filter(r => r.status !== 'CLOSED');
    const quarter = req.nextUrl.searchParams.get('quarter');
    return NextResponse.json({
      rows: quarter ? rows.filter(r => r.quarter === quarter) : rows,
      quarters: [...new Set(rows.map(r => r.quarter))],
      summary: { overdue: outstanding.filter(r => r.status === 'OVERDUE').length, dueSoon: outstanding.filter(r => r.status === 'DUE_SOON').length, open: outstanding.length,
        outstandingValue: Math.round(outstanding.reduce((s, r) => s + (r.sent ? (r.value * r.held) / r.sent : 0), 0) * 100) / 100 },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
