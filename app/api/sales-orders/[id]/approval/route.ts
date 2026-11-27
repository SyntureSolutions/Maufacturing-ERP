import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SalesOrder from '@/models/SalesOrder';
import { verifyAuth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { requestApproval } from '@/lib/approvals';
import { approveSalesOrder } from '@/lib/salesOrderApproval';
import { checkCredit, CREDIT_OVERRIDE_ROLES } from '@/lib/creditExposure';
import { HttpError, statusOf } from '@/lib/httpError';
import { marginLines, MSP_OVERRIDE_ROLES } from '@/lib/salesMargin';

// What the approver needs to decide: price against minimum selling price per line, and the customer's credit position.
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    await dbConnect();
    const so: any = await SalesOrder.findById(id).lean();
    if (!so) return NextResponse.json({ error: 'Sales Order not found' }, { status: 404 });
    const lines = await marginLines(so);
    const credit = so.customer ? await checkCredit(so.customer, so.status === 'DRAFT' ? so.totalAmount || 0 : 0) : null;
    return NextResponse.json({ soNumber: so.soNumber, status: so.status, hold: so.hold, lines, belowMsp: lines.some((l: any) => l.belowMsp), credit });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role === 'VIEWER') {
      return NextResponse.json({ error: 'Forbidden: Executive Viewer has read-only access' }, { status: 403 });
    }

    const { id } = await context.params;

    try {
      await dbConnect();
      const so: any = await SalesOrder.findById(id);

      if (!so) {
        return NextResponse.json({ error: 'Sales Order not found' }, { status: 404 });
      }
      if (so.status !== 'DRAFT') {
        return NextResponse.json({ error: `Sales Order is already in status '${so.status}'` }, { status: 400 });
      }
      const body = await req.json().catch(() => ({}));

      // Margin gate: lines priced below the product's minimum selling price need a Manager/Admin with a written reason
      const below = (await marginLines(so)).filter((l: any) => l.belowMsp);
      if (below.length) {
        const list = below.map((l: any) => `line ${l.lineNo} ${l.sku} at ₹${l.unitPrice} (MSP ₹${l.minSellingPrice})`).join(', ');
        if (!body?.approveBelowMsp) return NextResponse.json({ error: `Priced below minimum selling price: ${list}. A Manager or Admin must approve the margin with a reason.`, belowMsp: true, lines: below }, { status: 422 });
        if (!MSP_OVERRIDE_ROLES.includes(user.role)) return NextResponse.json({ error: 'Only a Manager or Admin can approve an order priced below minimum selling price.' }, { status: 403 });
        const reason = String(body?.mspReason || '').trim();
        if (reason.length < 10) return NextResponse.json({ error: 'Explain why the price below MSP is accepted (at least 10 characters).' }, { status: 400 });
        so.mspOverride = { by: user.name, role: user.role, reason, at: new Date(), lines: below.map((l: any) => l.lineNo) };
        await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'OVERRIDE', resource: 'SALES_ORDER', resourceId: String(so._id), resourceName: so.soNumber || id, details: `Approved below minimum selling price: ${list}.`, reason });
      }

      // Credit gate: an order that takes the customer over their limit needs a privileged override
      if (so.customer) {
        const credit = await checkCredit(so.customer, so.totalAmount || 0);
        if (credit.over) {
          if (!body?.bypassCreditCheck) {
            return NextResponse.json({ error: `Credit limit exceeded: limit ₹${credit.limit.toLocaleString('en-IN')}, exposure with this order ₹${credit.newTotal.toLocaleString('en-IN')} (₹${credit.receivable.toLocaleString('en-IN')} unpaid invoices + ₹${credit.openOrders.toLocaleString('en-IN')} open orders + this order). An Admin, Manager or Finance Manager must override it.`, creditCheckFailed: true, creditLimit: credit.limit, exposure: credit.newTotal }, { status: 422 });
          }
          if (!CREDIT_OVERRIDE_ROLES.includes(user.role)) return NextResponse.json({ error: 'Only an Admin, Manager or Finance Manager can override the credit limit.' }, { status: 403 });
          await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'OVERRIDE', resource: 'SALES_ORDER', resourceId: String(so._id), resourceName: so.soNumber || id, details: `Credit limit ₹${credit.limit} overridden: exposure with this order ₹${credit.newTotal}.`, reason: String(body?.bypassReason || '') });
        }
      }

      if (so.isModified('mspOverride')) await so.save(); // both gates passed: keep who accepted the margin

      // Orders at or above a configured value go through the approval matrix; stock is reserved only once approved
      const approval = await requestApproval({
        module: 'SALES_ORDER', refId: String(so._id), refNumber: so.soNumber || id, amount: so.totalAmount || 0,
        requestedBy: user.name, requestedById: user.id, requestedByRole: user.role, summary: `${so.soNumber || 'Sales order'} for ${so.customerName || 'customer'}`,
      });
      if (approval) {
        so.approvalPending = true;
        await so.save();
        return NextResponse.json({
          message: `Sales Order sent for approval (${approval.levels.map((l: any) => l.role.replace(/_/g, ' ').toLowerCase()).join(' → ')}). Stock is reserved once it is approved.`,
          pendingApproval: true, approvalId: approval._id, salesOrder: so,
        }, { status: 202 });
      }

      const { so: approved, allocationWarning } = await approveSalesOrder(id, user);
      return NextResponse.json({
        message: 'Sales Order APPROVED! FEFO batch stock reserved.',
        salesOrder: approved,
        allocationWarning,
      });
    } catch (dbErr) {
      throw dbErr; // never report an order as approved when stock was not reserved
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: statusOf(error) });
  }
}
