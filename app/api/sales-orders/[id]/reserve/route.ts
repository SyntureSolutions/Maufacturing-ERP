import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import SalesOrder from '@/models/SalesOrder';
import { verifyAuth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { allocateUpTo, deallocateStock } from '@/lib/allocation';
import { HttpError, statusOf } from '@/lib/httpError';

const ROLES = ['ADMIN', 'MANAGER', 'SALES', 'SUPPLY_CHAIN_MANAGER'];

// Reserve stock that has arrived since the order was approved, for the part of it that could not be covered then
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'You do not have permission to reserve stock for sales orders.' }, { status: 403 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Sales Order not found' }, { status: 404 });
    await dbConnect();
    const so: any = await SalesOrder.findById(id).lean();
    if (!so) return NextResponse.json({ error: 'Sales Order not found' }, { status: 404 });
    if (!['APPROVED', 'IN_FULFILLMENT'].includes(so.status)) throw new HttpError(409, `A ${String(so.status).replace('_', ' ').toLowerCase()} sales order cannot reserve stock.`);

    // what is still unreserved and undispatched, by product: ordered - dispatched - still reserved
    const reserved = new Map<string, number>();
    for (const a of so.allocatedBatches || []) reserved.set(String(a.product), (reserved.get(String(a.product)) || 0) + (a.quantity || 0));
    const need = new Map<string, number>();
    for (const i of so.items || []) need.set(String(i.product), (need.get(String(i.product)) || 0) + Math.max(0, i.quantity - (i.dispatchedQty || 0)));

    const added: any[] = [];
    const shortfall: { product: any; quantity: number }[] = [];
    try {
      for (const [product, wanted] of need) {
        const missing = Math.round((wanted - (reserved.get(product) || 0)) * 10000) / 10000;
        if (missing <= 1e-9) continue;
        const { allocations, short } = await allocateUpTo(product, missing);
        for (const a of allocations) added.push({ batch: a.batchId, product, quantity: a.quantity });
        if (short > 1e-9) shortfall.push({ product, quantity: Math.round(short * 10000) / 10000 });
      }
      // the new reservations are added in one guarded update: the order must still be open and unchanged since it was read, so two requests at once cannot both top it up
      const ok = await SalesOrder.updateOne({ _id: so._id, status: { $in: ['APPROVED', 'IN_FULFILLMENT'] }, updatedAt: so.updatedAt }, { $push: { allocatedBatches: { $each: added } }, $set: { allocationShortfall: shortfall } });
      if (!ok.matchedCount) throw new HttpError(409, "The order was changed by someone else. Reload and try again.");
    } catch (err) {
      await deallocateStock(added.map(a => ({ batchId: String(a.batch), quantity: a.quantity }))).catch(() => {});
      throw err;
    }
    const total = added.reduce((t, a) => t + a.quantity, 0);
    await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'EDIT', resource: 'SALES_ORDER', resourceId: id, resourceName: so.soNumber, details: `Reserved ${total} more unit(s) of stock${shortfall.length ? '; some is still short' : ''}.` }).catch(() => {});
    return NextResponse.json({ soNumber: so.soNumber, reservedNow: total, stillShort: shortfall });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
