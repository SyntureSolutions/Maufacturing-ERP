import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import RFQ from '@/models/RFQ';
import PurchaseOrder from '@/models/PurchaseOrder';
import { verifyAuth } from '@/lib/auth';
import { nextDocNumber } from '@/lib/docNumber';
import PurchaseIndent from '@/models/PurchaseIndent';
import { requestApproval } from '@/lib/approvals';
import { assertSupplierAllowed } from '@/lib/sourceList';
import { statusOf } from '@/lib/httpError';
import mongoose from 'mongoose';
import '@/models/Product';
import '@/models/Supplier';

// One RFQ with its vendors, quotes and the requisitions and purchase order it links to, for the RFQ's own page
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'RFQ not found' }, { status: 404 });
    await dbConnect();
    const rfq = await RFQ.findById(id)
      .populate('items.product', 'name sku uom')
      .populate('suppliers', 'name code')
      .populate('quotes.supplier', 'name code')
      .populate('quotes.unitPrices.product', 'name sku')
      .populate('awardedSupplier', 'name code')
      .populate('indents', 'number status')
      .populate('purchaseOrder', 'poNumber status')
      .lean();
    if (!rfq) return NextResponse.json({ error: 'RFQ not found' }, { status: 404 });
    return NextResponse.json(rfq);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER', 'FINANCE_MANAGER'].includes(user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot work on RFQs.' }, { status: 403 });
    const { id } = await context.params;
    const body = await req.json();

    await dbConnect();
    const rfq = await RFQ.findById(id);
    if (!rfq) return NextResponse.json({ error: 'RFQ not found.' }, { status: 404 });
    if (rfq.status !== 'OPEN') return NextResponse.json({ error: `RFQ is ${rfq.status}.` }, { status: 409 });

    if (body.action === 'quote') {
      const supplier = String(body.supplier);
      if (!rfq.suppliers.some((s: any) => String(s) === supplier)) return NextResponse.json({ error: 'Vendor is not part of this RFQ.' }, { status: 400 });
      const wanted = new Set(rfq.items.map((i: any) => String(i.product)));
      const unitPrices = (body.unitPrices || []).filter((p: any) => wanted.has(String(p.product)) && Number(p.unitPrice) >= 0);
      if (unitPrices.length !== wanted.size) return NextResponse.json({ error: 'Enter a unit price for every RFQ item.' }, { status: 400 });
      const quote = {
        supplier, unitPrices,
        freight: Number(body.freight) || 0,
        gstPercent: Number(body.gstPercent) || 0,
        leadTimeDays: body.leadTimeDays ? Number(body.leadTimeDays) : undefined,
        paymentTerms: body.paymentTerms, remarks: body.remarks,
      };
      const idx = rfq.quotes.findIndex((q: any) => String(q.supplier) === supplier);
      if (idx >= 0) rfq.quotes[idx] = quote as any; else rfq.quotes.push(quote as any);
      await rfq.save();
      return NextResponse.json(rfq);
    }

    if (body.action === 'award') {
      const quote = rfq.quotes.find((q: any) => String(q.supplier) === String(body.supplier));
      if (!quote) return NextResponse.json({ error: 'No quotation recorded for that vendor.' }, { status: 400 });
      await assertSupplierAllowed(rfq.items.map((i: any) => i.product), quote.supplier);
      const items = rfq.items.map((item: any) => {
        const unitPrice = quote.unitPrices.find((p: any) => String(p.product) === String(item.product))?.unitPrice ?? 0;
        return { product: item.product, quantity: item.quantity, unitPrice, totalPrice: unitPrice * item.quantity, deliveryDate: item.requiredBy || undefined, sources: item.sources || [] };
      });
      const subtotal = items.reduce((s: number, i: any) => s + i.totalPrice, 0);
      const totalAmount = Math.round((subtotal * (1 + quote.gstPercent / 100) + quote.freight) * 100) / 100;
      const orders = new Set((await PurchaseIndent.find({ _id: { $in: rfq.indents } }).select('salesOrder').lean()).map((i: any) => String(i.salesOrder || '')));
      const forOrder = orders.size === 1 ? [...orders][0] : ''; // '' = no order, or the indents belong to several
      // Created as DRAFT so it goes through the normal PO approval tiers
      const po = await PurchaseOrder.create({
        poNumber: await nextDocNumber(PurchaseOrder, 'PO', 'poNumber'), // note: the award total includes the quote's GST and freight; lines hold pre-tax prices
        supplier: quote.supplier, items, totalAmount, status: 'DRAFT', sourceType: 'MANUAL', salesOrder: forOrder || undefined,
        expectedDeliveryDate: quote.leadTimeDays ? new Date(Date.now() + quote.leadTimeDays * 86400000) : undefined,
        notes: `Awarded from ${rfq.number}${body.remarks ? ` - ${body.remarks}` : ''}`,
      });
      rfq.status = 'AWARDED';
      rfq.awardedSupplier = quote.supplier;
      rfq.awardRemarks = body.remarks;
      rfq.purchaseOrder = po._id;
      await rfq.save();
      // Route through the approval matrix when a rule applies; otherwise the PO stays DRAFT for the normal PO flow
      const approval = await requestApproval({ module: 'PURCHASE_ORDER', refId: String(po._id), refNumber: po.poNumber, amount: totalAmount, requestedBy: user.name, summary: `Awarded from ${rfq.number}` });
      return NextResponse.json({ rfq, purchaseOrder: po, approval });
    }

    if (body.action === 'cancel') {
      rfq.status = 'CANCELLED';
      await rfq.save();
      return NextResponse.json(rfq);
    }
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
