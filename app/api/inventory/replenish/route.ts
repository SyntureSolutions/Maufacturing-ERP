import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import PurchaseIndent from '@/models/PurchaseIndent';
import { REORDER_REMARK, reorderCheck, runReorderScan } from '@/lib/replenishmentEngine';

// Reorder-level replenishment for bought items.
// GET:  items at or below their reorder level now (nothing is created), and the indents earlier checks raised
// POST: raise one purchase indent for them; supplier, price and approval follow on the way to a purchase order

const ROLES = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER', 'PRODUCTION_MANAGER'];

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const [due, indents] = await Promise.all([
      reorderCheck(),
      PurchaseIndent.find({ remarks: { $regex: `^${REORDER_REMARK}` } }).populate('items.product', 'name sku uom').sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    return NextResponse.json({ due, indents });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Your role cannot raise purchase indents.' }, { status: 403 });
    await dbConnect();
    const { lines, indent } = await runReorderScan(user.name);
    return NextResponse.json({
      message: indent ? `Indent ${indent.number} raised for ${lines.length} item${lines.length > 1 ? 's' : ''} at or below reorder level.` : 'No bought item is at or below its reorder level. Nothing to indent.',
      lines, indent,
    }, { status: indent ? 201 : 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
