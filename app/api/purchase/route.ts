import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import PurchaseOrder from '@/models/PurchaseOrder';
import Supplier from '@/models/Supplier';
import Product from '@/models/Product';
import ApprovalThreshold from '@/models/ApprovalThreshold';
import { ApprovalRequest } from '@/models/ApprovalMatrix';
import { memoryThresholds } from '@/app/api/settings/approval-thresholds/route';
import { verifyAuth } from '@/lib/auth';
import { canViewFinance } from '@/lib/accessRoles';
import { purchasePaymentStatus } from '@/lib/payables';
import { sanitizeListForViewer } from '@/lib/pii';
import { logAuditEvent } from '@/lib/audit';
import { createNumbered } from '@/lib/docNumber';
import { HttpError, statusOf } from '@/lib/httpError';
import { checkPoLineSources } from '@/lib/indentLines';
import { assertSupplierAllowed } from '@/lib/sourceList';
import { assertItemsActive } from '@/lib/itemRules';
import { chargesTotal } from '@/lib/docCharges';
import {
  PO_CREATE_ROLES, PO_NEGOTIATE_ROLES, calculatePOTier, canApprovePO, requiredRoleFor,
  assertManualTransition, validatePOInput, applyOrderUnits,
} from '@/lib/purchaseOrderRules';

export { calculatePOTier };

// The approval limits come from the database; the built-in defaults are used only when none have been saved yet.
async function getActiveThresholds() {
  const doc = await ApprovalThreshold.findOne().sort({ updatedAt: -1 });
  return doc || memoryThresholds;
}

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
      await dbConnect();
    } catch (dbErr) {
      console.error('Purchase orders: database unavailable', dbErr);
      return NextResponse.json({ error: 'The database is not reachable. Try again in a moment.' }, { status: 503 });
    }
    const pos = await PurchaseOrder.find({})
      .populate('supplier')
      .populate('items.product')
      .sort({ createdAt: -1 })
      .lean();
    // where each order stands on payment, for people who may see finance data
    if (canViewFinance(user.role) && pos.length) {
      const status = await purchasePaymentStatus(pos.map((p: any) => p._id));
      for (const po of pos as any[]) {
        const st = status.get(String(po._id));
        po.payment = user.role === 'VIEWER' && st ? { status: st.status } : st; // the read-only viewer sees the status, not the amounts
      }
    }
    return NextResponse.json(user.role === 'VIEWER' ? sanitizeListForViewer(pos, user.role) : pos);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Checks the person may sign this PO off at its current value, and that nobody else is deciding it in the approval matrix. */
