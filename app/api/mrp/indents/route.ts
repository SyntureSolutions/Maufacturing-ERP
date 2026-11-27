import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import MRPRun from '@/models/MRPRun';
import PurchaseIndent from '@/models/PurchaseIndent';
import { verifyAuth } from '@/lib/auth';
import { nextDocNumber } from '@/lib/docNumber';
import { openIndentQuantities } from '@/lib/salesOrderMrp';
import { fixedSuppliers } from '@/lib/sourceList';
import SalesOrder from '@/models/SalesOrder';

// Turn the purchasable shortfalls of an MRP run into Purchase Indents, one per item category
export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { runId } = await req.json();
    if (!mongoose.isValidObjectId(runId)) return NextResponse.json({ error: 'Invalid MRP run.' }, { status: 400 });

    await dbConnect();
    // Atomic claim so a double-click cannot create duplicate indents
    const run = await MRPRun.findOneAndUpdate({ _id: runId, indentsCreated: { $ne: true } }, { indentsCreated: true });
    if (!run) return NextResponse.json({ error: 'Run not found or indents were already created for it.' }, { status: 409 });

    let rows = (run.matrix || []).filter((r: any) => r.orderType === 'PURCHASE' && r.netIndentQty > 0);
    if (run.salesOrder) {
      // indents raised for this order since the run was made already cover part of the shortfall
      const now = await openIndentQuantities(run.salesOrder);
      rows = rows.map((r: any) => ({ ...r, netIndentQty: Math.round(Math.max(0, r.netIndentQty - Math.max(0, (now.get(String(r.product)) || 0) - (r.onIndent || 0))) * 10000) / 10000 })).filter((r: any) => r.netIndentQty > 0);
    }
    if (!rows.length) {
      return NextResponse.json({ created: [], message: 'No purchasable shortfall in this run.' });
    }
    const groups = new Map<string, any[]>();
    for (const r of rows) groups.set(r.category || 'Uncategorised', [...(groups.get(r.category || 'Uncategorised') || []), r]);

    // the fixed supplier on each product's source list is proposed; an order-driven run needs the material by the order's date
    const fixed = await fixedSuppliers(rows.map((r: any) => r.product));
    const so: any = run.salesOrder ? await SalesOrder.findById(run.salesOrder).select('deliveryDate').lean() : null;
    const created = [];
    for (const [category, items] of groups) {
      created.push(await PurchaseIndent.create({
        number: await nextDocNumber(PurchaseIndent, 'IND'),
        source: 'MRP', mrpRun: run._id, salesOrder: run.salesOrder || undefined, category, requestedBy: user.name,
        items: items.map(i => ({ product: i.product, quantity: i.netIndentQty, preferredSupplier: fixed.get(String(i.product)), requiredBy: i.needBy || so?.deliveryDate || undefined })),
      }));
    }
    return NextResponse.json({ created });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
