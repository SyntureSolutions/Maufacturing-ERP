import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import { canViewFinance } from '@/lib/accessRoles';
import { buildLineage, findDocument, LINEAGE_TYPES, LineageType } from '@/lib/lineage';
import { statusOf } from '@/lib/httpError';

// The connected chain around one document, e.g. /api/lineage?type=SALES_ORDER&id=SO-2026-001 (id or document number).
// Documents that carry money (invoices, receipts, vendor bills, payments) are only included for finance-view roles.
export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (['HR_MANAGER', 'QUALITY_INSPECTOR'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const q = req.nextUrl.searchParams;
    const type = String(q.get('type') || '').toUpperCase() as LineageType;
    const id = String(q.get('id') || '').trim();
    if (!LINEAGE_TYPES.includes(type) || !id) return NextResponse.json({ error: `type (${LINEAGE_TYPES.join(', ')}) and id are required.` }, { status: 400 });
    await dbConnect();
    const finance = canViewFinance(user.role);
    // a finance document cannot be the starting point for someone who may not see finance data
    if (!finance && ['INVOICE', 'RECEIPT', 'VENDOR_BILL', 'PAYMENT', 'BILL_OF_ENTRY'].includes(type)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const start = await findDocument(type, id);
    return NextResponse.json(await buildLineage(start, finance));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
