import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import StockTransferOrder from '@/models/StockTransferOrder';
import Batch from '@/models/Batch';
import { verifyAuth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { createNumbered } from '@/lib/docNumber';
import { assertPeriodOpen } from '@/lib/accounting';
import { HttpError, statusOf } from '@/lib/httpError';
import { checkLocation } from '@/lib/storageLocations';

/** Who may move stock between storage locations. Viewers, HR, Sales and Finance cannot. */
const TRANSFER_ROLES = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER', 'STAFF'];
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    return NextResponse.json(await StockTransferOrder.find({}).sort({ createdAt: -1 }));
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!TRANSFER_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    await dbConnect();

    const { items, carrier, vehicleNumber, driverName, driverPhone, ewayBillNumber, notes, ...body } = await req.json();
    if (!body.fromWarehouse || !body.toWarehouse || !Array.isArray(items) || items.length === 0) throw new HttpError(400, 'Origin, Destination, and Items are required.');
    // Both ends are storage locations (master data), kept by code
    const fromWarehouse = String(body.fromWarehouse).trim().toUpperCase(), toWarehouse = String(body.toWarehouse).trim().toUpperCase();
    if (fromWarehouse === toWarehouse) throw new HttpError(400, 'Origin and Destination warehouses cannot be identical.');
    for (const [label, code] of [['Origin', fromWarehouse], ['Destination', toWarehouse]]) {
      const problem = await checkLocation(code);
      if (problem) throw new HttpError(400, `${label}: ${problem}`);
    }

    // Every line must be a real batch with enough free stock; the product, batch number and cost come from the batch, not the request
    const seen = new Set<string>();
    const processed: any[] = [];
    for (const [n, it] of items.entries()) {
      if (!it.batchId || !mongoose.isValidObjectId(String(it.batchId))) throw new HttpError(400, `Line ${n + 1}: choose a batch.`);
      if (seen.has(String(it.batchId))) throw new HttpError(400, `Line ${n + 1}: the batch appears twice. Combine the quantities.`);
      seen.add(String(it.batchId));
      const qty = Number(it.requestedQuantity);
      if (!Number.isFinite(qty) || qty <= 0) throw new HttpError(400, `Line ${n + 1}: quantity must be more than zero.`);
      const batch: any = await Batch.findById(it.batchId).populate('product', 'name sku');
      if (!batch) throw new HttpError(404, `Line ${n + 1}: batch not found.`);
      if (batch.store && batch.store !== fromWarehouse) throw new HttpError(409, `Line ${n + 1}: batch ${batch.batchNumber} is in ${batch.store}, not in ${fromWarehouse}.`);
      if (batch.qualityStatus && batch.qualityStatus !== 'APPROVED') throw new HttpError(409, `Line ${n + 1}: batch ${batch.batchNumber} has not passed QC.`);
      const free = (batch.currentQuantity || 0) - (batch.allocatedQuantity || 0);
      if (qty > free + 1e-9) throw new HttpError(409, `Line ${n + 1}: only ${r4(free)} of ${batch.batchNumber} is free to move.`);
      processed.push({ batchId: batch._id, batchNumber: batch.batchNumber, productName: batch.product?.name || 'Item', productSku: batch.product?.sku || '', requestedQuantity: qty, dispatchedQuantity: qty, receivedQuantity: 0, shortageQuantity: 0, unitCost: Number(batch.purchasePrice) || 0 });
    }

    const created: any = await createNumbered(StockTransferOrder, 'STO', 'transferNumber', (transferNumber) => StockTransferOrder.create({
      transferNumber, fromWarehouse, toWarehouse, status: 'DRAFT', items: processed,
      carrier: carrier || 'Internal Logistics Fleet', vehicleNumber: vehicleNumber || '', driverName: driverName || '', driverPhone: driverPhone || '',
      ewayBillNumber: ewayBillNumber || '', notes: notes || '', createdByName: user.name,
    }));
    await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'CREATE', resource: 'StockTransferOrder', resourceId: String(created._id), resourceName: created.transferNumber, details: `Created inter-warehouse transfer order ${created.transferNumber} from "${fromWarehouse}" to "${toWarehouse}".` });
    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: statusOf(error) });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!TRANSFER_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    await dbConnect();
    await assertPeriodOpen('INVENTORY');

    const { transferId, action, receivedItems, vehicleNumber, driverName, ewayBillNumber } = await req.json();
    if (!transferId || !mongoose.isValidObjectId(String(transferId)) || !action) throw new HttpError(400, 'Missing transferId or action');
    const transfer: any = await StockTransferOrder.findById(transferId);
    if (!transfer) throw new HttpError(404, 'Transfer not found');

    // DISPATCH: take the stock out of the origin batches and mark the order in transit
    if (action === 'DISPATCH') {
      // Claim DRAFT -> DISPATCHED first so a double click or a second user cannot deduct twice
      const claimed = await StockTransferOrder.updateOne({ _id: transfer._id, status: 'DRAFT' }, { $set: { status: 'DISPATCHED', dispatchDate: new Date() } });
      if (!claimed.modifiedCount) throw new HttpError(409, `Transfer is ${transfer.status}; only a DRAFT transfer can be dispatched.`);
      const undo: (() => Promise<any>)[] = [() => StockTransferOrder.updateOne({ _id: transfer._id }, { $set: { status: 'DRAFT' }, $unset: { dispatchDate: 1 } })];
      try {
        for (const item of transfer.items) {
          const qty = item.dispatchedQuantity;
          const taken = await Batch.updateOne({ _id: item.batchId, $expr: { $gte: [{ $subtract: ['$currentQuantity', { $ifNull: ['$allocatedQuantity', 0] }] }, qty - 1e-9] } }, { $inc: { currentQuantity: -qty } });
          if (!taken.modifiedCount) throw new HttpError(409, `${item.batchNumber}: not enough free stock any more (it may have been used or reserved).`);
          undo.push(() => Batch.updateOne({ _id: item.batchId }, { $inc: { currentQuantity: qty } }));
        }
        const set: any = {};
        if (vehicleNumber) set.vehicleNumber = vehicleNumber;
        if (driverName) set.driverName = driverName;
        if (ewayBillNumber) set.ewayBillNumber = ewayBillNumber;
        if (Object.keys(set).length) await StockTransferOrder.updateOne({ _id: transfer._id }, { $set: set });
      } catch (err) {
        for (const u of undo.reverse()) await u().catch(() => {});
        throw err;
      }
      const fresh: any = await StockTransferOrder.findById(transfer._id);
      await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'EDIT', resource: 'StockTransferOrder', resourceId: String(fresh._id), resourceName: fresh.transferNumber, details: `Dispatched ${fresh.transferNumber}. Stock deducted from ${fresh.fromWarehouse} and placed in transit.` });
      return NextResponse.json(fresh);
    }

    // RECEIVE: only an in-transit transfer, and no more than was sent; any shortage is recorded
    if (action === 'RECEIVE') {
      const lines = transfer.items.map((it: any, i: number) => {
        const given = Array.isArray(receivedItems) && receivedItems[i]?.receivedQuantity !== undefined ? Number(receivedItems[i].receivedQuantity) : it.dispatchedQuantity;
        if (!Number.isFinite(given) || given < 0) throw new HttpError(400, `Line ${i + 1}: received quantity cannot be negative.`);
        if (given > it.dispatchedQuantity + 1e-9) throw new HttpError(400, `Line ${i + 1}: received ${given} but only ${it.dispatchedQuantity} was sent.`);
        return { it, received: given, shortage: r4(it.dispatchedQuantity - given) };
      });
      const claimed = await StockTransferOrder.updateOne({ _id: transfer._id, status: 'DISPATCHED' }, { $set: { status: 'RECEIVED', deliveryDate: new Date(), receivedByName: user.name } });
      if (!claimed.modifiedCount) throw new HttpError(409, `Transfer is ${transfer.status}; only a DISPATCHED transfer can be received.`);
      const undo: (() => Promise<any>)[] = [() => StockTransferOrder.updateOne({ _id: transfer._id }, { $set: { status: 'DISPATCHED' }, $unset: { deliveryDate: 1, receivedByName: 1 } })];
      try {
        for (const { it, received } of lines) {
          if (received <= 0) continue;
          const src: any = await Batch.findById(it.batchId).lean();
          if (!src) throw new HttpError(409, `${it.batchNumber}: the source batch no longer exists.`);
          // The goods keep their product, expiry, cost and QC state; only the place changes
          const dest = await Batch.create({
            batchNumber: `${it.batchNumber}-T${String(new mongoose.Types.ObjectId()).slice(-5).toUpperCase()}`,
            product: src.product, initialQuantity: received, currentQuantity: received, allocatedQuantity: 0,
            purchasePrice: src.purchasePrice, expiryDate: src.expiryDate, po: src.po, grn: src.grn,
            location: transfer.toWarehouse, store: transfer.toWarehouse, qualityStatus: src.qualityStatus || 'APPROVED',
          });
          undo.push(() => Batch.deleteOne({ _id: (dest as any)._id }));
        }
        transfer.items = transfer.items.map((it: any, i: number) => ({ ...it.toObject(), receivedQuantity: lines[i].received, shortageQuantity: lines[i].shortage }));
        await StockTransferOrder.updateOne({ _id: transfer._id }, { $set: { items: transfer.items } });
      } catch (err) {
        for (const u of undo.reverse()) await u().catch(() => {});
        throw err;
      }
      const totalShortage = r4(lines.reduce((s: number, l: any) => s + l.shortage, 0));
      const fresh: any = await StockTransferOrder.findById(transfer._id);
      await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'APPROVE', resource: 'StockTransferOrder', resourceId: String(fresh._id), resourceName: fresh.transferNumber, details: `Received ${fresh.transferNumber} at "${fresh.toWarehouse}". Transit shortage: ${totalShortage} units.` });
      return NextResponse.json(fresh);
    }

    throw new HttpError(400, 'Invalid action');
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: statusOf(error) });
  }
}
