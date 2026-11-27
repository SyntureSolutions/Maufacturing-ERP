import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import DeliveryChallan from '@/models/DeliveryChallan';
import '@/models/Batch';
import '@/models/Product';
import { verifyAuth } from '@/lib/auth';
import { canViewInvoices, canViewFinance } from '@/lib/accessRoles';
import { statusOf } from '@/lib/httpError';

// One delivery challan, for the challan's own page. The cost of goods booked at dispatch is finance data, so other roles do not get it.
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewInvoices(user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Delivery challan not found' }, { status: 404 });
    await dbConnect();
    const dc: any = await DeliveryChallan.findById(id)
      .populate('stockMovements.batch', 'batchNumber')
      .populate('stockMovements.product', 'name sku')
      .populate('stockShortfall.product', 'name sku')
      .lean();
    if (!dc) return NextResponse.json({ error: 'Delivery challan not found' }, { status: 404 });
    if (!canViewFinance(user.role)) { delete dc.cogsValue; delete dc.cogsJournal; }
    return NextResponse.json(dc);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
