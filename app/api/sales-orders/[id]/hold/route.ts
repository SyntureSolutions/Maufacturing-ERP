import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import { statusOf } from '@/lib/httpError';
import { holdSalesOrder, releaseSalesOrder } from '@/lib/salesOrderHold';

// { action: 'hold', reason } or { action: 'release', remarks }
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Sales Order not found' }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    await dbConnect();
    if (body.action === 'hold') return NextResponse.json(await holdSalesOrder(id, body.reason, user));
    if (body.action === 'release') return NextResponse.json(await releaseSalesOrder(id, body.remarks, user));
    return NextResponse.json({ error: "Action must be 'hold' or 'release'." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
