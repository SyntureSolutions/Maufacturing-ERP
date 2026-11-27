import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Batch from '@/models/Batch';
import '@/models/Product';
import { verifyAuth } from '@/lib/auth';

// Finished sub-assemblies held in the SFG store: ready to be reserved by the parent assembly's material requisition
export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const batches = await Batch.find({ store: 'SFG', currentQuantity: { $gt: 0 } }).populate('product', 'name sku').sort({ createdAt: -1 }).limit(200).lean() as any[];
    return NextResponse.json(batches.map(b => ({ ...b, available: Math.round((b.currentQuantity - (b.allocatedQuantity || 0)) * 10000) / 10000 })));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
