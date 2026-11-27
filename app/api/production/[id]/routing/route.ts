import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import WorkOrder from '@/models/WorkOrder';
import BillOfMaterials from '@/models/BillOfMaterials';
import { verifyAuth } from '@/lib/auth';

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'];

// Configure the process routing (Process A -> B -> C -> D). Names come from the request or the BOM routing steps.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const body = await req.json();

    await dbConnect();
    const wo = await WorkOrder.findById(id);
    if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 });
    if (wo.stageLogs?.length) return NextResponse.json({ error: 'Routing cannot be changed after output has been logged.' }, { status: 409 });
    if (['COMPLETED', 'CANCELLED'].includes(wo.status)) return NextResponse.json({ error: `Work order is ${wo.status}.` }, { status: 409 });

    let names: string[] = Array.isArray(body.stages) ? body.stages.map((s: any) => String(s).trim()).filter(Boolean) : [];
    if (body.fromBom) {
      const bom: any = await BillOfMaterials.findById(wo.bom).lean();
      names = (bom?.routingSteps || []).sort((a: any, b: any) => a.stepNumber - b.stepNumber).map((s: any) => s.description);
    }
    if (names.length < 1 || names.length > 12) return NextResponse.json({ error: 'Define between 1 and 12 stages.' }, { status: 400 });

    wo.stages = names.map((name, i) => ({ seq: i + 1, name, inQty: i === 0 ? wo.quantity : 0, good: 0, scrap: 0, rework: 0 })) as any;
    await wo.save();
    return NextResponse.json(wo);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
