import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import DeliveryChallan from '@/models/DeliveryChallan';
import { verifyAuth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { restoreStock, returnQuantitiesByProduct, refreshOrderState } from '@/lib/dispatch';
import { HttpError, statusOf } from '@/lib/httpError';
import { reverseDispatchCost } from '@/lib/costing';
import JournalEntry from '@/models/JournalEntry';
import { assertPeriodOpen } from '@/lib/accounting';
import { releasePicked } from '@/lib/picking';

const ROLES = ['ADMIN', 'MANAGER', 'SALES', 'SUPPLY_CHAIN_MANAGER'];

// Cancel a challan that has not been invoiced: the goods go back into stock and the quantities go back on the order, so they can be dispatched again
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'You do not have permission to cancel delivery challans.' }, { status: 403 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Delivery challan not found.' }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    const reason = String(body?.reason || '').trim();
    if (reason.length < 5) return NextResponse.json({ error: 'Give a reason for cancelling (at least 5 characters).' }, { status: 400 });
    await dbConnect();

    const existing: any = await DeliveryChallan.findById(id).lean();
    if (!existing) return NextResponse.json({ error: 'Delivery challan not found.' }, { status: 404 });
    if (existing.status === 'INVOICED') throw new HttpError(409, `${existing.number} has been invoiced (${existing.invoiceNumber}). It cannot be cancelled; correct the invoice with a credit note instead.`);
    if (existing.status === 'CANCELLED') throw new HttpError(409, `${existing.number} is already cancelled.`);

    if (existing.cogsJournal) await assertPeriodOpen('ACCOUNTING'); // the cost entry is reversed, which needs an open period
    // claim it first so two people cancelling at once put the goods back once
    const dc: any = await DeliveryChallan.findOneAndUpdate({ _id: id, status: 'ISSUED' }, { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date() }, { new: false }).lean();
    if (!dc) throw new HttpError(409, 'The challan was changed by someone else. Reload and try again.');

    if (dc.cogsJournal) {
      const original: any = await JournalEntry.findById(dc.cogsJournal).lean();
      await reverseDispatchCost(original, dc.number, user.id);
    }
    await restoreStock(dc.salesOrder, (dc.stockMovements || []).map((m: any) => ({ batch: String(m.batch), qty: m.qty, reserved: !!m.reserved, product: String(m.product) })));
    await releasePicked((dc.pickClaims || []).map((c: any) => ({ pickList: String(c.pickList), line: String(c.line), qty: c.qty }))); // the picked goods can go out again
    await returnQuantitiesByProduct(dc.salesOrder, 'dispatchedQty', (dc.items || []).map((i: any) => ({ product: String(i.productId), quantity: i.quantity })));
    await refreshOrderState(dc.salesOrder);

    await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'DELETE', resource: 'DELIVERY_CHALLAN', resourceId: id, resourceName: dc.number, details: `Cancelled; ${(dc.stockMovements || []).length} stock movement(s) put back.`, reason }).catch(() => {});
    return NextResponse.json({ number: dc.number, status: 'CANCELLED', soNumber: dc.soNumber });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
