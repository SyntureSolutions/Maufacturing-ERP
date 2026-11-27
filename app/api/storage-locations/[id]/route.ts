import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import { statusOf } from '@/lib/httpError';
import StorageLocation from '@/models/StorageLocation';
import Batch from '@/models/Batch';
import GRN from '@/models/GRN';
import StockTransferOrder from '@/models/StockTransferOrder';
import mongoose from 'mongoose';
import { LOCATION_WRITE_ROLES, locationFields } from '@/lib/locationInput';

// Change a location's name, plant, zones, racks or bins, or take it in or out of use. The code cannot change: batches carry it.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!LOCATION_WRITE_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const body = await req.json();
    await dbConnect();
    const loc: any = await StorageLocation.findById(id);
    if (!loc) return NextResponse.json({ error: 'Storage location not found.' }, { status: 404 });
    if (body.code !== undefined && String(body.code).trim().toUpperCase() !== loc.code) return NextResponse.json({ error: 'The location code cannot be changed.' }, { status: 400 });
    if (body.isActive === false && loc.isActive && await Batch.exists({ store: loc.code, currentQuantity: { $gt: 0 } })) {
      return NextResponse.json({ error: `${loc.code} still holds stock. Move it out before taking the location out of use.` }, { status: 409 });
    }
    Object.assign(loc, locationFields(body, true));
    if (body.isActive !== undefined) loc.isActive = Boolean(body.isActive);
    await loc.save();
    return NextResponse.json(loc);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}

// A location that stock was ever put in, or that a transfer or receipt names, is kept so those records stay readable; take it out of use instead.
// Only an entry made by mistake (never used) can be deleted.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!LOCATION_WRITE_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Storage location not found.' }, { status: 404 });
    await dbConnect();
    const loc: any = await StorageLocation.findById(id).lean();
    if (!loc) return NextResponse.json({ error: 'Storage location not found.' }, { status: 404 });
    const used = (await Batch.exists({ $or: [{ store: loc.code }, { location: new RegExp(`^${loc.code}(/|$)`) }] }))
      || (await GRN.exists({ 'items.putAway.warehouse': loc.code }))
      || (await StockTransferOrder.exists({ $or: [{ fromWarehouse: loc.code }, { toWarehouse: loc.code }] }));
    if (used) return NextResponse.json({ error: `${loc.code} has been used for stock, receipts or transfers. Take it out of use instead.` }, { status: 409 });
    await StorageLocation.deleteOne({ _id: loc._id });
    return NextResponse.json({ message: 'Storage location deleted.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
