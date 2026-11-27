import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import '@/models/Supplier';
import { verifyAuth } from '@/lib/auth';
import { createVendorBill } from '@/lib/vendorBill';
import { statusOf } from '@/lib/httpError';
import { canViewFinance } from '@/lib/accessRoles';

const ROLES = ['ADMIN', 'FINANCE_MANAGER'];

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewFinance(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    await dbConnect();
    const bills: any[] = await Invoice.find({ type: 'PURCHASE', status: { $ne: 'CANCELLED' } }).populate('supplier', 'name code').sort({ date: -1, createdAt: -1 }).limit(300).lean();
    return NextResponse.json(bills.map(b => ({ ...b, outstanding: Math.round((b.totalAmount - (b.amountPaid || 0) - (b.creditedAmount || 0)) * 100) / 100 })));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Book a supplier's bill against received goods
export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Only Finance can book vendor bills.' }, { status: 403 });
    const b = await req.json();
    await dbConnect();
    const bill = await createVendorBill({ poId: b.poId, vendorBillNumber: b.vendorBillNumber, billDate: b.billDate, lines: b.lines || [], unregistered: !!b.unregistered, charges: b.charges, notes: b.notes }, user);
    return NextResponse.json(bill, { status: 201 });
  } catch (err: any) {
    if (err?.code === 11000) return NextResponse.json({ error: 'That supplier bill number is already booked.' }, { status: 409 });
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
