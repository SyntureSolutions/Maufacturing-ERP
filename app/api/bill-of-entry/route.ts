import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import BillOfEntry from '@/models/BillOfEntry';
import '@/models/Supplier';
import { verifyAuth } from '@/lib/auth';
import { recordBillOfEntry } from '@/lib/billOfEntry';
import { canViewFinance } from '@/lib/accessRoles';
import { statusOf } from '@/lib/httpError';

const WRITERS = ['ADMIN', 'FINANCE_MANAGER', 'SUPPLY_CHAIN_MANAGER'];
const READERS = ['ADMIN', 'FINANCE_MANAGER', 'SUPPLY_CHAIN_MANAGER', 'MANAGER', 'VIEWER'];

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!READERS.includes(user.role) && !canViewFinance(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    await dbConnect();
    const q = req.nextUrl.searchParams;
    const filter: any = {};
    if (q.get('grn')) filter.grn = q.get('grn');
    if (q.get('po')) filter.po = q.get('po');
    return NextResponse.json(await BillOfEntry.find(filter).populate('supplier', 'name code').sort({ date: -1, createdAt: -1 }).limit(300).lean());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Record a customs Bill of Entry against a goods receipt of imported goods
export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!WRITERS.includes(user.role)) return NextResponse.json({ error: 'Only Finance and Supply Chain can record a Bill of Entry.' }, { status: 403 });
    const b = await req.json().catch(() => null);
    if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Send the Bill of Entry details as a JSON object.' }, { status: 400 });
    await dbConnect();
    const boe = await recordBillOfEntry({
      number: b.number, date: b.date, port: b.port, grnId: String(b.grnId || ''), assessableValue: b.assessableValue, bcd: b.bcd, sws: b.sws, igst: b.igst,
      otherCharges: b.otherCharges, mode: b.mode, paymentRef: b.paymentRef, currency: b.currency, exchangeRate: b.exchangeRate,
    }, user);
    return NextResponse.json(boe, { status: 201 });
  } catch (err: any) {
    if (err?.code === 11000) return NextResponse.json({ error: 'That Bill of Entry is already recorded.' }, { status: 409 });
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
