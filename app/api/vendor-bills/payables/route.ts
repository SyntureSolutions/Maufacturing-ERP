import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import { canViewFinance } from '@/lib/accessRoles';
import { listPayables, payablesCsv } from '@/lib/payables';

// Accounts payable: vendor bills that still have something to pay, with how overdue they are and any payment waiting for approval.
// Query: asOf=YYYY-MM-DD (look back), supplier=<id>, overdue=1, format=csv
export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewFinance(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const q = req.nextUrl.searchParams;
    let asOf: Date | undefined;
    if (q.get('asOf')) {
      asOf = new Date(`${q.get('asOf')}T23:59:59.999Z`);
      if (Number.isNaN(asOf.getTime())) return NextResponse.json({ error: 'asOf must be a date like 2026-10-31.' }, { status: 400 });
    }
    await dbConnect();
    const result = await listPayables({ asOf, supplier: q.get('supplier') || undefined, overdueOnly: q.get('overdue') === '1' });
    if (q.get('format') === 'csv') {
      return new NextResponse(payablesCsv(result.rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="payables-${new Date(result.asOf).toISOString().slice(0, 10)}.csv"` } });
    }
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
