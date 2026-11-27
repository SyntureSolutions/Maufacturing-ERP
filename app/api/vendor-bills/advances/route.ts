import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import { canViewFinance } from '@/lib/accessRoles';
import { listAdvances } from '@/lib/payables';

// Advance payments to one supplier that have not been applied to a bill yet: /api/vendor-bills/advances?supplier=<id>
export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewFinance(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const supplier = req.nextUrl.searchParams.get('supplier') || '';
    if (!supplier) return NextResponse.json({ error: 'supplier is required.' }, { status: 400 });
    await dbConnect();
    return NextResponse.json(await listAdvances(supplier));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
