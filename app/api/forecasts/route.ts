import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SalesProjection from '@/models/SalesProjection';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    return NextResponse.json(await SalesProjection.find().sort({ month: 1 }).lean());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Upsert month-wise targets: { entries: [{ product, month: 'YYYY-MM', quantity }] }
export async function PUT(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { entries } = await req.json();
    if (!Array.isArray(entries) || !entries.length) return NextResponse.json({ error: 'No entries supplied.' }, { status: 400 });
    for (const e of entries) {
      if (!e.product || !/^\d{4}-(0[1-9]|1[0-2])$/.test(e.month) || !(Number(e.quantity) >= 0)) {
        return NextResponse.json({ error: 'Each entry needs a product, a YYYY-MM month and a non-negative quantity.' }, { status: 400 });
      }
    }
    await dbConnect();
    await SalesProjection.bulkWrite(entries.map((e: any) => ({
      updateOne: { filter: { product: e.product, month: e.month }, update: { $set: { quantity: Number(e.quantity) } }, upsert: true },
    })));
    return NextResponse.json({ saved: entries.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
