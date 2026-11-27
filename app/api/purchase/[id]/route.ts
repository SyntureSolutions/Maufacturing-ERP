import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { verifyAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import PurchaseOrder from '@/models/PurchaseOrder';
import PurchaseIndent from '@/models/PurchaseIndent';
import Supplier from '@/models/Supplier';
import Product from '@/models/Product';
import ApprovalThreshold from '@/models/ApprovalThreshold';
import { ApprovalRequest } from '@/models/ApprovalMatrix';
import { memoryThresholds } from '@/app/api/settings/approval-thresholds/route';
import { getSession } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { HttpError, statusOf } from '@/lib/httpError';
import { checkPoLineSources } from '@/lib/indentLines';
import { assertSupplierAllowed } from '@/lib/sourceList';
import { chargesTotal } from '@/lib/docCharges';
import { PO_CREATE_ROLES, assertManualTransition, calculatePOTier, canApprovePO, requiredRoleFor, validatePOInput, applyOrderUnits } from '@/lib/purchaseOrderRules';
import { assertItemsActive } from '@/lib/itemRules';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await dbConnect();
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const po = await PurchaseOrder.findById(id)
      .populate('supplier')
      .populate('items.product')
      .populate({ path: 'items.sources.indent', select: 'number status', model: PurchaseIndent });
    if (!po) return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 });

    return NextResponse.json(po);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Edit a purchase order. What can change depends on where it is:
 *  - lines, supplier, delivery date: only while it is DRAFT or PENDING_APPROVAL; the total and approval level are then worked out again on the server
 *  - notes: any time before it is closed
 *  - status: only through the allowed moves (approve with the right role, or cancel when nothing has been received or billed)
 * Negotiated prices go through the negotiation actions on POST /api/purchase, not here.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const session = await getSession();
    const user = session?.user;
    if (!user || !PO_CREATE_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid purchase order id.');

    const body = await req.json();
    const po = await PurchaseOrder.findById(id);
    if (!po) return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 });

    if (body.status === 'RECEIVED' || body.status === 'PARTIALLY_RECEIVED') {
      return NextResponse.json({ error: 'Receive goods through a GRN (Purchase > Goods Receipts) so stock passes the quarantine and QC gate.' }, { status: 409 });
    }

    const thresholds: any = (await ApprovalThreshold.findOne().sort({ updatedAt: -1 })) || memoryThresholds;
    const changes: string[] = [];

    // Lines / supplier / dates
    const editsContent = body.items !== undefined || body.supplier !== undefined || body.expectedDeliveryDate !== undefined;
    if (editsContent) {
      if (!['DRAFT', 'PENDING_APPROVAL'].includes(po.status)) {
        throw new HttpError(409, `A PO that is ${po.status} can no longer be edited. Cancel it and raise a new one if it is wrong.`);
      }
      const pending = await ApprovalRequest.findOne({ module: 'PURCHASE_ORDER', refId: String(po._id), status: 'PENDING' }).select('_id').lean();
      if (pending) throw new HttpError(409, 'This PO is waiting in the approval matrix and cannot be edited until it is decided.');

      if (body.items !== undefined || body.supplier !== undefined) {
        // lines left as they were keep the unit they were ordered in
        const rawItems = body.items ?? po.items.map((i: any) => ({ product: String(i.product), quantity: i.orderFactor ? i.quantity / i.orderFactor : i.quantity, unitPrice: (i.listPrice ?? i.unitPrice) * (i.orderFactor || 1), discountPercent: i.discountPercent, unit: i.orderUnit, lineNo: i.lineNo, deliveryDate: i.deliveryDate, sources: i.sources }));
        const { supplier, items, charges } = validatePOInput({ supplier: body.supplier ?? String((po.supplier as any)?._id || po.supplier), items: rawItems, charges: body.charges ?? po.charges });
        if (!(await Supplier.exists({ _id: supplier }))) throw new HttpError(400, 'That supplier does not exist.');
        if ((await Product.countDocuments({ _id: { $in: items.map(i => i.product) } })) !== items.length) throw new HttpError(400, 'One or more products do not exist.');
        const totalAmount = Math.round((await applyOrderUnits(items, rawItems) + chargesTotal(charges)) * 100) / 100;
        await assertItemsActive(items.map(i => i.product), 'purchase order', po.items.map((i: any) => i.product)); // lines already on the PO may stay
        await assertSupplierAllowed(items.map(i => i.product), supplier);
        const sources = await checkPoLineSources(items, po._id); // this PO's own earlier quantities do not count against it
        items.forEach((item, n) => { item.sources = sources[n]; });
        const tier = calculatePOTier(totalAmount, thresholds);
        po.supplier = supplier as any;
        po.items = items.map(i => ({ ...i, receivedQuantity: 0, negotiatedUnitPrice: i.unitPrice, negotiatedTotalPrice: i.totalPrice, originalUnitPrice: i.unitPrice })) as any;
        po.charges = charges as any;
        po.totalAmount = totalAmount;
        po.originalAmount = totalAmount;
        po.negotiationStatus = 'NONE';
        po.negotiatedAmount = undefined;
        po.savingsAmount = 0;
        po.savingsPercentage = 0;
        po.approvalTier = tier.tier;
        po.approvalRequiredRole = tier.requiredRole;
        po.status = 'PENDING_APPROVAL'; // an edited PO needs signing off again at its new value
        po.approvedBy = undefined;
        changes.push('lines');
      }
      if (body.expectedDeliveryDate !== undefined) {
        po.expectedDeliveryDate = body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : undefined;
        changes.push('delivery date');
      }
    }

    if (body.notes !== undefined) {
      if (['RECEIVED', 'CANCELLED'].includes(po.status)) throw new HttpError(409, `A PO that is ${po.status} is closed.`);
      po.notes = body.notes;
      changes.push('notes');
    }

    // Status
    if (body.status && body.status !== po.status) {
      assertManualTransition(po, String(body.status));
      if (body.status === 'ORDERED') {
        const required = requiredRoleFor(po, thresholds);
        if (!canApprovePO(user.role, required)) throw new HttpError(403, `Authorization Denied: this PO needs ${required.replace('_', ' ').toLowerCase()} sign-off.`);
        const pending = await ApprovalRequest.findOne({ module: 'PURCHASE_ORDER', refId: String(po._id), status: 'PENDING' }).select('_id').lean();
        if (pending) throw new HttpError(409, 'This PO is waiting in the approval matrix. Decide it from the Approvals inbox.');
        po.approvedBy = { name: user.name || 'Manager', role: user.role, date: new Date() } as any;
      }
      po.status = body.status;
      changes.push(`status → ${body.status}`);
    }

    if (!changes.length) return NextResponse.json(po);
    await po.save();
    await logAuditEvent({ userId: user.id || (user as any)._id, userName: user.name, userRole: user.role, action: 'EDIT', resource: 'PurchaseOrder', resourceId: id, resourceName: `PO #${po.poNumber}`, details: `Edited: ${changes.join(', ')}.` });
    return NextResponse.json(po);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}
