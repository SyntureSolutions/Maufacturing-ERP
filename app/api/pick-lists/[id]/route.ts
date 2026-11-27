import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import PickList from '@/models/PickList';
import SalesOrder from '@/models/SalesOrder';
import '@/models/Product';
import { verifyAuth } from '@/lib/auth';
import { canViewInvoices } from '@/lib/accessRoles';
import { logAuditEvent } from '@/lib/audit';
import { HttpError, statusOf } from '@/lib/httpError';
import { PICK_ROLES } from '@/lib/picking';

const notFound = () => NextResponse.json({ error: 'Pick list not found.' }, { status: 404 });
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewInvoices(user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return notFound();
    await dbConnect();
    const list = await PickList.findById(id).populate('lines.product', 'name sku uom').lean();
    return list ? NextResponse.json(list) : notFound();
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}

/**
 * { action: 'confirm', all: true }                                   everything was picked as planned
 * { action: 'confirm', lines: [{ lineId, pickedQty, reason? }] }     per line; a line left out is picked as planned; less than planned needs a reason
 * { action: 'cancel', reason }                                       only while nothing has been dispatched from it
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!PICK_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden: only warehouse and dispatch roles can pick.' }, { status: 403 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return notFound();
    const body = await req.json().catch(() => ({}));
    await dbConnect();
    const list: any = await PickList.findById(id).lean();
    if (!list) return notFound();

    if (body.action === 'cancel') {
      const reason = String(body.reason || '').trim();
      if (reason.length < 5) throw new HttpError(400, 'Give a reason for cancelling (at least 5 characters).');
      if (list.status === 'CANCELLED') throw new HttpError(409, `${list.number} is already cancelled.`);
      if ((list.lines || []).some((l: any) => (l.dispatchedQty || 0) > 0)) throw new HttpError(409, `${list.number} has goods that were already dispatched. Cancel the delivery challan first.`);
      const res = await PickList.updateOne({ _id: id, status: { $ne: 'CANCELLED' }, 'lines.dispatchedQty': { $not: { $gt: 0 } } }, { $set: { status: 'CANCELLED', cancelReason: reason } });
      if (!res.modifiedCount) throw new HttpError(409, 'The pick list was changed by someone else. Reload and try again.');
      await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'DELETE', resource: 'PICK_LIST', resourceId: id, resourceName: list.number, details: `Cancelled: ${reason}`, reason });
      return NextResponse.json(await PickList.findById(id).populate('lines.product', 'name sku uom').lean());
    }

    if (body.action === 'confirm') {
      if (list.status !== 'OPEN') throw new HttpError(409, `${list.number} is ${list.status.toLowerCase()}; only an open pick list can be confirmed.`);
      const so: any = await SalesOrder.findById(list.salesOrder).select('status soNumber').lean();
      if (!so || !['APPROVED', 'IN_FULFILLMENT'].includes(so.status)) throw new HttpError(409, `Sales order ${list.soNumber} is ${String(so?.status || 'missing').replace(/_/g, ' ').toLowerCase()}; its pick list cannot be confirmed.`);
      const given = new Map<string, any>();
      for (const l of Array.isArray(body.lines) ? body.lines : []) given.set(String(l?.lineId), l);
      for (const k of given.keys()) if (!list.lines.some((l: any) => String(l._id) === k)) throw new HttpError(400, 'A line in the request is not on this pick list.');

      let short = 0;
      const lines = list.lines.map((l: any) => {
        const g = body.all ? undefined : given.get(String(l._id));
        const qty = g && g.pickedQty !== undefined ? Number(g.pickedQty) : l.quantity;
        if (!Number.isFinite(qty) || qty < 0) throw new HttpError(400, `Line ${l.lineNo}: picked quantity cannot be negative.`);
        if (qty > l.quantity + 1e-9) throw new HttpError(400, `Line ${l.lineNo}: picked ${qty} but only ${l.quantity} was planned.`);
        const reason = String(g?.reason || '').trim();
        const isShort = qty < l.quantity - 1e-9;
        if (isShort && reason.length < 3) throw new HttpError(400, `Line ${l.lineNo}: say why less than ${l.quantity} was picked.`);
        if (isShort) short += 1;
        return { ...l, pickedQty: r4(qty), shortReason: isShort ? reason : undefined };
      });
      const res = await PickList.updateOne({ _id: id, status: 'OPEN' }, { $set: { status: 'PICKED', lines, pickedByName: user.name, pickedAt: new Date() } });
      if (!res.modifiedCount) throw new HttpError(409, 'The pick list was confirmed or changed by someone else. Reload and check it.');
      await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'APPROVE', resource: 'PICK_LIST', resourceId: id, resourceName: list.number, details: `Picked for ${list.soNumber}${short ? `; ${short} line(s) short` : ''}.` });
      return NextResponse.json(await PickList.findById(id).populate('lines.product', 'name sku uom').lean());
    }

    throw new HttpError(400, 'Unknown action.');
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
