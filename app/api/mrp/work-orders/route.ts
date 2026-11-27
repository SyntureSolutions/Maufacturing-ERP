import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import MRPRun from '@/models/MRPRun';
import { defaultBoms } from '@/lib/bom';
import WorkOrder from '@/models/WorkOrder';
import { verifyAuth } from '@/lib/auth';
import { planWorkOrders } from '@/lib/workOrderPlan';
import { nextWoNumber } from '@/lib/woNumber';
import SalesOrder from '@/models/SalesOrder';
import { createMrnForWorkOrder } from '@/lib/mrn';

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'];
const DAY = 86400000;

// Turns the work-order shortfalls of an MRP run (finished goods and sub-assemblies) into PLANNED work orders,
// linked parent -> child and dated so sub-assemblies finish before the assembly that needs them.
export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { runId } = await req.json();
    if (!mongoose.isValidObjectId(runId)) return NextResponse.json({ error: 'Invalid MRP run.' }, { status: 400 });

    await dbConnect();
    // Atomic claim so a double-click cannot create duplicate work orders
    const run: any = await MRPRun.findOneAndUpdate({ _id: runId, workOrdersCreated: { $ne: true } }, { workOrdersCreated: true });
    if (!run) return NextResponse.json({ error: 'Run not found or work orders were already created for it.' }, { status: 409 });
    const release = () => MRPRun.updateOne({ _id: runId }, { workOrdersCreated: false });

    // a run made for one customer order cannot build work orders that a later plan has already built for it
    if (run.salesOrder && await WorkOrder.exists({ salesOrder: run.salesOrder, demandType: 'MTO', status: { $in: ['PLANNED', 'IN_PROGRESS'] }, createdAt: { $gt: run.createdAt } })) {
      await release();
      return NextResponse.json({ error: 'Work orders were already created for this order after this run. Run the plan again to see what is still needed.' }, { status: 409 });
    }

    const rows: any[] = run.matrix || [];
    const products = [...new Set(rows.filter(r => r.orderType === 'WORK_ORDER').map(r => String(r.product)))];
    const bomOf = await defaultBoms(products); // each item's default BOM
    const components = new Map<string, string[]>([...bomOf].map(([p, b]) => [p, b.components.map((c: any) => String(c.product))]));

    const { plan, skipped } = planWorkOrders(rows, components);
    if (!plan.length) {
      await release(); // nothing was created, so the run can be retried once BOMs are fixed
      return NextResponse.json({ created: [], skipped, message: skipped.length ? 'No work orders created: add an active BOM for the skipped items.' : 'No work-order shortfall in this run.' });
    }

    // a run made for one customer order builds make-to-order work orders tagged to that order, sub-assemblies included
    const forOrder: any = run.salesOrder ? await SalesOrder.findById(run.salesOrder).select('soNumber').lean() : null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const created: any[] = [];
    const byProduct = new Map<string, any>();
    try {
      for (const p of plan) {
        const parent = p.parentProduct ? byProduct.get(p.parentProduct) : undefined;
        const wo = await WorkOrder.create({
          woNumber: await nextWoNumber(), product: p.product, bom: bomOf.get(p.product)._id, quantity: p.quantity,
          demandType: forOrder ? 'MTO' : 'MTS', ...(forOrder ? { salesOrder: forOrder._id, salesOrderRef: forOrder.soNumber } : {}), status: 'PLANNED', priority: p.itemType === 'FG' ? 'HIGH' : 'MEDIUM',
          plannedStartDate: new Date(today.getTime() + p.startOffsetDays * DAY), plannedEndDate: new Date(today.getTime() + p.endOffsetDays * DAY),
          parentWorkOrder: parent?._id, mrpRun: run._id,
        });
        byProduct.set(p.product, wo);
        created.push({ _id: wo._id, woNumber: wo.woNumber, product: p.product, itemType: p.itemType, quantity: p.quantity, parentWorkOrder: parent?.woNumber, plannedStartDate: wo.plannedStartDate, plannedEndDate: wo.plannedEndDate });
      }
    } catch (err) {
      // all-or-nothing: remove anything already created and let the user retry
      await WorkOrder.deleteMany({ _id: { $in: created.map(c => c._id) } });
      await release();
      throw err;
    }
    // order-driven work orders get their material requisition straight away: stock is reserved, and any shortage is visible
    if (forOrder) {
      for (const c of created) {
        try {
          const mrn: any = await createMrnForWorkOrder(await WorkOrder.findById(c._id), user.name, `For ${forOrder.soNumber}`);
          c.mrn = { number: mrn.number, shortfall: mrn.shortfall };
        } catch (err: any) { c.mrnError = err.message; }
      }
    }
    return NextResponse.json({ created, skipped });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
