import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import PurchaseOrder from '@/models/PurchaseOrder';
import '@/models/Supplier';
import '@/models/Product';
import { verifyAuth } from '@/lib/auth';
import { canViewFinance } from '@/lib/accessRoles';
import { statusOf } from '@/lib/httpError';

// One vendor bill with its supplier, lines and the purchase order it was booked against, for the bill's own page
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewFinance(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Vendor bill not found' }, { status: 404 });
    await dbConnect();
    const bill: any = await Invoice.findOne({ _id: id, type: 'PURCHASE' })
      .populate('supplier', 'name code gstin pan paymentTerms')
      .populate('items.product', 'name sku uom')
      .lean();
    if (!bill) return NextResponse.json({ error: 'Vendor bill not found' }, { status: 404 });
    const po: any = bill.poNumber ? await PurchaseOrder.findOne({ poNumber: bill.poNumber }).select('poNumber status').lean() : null;
    return NextResponse.json({ ...bill, purchaseOrder: po ? { _id: String(po._id), poNumber: po.poNumber, status: po.status } : null, outstanding: Math.round((bill.totalAmount - (bill.amountPaid || 0) - (bill.creditedAmount || 0)) * 100) / 100 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
