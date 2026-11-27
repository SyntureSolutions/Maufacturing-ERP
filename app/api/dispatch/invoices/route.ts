import { NextRequest, NextResponse } from 'next/server';
import { canViewInvoices } from '@/lib/accessRoles';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import DeliveryChallan from '@/models/DeliveryChallan';
import { verifyAuth } from '@/lib/auth';
import { createTaxInvoice, loadSalesContext } from '@/lib/invoicing';
import { HttpError } from '@/lib/httpError';

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewInvoices(user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });
    await dbConnect();
    return NextResponse.json(await Invoice.find({ type: 'SALES', status: { $ne: 'CANCELLED' } }).sort({ createdAt: -1 }).limit(200).lean());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err instanceof HttpError ? err.status : 500 });
  }
}

// Direct tax invoice from a sales order (optionally referencing the delivery challan)
export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'FINANCE_MANAGER'].includes(user.role)) return NextResponse.json({ error: 'Only Finance can issue GST tax invoices.' }, { status: 403 });
    const { salesOrderId, dcId, placeOfSupply } = await req.json();

    await dbConnect();
    if (dcId && !mongoose.Types.ObjectId.isValid(dcId)) return NextResponse.json({ error: 'Delivery challan not found.' }, { status: 404 });
    const dc: any = dcId ? await DeliveryChallan.findById(dcId) : null;
    if (dcId && !dc) return NextResponse.json({ error: 'Delivery challan not found.' }, { status: 404 });
    if (dc && String(dc.salesOrder) !== String(salesOrderId)) return NextResponse.json({ error: `Challan ${dc.number} belongs to a different sales order.` }, { status: 409 });
    if (dc && dc.status !== 'ISSUED') return NextResponse.json({ error: `Challan ${dc.number} is ${dc.status.toLowerCase()} and cannot be invoiced.` }, { status: 409 });
    // an invoice raised from a challan covers exactly what that challan carried
    const lines = dc ? (dc.items || []).map((i: any) => ({ product: String(i.productId), quantity: i.quantity })) : undefined;
    const ctx = await loadSalesContext(salesOrderId, placeOfSupply || dc?.placeOfSupply, { kind: 'invoice', lines });
    // Claim the challan first (ISSUED -> INVOICED), so it cannot be cancelled, or invoiced twice, while the invoice is being made
    if (dc) {
      const claimed = await DeliveryChallan.findOneAndUpdate({ _id: dc._id, status: 'ISSUED' }, { status: 'INVOICED' }, { new: true });
      if (!claimed) return NextResponse.json({ error: `Challan ${dc.number} was changed by someone else. Reload and try again.` }, { status: 409 });
    }
    let invoice: any;
    try {
      invoice = await createTaxInvoice(ctx, { createdByRole: user.role, createdById: user.id, dcRef: dc?.number, dcId: dc?._id });
    } catch (err) {
      if (dc) await DeliveryChallan.updateOne({ _id: dc._id, status: 'INVOICED' }, { status: 'ISSUED' });
      throw err;
    }
    if (dc) await DeliveryChallan.updateOne({ _id: dc._id }, { invoiceNumber: invoice.invoiceNumber });
    return NextResponse.json(invoice, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err instanceof HttpError ? err.status : 500 });
  }
}
