import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import PickList from '@/models/PickList';
import SalesOrder from '@/models/SalesOrder';
import '@/models/Product';
import { verifyAuth } from '@/lib/auth';
import { canViewInvoices } from '@/lib/accessRoles';
import { logAuditEvent } from '@/lib/audit';
import { createNumbered } from '@/lib/docNumber';
import { planPickLines, PICK_ROLES } from '@/lib/picking';
import { HttpError, statusOf } from '@/lib/httpError';

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewInvoices(user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });
    await dbConnect();
    const so = req.nextUrl.searchParams.get('salesOrder');
    if (so && !mongoose.isValidObjectId(so)) return NextResponse.json([]);
    const lists = await PickList.find(so ? { salesOrder: so } : {}).populate('lines.product', 'name sku uom').sort({ createdAt: -1 }).limit(200).lean();
    return NextResponse.json(lists);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}

// Make a pick list for what a sales order still needs picked: { salesOrderId }
export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!PICK_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden: only warehouse and dispatch roles can make pick lists.' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    if (!mongoose.isValidObjectId(String(body?.salesOrderId))) throw new HttpError(400, 'Choose a sales order.');
    await dbConnect();
    const so: any = await SalesOrder.findById(body.salesOrderId).lean();
    if (!so) throw new HttpError(404, 'Sales order not found.');
    if (!['APPROVED', 'IN_FULFILLMENT'].includes(so.status)) throw new HttpError(409, `Sales order ${so.soNumber} is ${String(so.status).replace(/_/g, ' ').toLowerCase()}; only approved orders can be picked.`);

    const { lines, unplanned } = await planPickLines(so);
    if (!lines.length) {
      throw new HttpError(409, unplanned.length
        ? `There is no usable stock to pick for ${so.soNumber}. Receive or release stock first.`
        : `Everything on ${so.soNumber} is already picked, planned on an open pick list, or dispatched.`);
    }
    const created: any = await createNumbered(PickList, 'PICK', 'number', (number) => PickList.create({
      number, salesOrder: so._id, soNumber: so.soNumber, customerName: so.customerName, status: 'OPEN', createdByName: user.name,
      lines: lines.map((l, i) => ({ ...l, lineNo: (i + 1) * 10, pickedQty: 0, dispatchedQty: 0 })),
    }));
    await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'CREATE', resource: 'PICK_LIST', resourceId: String(created._id), resourceName: created.number, details: `Pick list for ${so.soNumber}: ${lines.length} line(s).` });
    return NextResponse.json({ ...created.toObject(), unplanned }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
