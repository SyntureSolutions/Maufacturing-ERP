import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import SalesOrder from '@/models/SalesOrder';
import Product from '@/models/Product';
import { verifyAuth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { planSalesOrderEdit } from '@/lib/salesOrderEdit';
import { HttpError, statusOf } from '@/lib/httpError';
import { sanitizeForViewer } from '@/lib/pii';

const EDITORS = ['ADMIN', 'MANAGER', 'SALES'];

// One sales order with its customer and products, for the order's own page
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Sales Order not found' }, { status: 404 });
    await dbConnect();
    const so: any = await SalesOrder.findById(id)
      .populate('customer', 'name code gstin pan billingAddress city pincode stateCode country phone email contactPerson paymentTerms creditLimit')
      .populate('items.product', 'name sku uom hsnCode gstRate')
      .lean();
    if (!so) return NextResponse.json({ error: 'Sales Order not found' }, { status: 404 });
    return NextResponse.json(sanitizeForViewer(so, user.role));
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server Error' }, { status: statusOf(err) });
  }
}
const OVERRIDERS = ['ADMIN', 'MANAGER'];

// Edit a draft/approved sales order. Once a quotation is won the price and commercial terms are locked:
// quantity and delivery details stay editable, anything else needs a Manager/Admin override with a reason.
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!EDITORS.includes(user.role)) return NextResponse.json({ error: 'You do not have permission to edit sales orders.' }, { status: 403 });
    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Sales Order not found' }, { status: 404 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Send the fields to change as a JSON object.' }, { status: 400 });
    await dbConnect();

    const so: any = await SalesOrder.findById(id).lean();
    if (!so) return NextResponse.json({ error: 'Sales Order not found' }, { status: 404 });

    const reason = String(body.overrideReason || '').trim();
    const wantsOverride = reason.length > 0;
    if (wantsOverride && !OVERRIDERS.includes(user.role)) return NextResponse.json({ error: 'Only a Manager or Admin can override a locked price.' }, { status: 403 });
    if (wantsOverride && reason.length < 10) return NextResponse.json({ error: 'The override reason must explain the change (at least 10 characters).' }, { status: 400 });

    const { set, overridden } = planSalesOrderEdit(so, body, wantsOverride);

    if (set.items) {
      const ids = set.items.map((i: any) => i.product);
      if ((await Product.countDocuments({ _id: { $in: ids } })) !== ids.length) return NextResponse.json({ error: 'One of the products on the order does not exist.' }, { status: 400 });
    }

    const update: any = { $set: set };
    if (overridden.length) update.$push = { priceOverrides: { by: user.name, reason, at: new Date(), changes: overridden } };
    // the guard makes sure nothing changed state or lock since we looked
    const saved = await SalesOrder.findOneAndUpdate(
      { _id: id, status: so.status, priceLocked: !!so.priceLocked, taxInvoiceStatus: so.taxInvoiceStatus || 'UNINVOICED', updatedAt: so.updatedAt },
      update, { new: true },
    );
    if (!saved) throw new HttpError(409, 'The order was changed by someone else. Reload and try again.');

    await logAuditEvent({
      userId: user.id, userName: user.name, userRole: user.role,
      action: overridden.length ? 'OVERRIDE' : 'EDIT', resource: 'SALES_ORDER', resourceId: id, resourceName: so.soNumber,
      details: overridden.length ? `Locked terms changed (${overridden.join(', ')}). New total ${saved.totalAmount}.` : `Edited ${Object.keys(set).join(', ')}.`,
      ...(overridden.length ? { reason } : {}),
    });
    return NextResponse.json(saved);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server Error' }, { status: statusOf(err) });
  }
}
