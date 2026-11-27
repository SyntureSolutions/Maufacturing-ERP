import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Quotation from '@/models/Quotation';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const rows = await Quotation.aggregate([
      { $match: { stage: 'LOST_DECLINED' } },
      { $group: { _id: { $ifNull: ['$lossCategory', 'OTHER'] }, count: { $sum: 1 }, value: { $sum: '$totalAmount' } } },
      { $sort: { value: -1 } },
    ]);
    return NextResponse.json(rows.map(r => ({ category: r._id, count: r.count, value: r.value })));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
