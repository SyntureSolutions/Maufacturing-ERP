import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import RFQ from '@/models/RFQ';
import PurchaseIndent from '@/models/PurchaseIndent';
import '@/models/Product';
import '@/models/Supplier';
import { verifyAuth } from '@/lib/auth';
import { nextDocNumber } from '@/lib/docNumber';

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const rfqs = await RFQ.find()
      .populate('items.product', 'name sku uom')
      .populate('suppliers', 'name code')
      .populate('quotes.supplier', 'name code')
      .populate('quotes.unitPrices.product', 'name sku')
      .sort({ createdAt: -1 });
    return NextResponse.json(rfqs);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Consolidate approved indents into a single multi-vendor RFQ
export async function POST(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { indentIds, supplierIds, dueDate } = await req.json();
    if (!Array.isArray(indentIds) || !indentIds.length) return NextResponse.json({ error: 'Select at least one approved indent.' }, { status: 400 });
    if (!Array.isArray(supplierIds) || supplierIds.length < 2) return NextResponse.json({ error: 'Select at least two vendors for a rate comparison.' }, { status: 400 });

    await dbConnect();
    const indents = await PurchaseIndent.find({ _id: { $in: indentIds }, status: 'APPROVED' });
    if (indents.length !== indentIds.length) return NextResponse.json({ error: 'Only approved indents that are not yet in an RFQ can be consolidated.' }, { status: 409 });

    // One RFQ line per product. Each keeps the requisition lines it covers, so the awarded PO line can say what it orders,
    // and is wanted by the earliest date any of them needs.
    type RfqLine = { product: any; quantity: number; uom?: string; requiredBy?: Date; sources: { indent: any; lineNo: number; quantity: number }[] };
    const merged = new Map<string, RfqLine>();
    for (const indent of indents) {
      if (indent.items.some((i: any) => !i.lineNo)) await indent.save(); // requisitions from before line numbers get them now
      for (const item of indent.items) {
        const key = String(item.product);
        const line: RfqLine = merged.get(key) || { product: item.product, quantity: 0, uom: item.uom, sources: [] };
        line.quantity += item.quantity;
        line.sources.push({ indent: indent._id, lineNo: item.lineNo, quantity: item.quantity });
        if (item.requiredBy && (!line.requiredBy || item.requiredBy < line.requiredBy)) line.requiredBy = item.requiredBy;
        merged.set(key, line);
      }
    }

    const rfq = await RFQ.create({
      number: await nextDocNumber(RFQ, 'RFQ'),
      indents: indents.map(i => i._id),
      items: [...merged.values()],
      suppliers: supplierIds,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });
    await PurchaseIndent.updateMany({ _id: { $in: indentIds } }, { status: 'RFQ_CREATED', rfq: rfq._id });
    return NextResponse.json(rfq, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
