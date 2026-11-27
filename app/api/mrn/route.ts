import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import MaterialRequisition from '@/models/MaterialRequisition';
import WorkOrder from '@/models/WorkOrder';
import { createMrnForWorkOrder } from '@/lib/mrn';
import { statusOf } from '@/lib/httpError';
import '@/models/Product';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const mrns = await MaterialRequisition.find()
      .populate('workOrder', 'woNumber quantity')
      .populate('items.product', 'name sku uom')
      .sort({ createdAt: -1 });
    return NextResponse.json(mrns);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'SUPPLY_CHAIN_MANAGER', 'STAFF'];

// Create an MRN from a work order's BOM and reserve approved stock (earliest expiry first)
export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'You do not have permission to raise material requisitions.' }, { status: 403 });
    const { workOrderId, remarks } = await req.json();

    await dbConnect();
    const wo = await WorkOrder.findById(workOrderId);
    if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 });
    return NextResponse.json(await createMrnForWorkOrder(wo, user.name, remarks), { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