async function assertMayRelease(po: any, user: any, thresholds: any) {
  const required = requiredRoleFor(po, thresholds);
  if (!canApprovePO(user.role, required)) {
    const amt = Number(po.totalAmount || 0).toLocaleString('en-IN');
    if (required === 'ADMIN') {
      throw new HttpError(403, `Authorization Denied: This PO (₹${amt}) exceeds the Finance Manager limit (₹${(thresholds.poFinanceLimit || 500000).toLocaleString('en-IN')}) and requires Super Admin Executive approval.`);
    }
    if (required === 'FINANCE_MANAGER') {
      throw new HttpError(403, `Authorization Denied: This PO (₹${amt}) exceeds the Supply Chain approval limit (₹${(thresholds.poSupplyChainLimit || 50000).toLocaleString('en-IN')}) and requires Finance Manager (CFO) sign-off.`);
    }
    throw new HttpError(403, 'Authorization Denied: your role cannot approve purchase orders.');
  }
  const pending = await ApprovalRequest.findOne({ module: 'PURCHASE_ORDER', refId: String(po._id), status: 'PENDING' }).select('_id').lean();
  if (pending) throw new HttpError(409, 'This PO is waiting in the approval matrix. Decide it from the Approvals inbox.');
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Executive Viewer is strictly read-only
    if (user.role === 'VIEWER') {
      return NextResponse.json(
        { error: 'Forbidden: Executive Viewer has read-only access and cannot create or modify purchase orders.' },
        { status: 403 }
      );
    }
    if (!PO_CREATE_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden: your role cannot raise or change purchase orders.' }, { status: 403 });
    }

    const body = await req.json();
    try {
      await dbConnect();
    } catch (dbErr) {
      console.error('Purchase orders: database unavailable', dbErr);
      return NextResponse.json({ error: 'The database is not reachable. Nothing was saved. Try again in a moment.' }, { status: 503 });
    }
    const thresholds = await getActiveThresholds();
    const who = { userId: user.id || user._id, userName: user.name, userRole: user.role };

    // 1. Approve / cancel a PO
    if (body.action === 'UPDATE_STATUS') {
      const { poId, newStatus } = body;
      if (!poId || !mongoose.isValidObjectId(String(poId))) throw new HttpError(400, 'Choose a purchase order.');
      const po = await PurchaseOrder.findById(poId);
      if (!po) throw new HttpError(404, 'Purchase Order not found.');
      assertManualTransition(po, String(newStatus));
      if (newStatus === 'ORDERED') await assertMayRelease(po, user, thresholds);

      const set: any = { status: newStatus };
      if (newStatus === 'ORDERED') set.approvedBy = { name: user.name || 'Manager', role: user.role, date: new Date() };
      // Only the status we read may be changed: if someone moved the PO meanwhile, this does nothing
      const updated = await PurchaseOrder.findOneAndUpdate({ _id: poId, status: po.status }, { $set: set }, { new: true });
      if (!updated) throw new HttpError(409, 'The PO changed while you were working. Reload and try again.');
      await logAuditEvent({
        ...who,
        action: newStatus === 'ORDERED' ? 'APPROVE' : 'EDIT',
        resource: 'PurchaseOrder',
        resourceId: poId,
        resourceName: `PO #${updated.poNumber || poId}`,
        details: `Purchase Order status updated from '${po.status}' to '${newStatus}'.`,
      });
      return NextResponse.json(updated);
    }

    // 2. Finance negotiation. Only while the PO is still waiting for approval; once ordered the price is the vendor's.
    if (['START_NEGOTIATION', 'SUBMIT_COUNTER_OFFER', 'FINALIZE_NEGOTIATION', 'RESET_NEGOTIATION'].includes(body.action)) {
      if (!PO_NEGOTIATE_ROLES.includes(user.role)) {
        return NextResponse.json({ error: 'Forbidden: only the Finance Manager or Admin can negotiate purchase order prices.' }, { status: 403 });
      }
      const { poId } = body;
      if (!poId || !mongoose.isValidObjectId(String(poId))) throw new HttpError(400, 'Choose a purchase order.');
      const po = await PurchaseOrder.findById(poId);
      if (!po) throw new HttpError(404, 'Purchase Order not found.');
      if (!['DRAFT', 'PENDING_APPROVAL'].includes(po.status)) {
        throw new HttpError(409, `Prices can only be negotiated before the PO is ordered (this PO is ${po.status}).`);
      }
      const userName = user.name || 'Finance Manager (CFO)';
      const num = (v: any, label: string) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${label} must be a number, zero or more.`);
        return n;
      };

      if (body.action === 'RESET_NEGOTIATION') {
        if (po.originalAmount) po.totalAmount = po.originalAmount;
        po.items.forEach((it: any) => {
          if (it.originalUnitPrice !== undefined) it.unitPrice = it.originalUnitPrice;
          it.totalPrice = Math.round(it.quantity * it.unitPrice * 100) / 100;
        });
        po.negotiationStatus = 'NONE';
        po.negotiatedAmount = undefined;
        po.savingsAmount = 0;
        po.savingsPercentage = 0;
        po.negotiationNotes = undefined;
        await po.save();
        return NextResponse.json(po);
      }

      if (body.action === 'FINALIZE_NEGOTIATION') {
        const originalAmt = po.originalAmount || po.totalAmount;
        let finalAmount = num(body.finalAmount, 'Final amount');
        if (Array.isArray(body.finalItems)) {
          po.items.forEach((it: any, idx: number) => {
            const f = body.finalItems[idx];
            if (!f) return;
            const price = f.negotiatedUnitPrice !== undefined && f.negotiatedUnitPrice !== null ? num(f.negotiatedUnitPrice, `Line ${idx + 1} price`) : it.unitPrice;
            it.unitPrice = price;
            it.totalPrice = Math.round(it.quantity * price * 100) / 100;
            it.negotiatedUnitPrice = price;
            it.negotiatedTotalPrice = it.totalPrice;
          });
          finalAmount = Math.round((po.items.reduce((s: number, i: any) => s + i.totalPrice, 0) + chargesTotal(po.charges)) * 100) / 100; // the total always follows the lines and charges
        }
        po.originalAmount = originalAmt;
        po.negotiatedAmount = finalAmount;
        po.totalAmount = finalAmount;
        po.savingsAmount = Math.max(0, originalAmt - finalAmount);
        po.savingsPercentage = originalAmt > 0 ? Math.round(((originalAmt - finalAmount) / originalAmt) * 100) : 0;
        po.negotiationStatus = 'AGREED';
        po.negotiationNotes = body.notes;
        po.negotiationAgreedAt = new Date();
        po.negotiationAgreedBy = userName;
        // the approval level follows the new value but is never lowered
        po.approvalRequiredRole = requiredRoleFor({ totalAmount: finalAmount, approvalRequiredRole: po.approvalRequiredRole }, thresholds) as any;
        po.approvalTier = (po.approvalRequiredRole === 'ADMIN' ? 'TIER_3_EXECUTIVE' : po.approvalRequiredRole === 'FINANCE_MANAGER' ? 'TIER_2_FINANCE' : 'TIER_1_SUPPLY_CHAIN') as any;
        await po.save();
        await logAuditEvent({ ...who, action: 'EDIT', resource: 'PurchaseOrder', resourceId: poId, resourceName: `PO #${po.poNumber}`, details: `Negotiation agreed at ₹${finalAmount.toLocaleString('en-IN')} (was ₹${originalAmt.toLocaleString('en-IN')}).` });
        return NextResponse.json(po);
      }

      // START_NEGOTIATION / SUBMIT_COUNTER_OFFER
      const counterAmount = num(body.counterAmount, 'Counter amount');
      const originalAmt = po.originalAmount || po.totalAmount;
      po.originalAmount = originalAmt;
      po.negotiatedAmount = counterAmount;
      po.savingsAmount = Math.max(0, originalAmt - counterAmount);
      po.savingsPercentage = originalAmt > 0 ? Math.round(((originalAmt - counterAmount) / originalAmt) * 100) : 0;
      po.negotiationStatus = 'IN_NEGOTIATION';
      po.negotiationNotes = body.notes;
      if (Array.isArray(body.counterItems)) {
        po.items.forEach((it: any, idx: number) => {
          const c = body.counterItems[idx];
          if (c) {
            it.negotiatedUnitPrice = c.negotiatedUnitPrice;
            it.negotiatedTotalPrice = c.negotiatedTotalPrice;
          }
        });
      }
      await po.save();
      return NextResponse.json(po);
    }

    if (body.action) throw new HttpError(400, `Unknown action '${body.action}'.`);

    // 3. New purchase order
    const { supplier, items, charges } = validatePOInput(body);
    if (!(await Supplier.exists({ _id: supplier }))) throw new HttpError(400, 'That supplier does not exist.');
    const found = await Product.countDocuments({ _id: { $in: items.map(i => i.product) } });
    if (found !== items.length) throw new HttpError(400, 'One or more products do not exist.');
    // lines typed in bags, rolls... are kept in stock units; everything after this works in stock units
    const totalAmount = Math.round((await applyOrderUnits(items, body.items) + chargesTotal(charges)) * 100) / 100;
    await assertItemsActive(items.map(i => i.product), 'purchase order');
    await assertSupplierAllowed(items.map(i => i.product), supplier);
    const sources = await checkPoLineSources(items);
    items.forEach((item, n) => { item.sources = sources[n]; });

    const tierInfo = calculatePOTier(totalAmount, thresholds);
    // Under the Supply Chain limit the creator (who is allowed to approve that tier) releases it and is recorded as the approver.
    const releasedNow = tierInfo.status === 'ORDERED' && canApprovePO(user.role, tierInfo.requiredRole);
    const initialStatus = releasedNow ? 'ORDERED' : 'PENDING_APPROVAL';

    const po: any = await createNumbered(PurchaseOrder, 'PO', 'poNumber', async (poNumber) => PurchaseOrder.create({
      poNumber,
      supplier,
      items: items.map(item => ({
        ...item,
        receivedQuantity: 0,
        negotiatedUnitPrice: item.unitPrice,
        negotiatedTotalPrice: item.totalPrice,
        originalUnitPrice: item.unitPrice,
      })),
      charges,
      totalAmount,
      originalAmount: totalAmount,
      negotiationStatus: 'NONE',
      savingsAmount: 0,
      savingsPercentage: 0,
      status: initialStatus,
      approvalTier: tierInfo.tier,
      approvalRequiredRole: tierInfo.requiredRole,
      approvedBy: releasedNow ? { name: user.name || 'Manager', role: user.role, date: new Date() } : undefined,
      sourceType: body.sourceType === 'MRP_AUTO' ? 'MRP_AUTO' : 'MANUAL',
      expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      notes: body.notes,
    }));

    await logAuditEvent({
      ...who,
      action: 'CREATE',
      resource: 'PurchaseOrder',
      resourceId: po._id,
      resourceName: `PO #${po.poNumber}`,
      details: `Purchase Order created for ₹${totalAmount.toLocaleString('en-IN')} with tier ${tierInfo.tier}.`,
    });
    return NextResponse.json(po, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}
