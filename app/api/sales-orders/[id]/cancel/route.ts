import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import SalesOrder from '@/models/SalesOrder';
import WorkOrder from '@/models/WorkOrder';
import DeliveryChallan from '@/models/DeliveryChallan';
import Invoice from '@/models/Invoice';
import { verifyAuth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { deallocateStock } from '@/lib/allocation';
import { releaseWorkOrderReservations } from '@/lib/mrn';
import { HttpError, statusOf } from '@/lib/httpError';

const ROLES = ['ADMIN', 'MANAGER', 'SALES'];

// Cancel a draft or approved sales order that has not shipped or been invoiced. Gives back the stock reserved for it and cancels its
// planned work orders (with the material reserved for them). Work already started has to be stopped first.
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'You do not have permission to cancel sales orders.' }, { status: 403 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Sales Order not found' }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    const reason = String(body?.reason || '').trim();
    if (reason.length < 5) return NextResponse.json({ error: 'Give a reason for cancelling (at least 5 characters).' }, { status: 400 });
    await dbConnect();

    const so: any = await SalesOrder.findById(id).lean();
    if (!so) return NextResponse.json({ error: 'Sales Order not found' }, { status: 404 });
    if (!['DRAFT', 'APPROVED', 'ON_HOLD'].includes(so.status)) throw new HttpError(409, `A ${String(so.status).replace('_', ' ').toLowerCase()} sales order cannot be cancelled.`);
    if (so.approvalPending) throw new HttpError(409, 'This order is waiting for an approval decision; decide that first.');
    if (so.taxInvoiceStatus && so.taxInvoiceStatus !== 'UNINVOICED') throw new HttpError(409, 'This order has been invoiced and cannot be cancelled.');
    if (await DeliveryChallan.exists({ salesOrder: so._id, status: { $ne: 'CANCELLED' } })) throw new HttpError(409, 'Goods have already been dispatched against this order.');
    if (await Invoice.exists({ type: 'SALES', salesOrder: so._id, status: { $ne: 'CANCELLED' } })) throw new HttpError(409, 'This order has been invoiced and cannot be cancelled.');
    const started = await WorkOrder.find({ $or: [{ salesOrder: so._id }, { salesOrderRef: so.soNumber }], status: { $in: ['IN_PROGRESS', 'COMPLETED'] } }).select('woNumber status').lean();
    if (started.length) throw new HttpError(409, `Work has already started: ${(started as any[]).map(w => w.woNumber).join(', ')}. Stop it before cancelling the order.`);

    // claim the order first so two people cancelling at once do it once
    const claimed: any = await SalesOrder.findOneAndUpdate({ _id: so._id, status: { $in: ['DRAFT', 'APPROVED', 'ON_HOLD'] }, approvalPending: { $ne: true } }, { status: 'CANCELLED', allocatedBatches: [], $unset: { hold: 1 } }, { new: false });
    if (!claimed) throw new HttpError(409, 'The order was changed by someone else. Reload and try again.');

    await deallocateStock((claimed.allocatedBatches || []).map((a: any) => ({ batchId: String(a.batch), quantity: a.quantity })));
    const planned: any[] = await WorkOrder.find({ $or: [{ salesOrder: so._id }, { salesOrderRef: so.soNumber }], status: 'PLANNED' }).select('woNumber').lean();
    let released = 0;
    for (const wo of planned) {
      await WorkOrder.updateOne({ _id: wo._id, status: 'PLANNED' }, { status: 'CANCELLED' });
      released += await releaseWorkOrderReservations(wo._id);
    }

    await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'DELETE', resource: 'SALES_ORDER', resourceId: id, resourceName: so.soNumber, details: `Cancelled. Released ${(claimed.allocatedBatches || []).length} stock reservation(s); cancelled ${planned.length} planned work order(s).`, reason }).catch(() => {});
    return NextResponse.json({ soNumber: so.soNumber, status: 'CANCELLED', stockReservationsReleased: (claimed.allocatedBatches || []).length, workOrdersCancelled: planned.map(w => w.woNumber), requisitionsReleased: released });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
