import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Batch from '@/models/Batch';
import Product from '@/models/Product';
import PurchaseOrder from '@/models/PurchaseOrder';
import mongoose from 'mongoose';
import { verifyAuth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { checkPlace } from '@/lib/storageLocations';
import { HttpError, statusOf } from '@/lib/httpError';

/** Who may change where a batch is kept. */
const LOCATION_ROLES = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER', 'STAFF'];

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const product = req.nextUrl.searchParams.get('product');
    const batches = await Batch.find(product && mongoose.isValidObjectId(product) ? { product } : {})
      .populate({ path: 'product', model: Product })
      .populate({ path: 'po', model: PurchaseOrder })
      .sort({ expiryDate: 1 });
    return NextResponse.json(batches);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
}

/**
 * Stock does not appear from nowhere: batches are created by a goods receipt (GRN), by production, or by a warehouse transfer, each of which
 * leaves a document and the books behind. This route therefore no longer creates batches; it only moves a batch to another bin.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, batchId, newLocation } = await req.json();
    if (action !== 'TRANSFER_LOCATION') {
      throw new HttpError(410, 'Batches cannot be created here. Receive goods through a GRN (Goods Receipt), or book output through production.');
    }
    if (!LOCATION_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!batchId || !mongoose.isValidObjectId(String(batchId))) throw new HttpError(400, 'Choose a batch.');
    const loc = String(newLocation || '').trim();
    if (!loc) throw new HttpError(400, 'Enter the new location.');

    await dbConnect();
    const batch: any = await Batch.findById(batchId);
    if (!batch) throw new HttpError(404, 'Batch not found');
    if (batch.store === 'QUARANTINE' || batch.store === 'SCRAP') throw new HttpError(409, `A batch in ${batch.store} is placed by the GRN put-away, not moved by hand.`);

    // Stored places are written WAREHOUSE/ZONE/RACK/BIN, and the four parts are kept in step with the text
    const parts = loc.split('/').map(p => p.trim().toUpperCase());
    const set: any = {};
    if (parts.length === 4 && !(await checkPlace(parts[0], parts[1], parts[2], parts[3]))) {
      set.store = parts[0]; set.zone = parts[1]; set.rack = parts[2]; set.bin = parts[3]; set.location = parts.join('/');
    } else if (batch.zone || batch.rack || batch.bin) {
      throw new HttpError(400, 'This batch has a stored place. Enter the new one as LOCATION/ZONE/RACK/BIN, for example W1/A/R1/B1, using an active storage location and its zone, rack and bin.');
    } else {
      set.location = loc;
    }
    const updated = await Batch.findByIdAndUpdate(batchId, { $set: set }, { new: true });
    await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'EDIT', resource: 'Batch', resourceId: String(batchId), resourceName: batch.batchNumber, details: `Location changed from "${batch.location}" to "${set.location}".` });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}
