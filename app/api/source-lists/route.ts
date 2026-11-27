import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import { statusOf } from '@/lib/httpError';
import SourceList from '@/models/SourceList';
import '@/models/Product';
import '@/models/Supplier';
import { SOURCE_LIST_ROLES, sourceListEntry } from '@/lib/sourceList';

// Source list entries, optionally for one product (?product=<id>).
export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const product = req.nextUrl.searchParams.get('product');
    if (product && !mongoose.isValidObjectId(product)) return NextResponse.json({ error: 'Invalid product.' }, { status: 400 });
    const rows = await SourceList.find(product ? { product } : {})
      .populate('product', 'name sku').populate('supplier', 'name code')
      .sort({ product: 1, validFrom: 1 }).lean();
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!SOURCE_LIST_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const body = await req.json();
    await dbConnect();
    const created = await SourceList.create({ ...(await sourceListEntry(body)), createdBy: user.name });
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
