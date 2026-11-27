import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import Quotation from '@/models/Quotation';
import { verifyAuth } from '@/lib/auth';
import { statusOf } from '@/lib/httpError';
import { decideDiscount, requestDiscount } from '@/lib/quotationDiscount';

// { action: 'request', percent, reason } | { action: 'approve', remarks } | { action: 'reject', remarks }
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Invalid quotation.' }, { status: 400 });
    const b = await req.json().catch(() => ({}));
    await dbConnect();
    const quote: any = await Quotation.findById(id);
    if (!quote) return NextResponse.json({ error: 'Quotation not found.' }, { status: 404 });
    if (b.action === 'request') return NextResponse.json(await requestDiscount(quote, b, user), { status: 201 });
    if (b.action === 'approve' || b.action === 'reject') return NextResponse.json(await decideDiscount(quote, b.action === 'approve', b.remarks, user));
    return NextResponse.json({ error: "Action must be 'request', 'approve' or 'reject'." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
