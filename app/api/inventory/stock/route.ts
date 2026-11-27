import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import { stockByItem } from '@/lib/stockSummary';

// GET /api/inventory/stock[?product=<id>]: stock of every item (or one), from its batches, open POs and open work orders
export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    return NextResponse.json(await stockByItem(req.nextUrl.searchParams.get('product') || undefined));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
