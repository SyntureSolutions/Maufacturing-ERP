import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PurchaseOrder from '@/models/PurchaseOrder';
import '@/models/Supplier';
import '@/models/Product';
import { verifyAuth } from '@/lib/auth';
import { billable, acceptedLines, poChargesLeft } from '@/lib/vendorBill';
import { canViewFinance } from '@/lib/accessRoles';

// Purchase orders with goods received that the supplier has not billed yet: what the bill-entry screen offers
export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewFinance(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    await dbConnect();
    const pos: any[] = await PurchaseOrder.find({ status: { $in: ['PARTIALLY_RECEIVED', 'RECEIVED', 'ORDERED'] }, 'items.receivedQuantity': { $gt: 0 } })
      .populate('supplier', 'name code gstin').populate('items.product', 'name sku uom').sort({ orderDate: -1 }).limit(200).lean();
    const lines = await acceptedLines(pos.map(p => String(p._id)));
    const rows = await Promise.all(pos.map(async po => {
      const b = billable(po, lines);
      return {
        _id: po._id, poNumber: po.poNumber, supplier: po.supplier, chargesLeft: await poChargesLeft(po),
        items: po.items.map((i: any) => { const x = b.find((y: any) => y.product === String(i.product._id)); return { product: i.product, ordered: i.quantity, received: x!.received, awaitingQc: x!.awaitingQc, billed: x!.billed, unbilled: x!.unbilled, price: i.unitPrice }; }),
      };
    })).then(all => all.filter(p => p.items.some((i: any) => i.unbilled > 0)));
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
