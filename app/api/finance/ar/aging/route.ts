import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { canViewFinance } from '@/lib/accessRoles';
import { verifyAuth } from '@/lib/auth';
import { receivablesAging } from '@/lib/receivablesAging';

// Receivables by customer and age, from the sales invoices still unpaid, with each customer's credit standing.
export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewFinance(user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });
    await dbConnect();
    return NextResponse.json(await receivablesAging());
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: 500 });
  }
}
