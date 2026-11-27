import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PurchaseReturn from '@/models/PurchaseReturn';
import '@/models/Supplier';
import '@/models/Product';
import { verifyAuth } from '@/lib/auth';
import { returnAfterBilling } from '@/lib/purchaseReturn';
import { statusOf } from '@/lib/httpError';

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    return NextResponse.json(await PurchaseReturn.find().populate('supplier', 'name code address gstin').populate('items.product', 'name sku').sort({ createdAt: -1 }));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

const RETURN_ROLES = ['ADMIN', 'FINANCE_MANAGER', 'SUPPLY_CHAIN_MANAGER'];

// Send accepted goods back to the vendor after receipt: body { grnId, billId?, reason, lines: [{ index, quantity, reason? }] }.
// Goods that were already billed need the bill they were billed on; its GST and value are credited.
export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!RETURN_ROLES.includes(user.role)) return NextResponse.json({ error: 'You do not have permission to return goods to a vendor.' }, { status: 403 });
    const b = await req.json().catch(() => null);
    if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Send the return details as a JSON object.' }, { status: 400 });
    await dbConnect();
    const ret = await returnAfterBilling({ grnId: String(b.grnId || ''), billId: b.billId ? String(b.billId) : undefined, reason: b.reason ? String(b.reason) : undefined, lines: b.lines }, user);
    return NextResponse.json(ret, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
