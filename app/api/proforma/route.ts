import { NextRequest, NextResponse } from 'next/server';
import { canViewInvoices } from '@/lib/accessRoles';
import dbConnect from '@/lib/mongodb';
import ProformaInvoice from '@/models/ProformaInvoice';
import CompanySettings from '@/models/CompanySettings';
import { verifyAuth } from '@/lib/auth';
import { nextDocNumber } from '@/lib/docNumber';
import { loadSalesContext } from '@/lib/invoicing';

const ROLES = ['ADMIN', 'MANAGER', 'SALES', 'SUPPLY_CHAIN_MANAGER', 'FINANCE_MANAGER'];

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewInvoices(user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });
    await dbConnect();
    return NextResponse.json(await ProformaInvoice.find().sort({ createdAt: -1 }).limit(200).lean());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Issue a proforma invoice for a sales order so the customer can pay an advance before dispatch
export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { salesOrderId, placeOfSupply, advanceRequested } = await req.json();

    await dbConnect();
    const ctx = await loadSalesContext(salesOrderId, placeOfSupply);
    if (!['APPROVED', 'IN_FULFILLMENT', 'FULFILLED'].includes(ctx.so.status)) throw new Error(`Sales order is ${ctx.so.status}; only approved orders can be proformed.`);
    const advance = Number(advanceRequested) || 0;
    if (advance < 0 || advance > ctx.total) throw new Error('Advance cannot exceed the invoice total.');

    const company: any = await CompanySettings.findOne({ key: 'company' }).lean();
    const pi = await ProformaInvoice.create({
      number: await nextDocNumber(ProformaInvoice, 'PI'), salesOrder: ctx.so._id, soNumber: ctx.so.soNumber, customer: ctx.customer._id, customerName: ctx.customer.name,
      placeOfSupply: ctx.placeOfSupply, items: ctx.tax.items, hsnSummary: ctx.tax.hsnSummary, charges: ctx.tax.charges, goodsTotal: ctx.tax.goodsTotal, subTotal: ctx.tax.subTotal,
      totalCGST: ctx.tax.totalCGST, totalSGST: ctx.tax.totalSGST, totalIGST: ctx.tax.totalIGST, tcs: ctx.tcs.rows, tcsAmount: ctx.tcs.amount, totalAmount: ctx.total,
      advanceRequested: advance, bank: company?.bank, terms: company?.invoiceTerms, parties: ctx.parties,
    });
    return NextResponse.json(pi, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.name === 'ValidationError' ? 400 : 500 });
  }
}
