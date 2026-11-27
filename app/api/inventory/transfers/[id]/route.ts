import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import StockTransferOrder from '@/models/StockTransferOrder';
import Batch from '@/models/Batch';
import '@/models/Product';
import { verifyAuth } from '@/lib/auth';
import { statusOf } from '@/lib/httpError';

// One stock transfer with the current state of its source batches (object page). Dispatch and receipt stay on PATCH /api/inventory/transfers.
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    await dbConnect();
    const sto: any = await StockTransferOrder.findById(id).lean();
    if (!sto) return NextResponse.json({ error: 'Transfer not found.' }, { status: 404 });
    const batches: any[] = await Batch.find({ _id: { $in: (sto.items || []).map((i: any) => i.batchId).filter(Boolean) } })
      .select('batchNumber store zone rack bin location qualityStatus currentQuantity allocatedQuantity expiryDate product')
      .populate('product', 'name sku uom').lean();
    const items = (sto.items || []).map((i: any) => ({ ...i, batch: batches.find(b => String(b._id) === String(i.batchId)) || null }));
    return NextResponse.json({ ...sto, items });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
