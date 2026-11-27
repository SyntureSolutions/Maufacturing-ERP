import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import ProformaInvoice from '@/models/ProformaInvoice';
import { verifyAuth } from '@/lib/auth';
import { createTaxInvoice, loadSalesContext } from '@/lib/invoicing';
import { HttpError, statusOf } from '@/lib/httpError';
import { canViewInvoices } from '@/lib/accessRoles';
import mongoose from 'mongoose';

// One pro-forma invoice, for its own page
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewInvoices(user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Proforma invoice not found.' }, { status: 404 });
    await dbConnect();
    const pi = await ProformaInvoice.findById(id).lean();
    return pi ? NextResponse.json(pi) : NextResponse.json({ error: 'Proforma invoice not found.' }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    const { action } = await req.json();

    await dbConnect();
    const pi = await ProformaInvoice.findById(id);
    if (!pi) return NextResponse.json({ error: 'Proforma invoice not found.' }, { status: 404 });
    if (pi.status !== 'ISSUED') return NextResponse.json({ error: `Proforma is already ${pi.status}.` }, { status: 409 });

    if (action === 'cancel') {
      pi.status = 'CANCELLED';
      await pi.save();
      return NextResponse.json(pi);
    }
    if (action === 'convert') {
      if (!['ADMIN', 'FINANCE_MANAGER'].includes(user.role)) return NextResponse.json({ error: 'Only Finance can issue the final tax invoice.' }, { status: 403 });
      // Re-price from the order so the invoice reflects current product tax data
      const ctx = await loadSalesContext(String(pi.salesOrder), pi.placeOfSupply, { kind: 'invoice', lines: (pi.items || []).map((i: any) => ({ product: String(i.productId), quantity: i.quantity })) });
      const invoice = await createTaxInvoice(ctx, { createdByRole: user.role, createdById: user.id, proformaRef: pi.number });
      pi.status = 'CONVERTED'; pi.invoice = invoice._id; pi.invoiceNumber = invoice.invoiceNumber;
      await pi.save();
      return NextResponse.json({ proforma: pi, invoice });
    }
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err instanceof HttpError ? err.status : 500 });
  }
}
