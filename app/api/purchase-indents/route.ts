import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PurchaseIndent from '@/models/PurchaseIndent';
import '@/models/Product';
import '@/models/Supplier';
import { verifyAuth } from '@/lib/auth';
import { nextDocNumber } from '@/lib/docNumber';
import { withOrderedQuantities } from '@/lib/indentLines';
import { assertItemsActive } from '@/lib/itemRules';
import { statusOf } from '@/lib/httpError';

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const status = req.nextUrl.searchParams.get('status');
    const indents = await PurchaseIndent.find(status ? { status } : {})
      .populate('items.product', 'name sku uom')
      .populate('items.preferredSupplier', 'name code')
      .sort({ createdAt: -1 });
    return NextResponse.json(await withOrderedQuantities(indents)); // each line shows how much is on POs and how much is still open
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items.filter((i: any) => i.product && Number(i.quantity) > 0) : [];
    if (!items.length) return NextResponse.json({ error: 'Add at least one item with a quantity.' }, { status: 400 });

    await dbConnect();
    await assertItemsActive(items.map((i: any) => i.product), 'purchase indent');
    // Group by preferred supplier so each indent maps to one vendor bucket
    const groups = new Map<string, any[]>();
    for (const item of items) {
      const key = item.preferredSupplier || 'ANY';
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    const created = [];
    for (const [, groupItems] of groups) {
      created.push(await PurchaseIndent.create({
        number: await nextDocNumber(PurchaseIndent, 'IND'),
        source: body.source || 'MANUAL',
        mrpRun: body.mrpRun || undefined,
        category: body.category,
        remarks: body.remarks,
        requestedBy: user.name,
        items: groupItems.map((i: any) => ({ ...i, preferredSupplier: i.preferredSupplier || undefined })),
      }));
    }
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
