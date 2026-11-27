import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SFGStock from '@/models/SFGStock';
import '@/models/Product';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    return NextResponse.json(await SFGStock.find().populate('product', 'name sku').sort({ createdAt: -1 }).limit(200));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
