import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import WorkOrder from '@/models/WorkOrder';
import BillOfMaterials from '@/models/BillOfMaterials';
import { jobCardOutputs, perUnit, requiredFor } from '@/lib/bom';
import MaterialRequisition from '@/models/MaterialRequisition';
import SalesOrder from '@/models/SalesOrder';
import Product from '@/models/Product';
import Machine from '@/models/Machine';
import { verifyAuth } from '@/lib/auth';

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'STAFF', 'QUALITY_INSPECTOR', 'VIEWER'];
const r4 = (n: number) => Math.round(n * 10000) / 10000;

// Everything the shop floor needs on one sheet for a work order: what to make, the material to draw, the routing stages and the order it is for
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
    await dbConnect();
    const wo: any = await WorkOrder.findById(id).lean();
    if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 });

    const [product, bom, mrn, so, machine]: any[] = await Promise.all([
      Product.findById(wo.product).select('name sku uom').lean(),
      BillOfMaterials.findById(wo.bom).lean(),
      MaterialRequisition.findOne({ workOrder: wo._id, status: { $ne: 'CANCELLED' } }).sort({ createdAt: -1 }).lean(),
      wo.salesOrder ? SalesOrder.findById(wo.salesOrder).select('soNumber customerName deliveryDate').lean() : null,
      wo.assignedMachine ? Machine.findById(wo.assignedMachine).select('name code').lean() : null,
    ]);
    const parts: any[] = bom ? await Product.find({ _id: { $in: (bom.components || []).map((c: any) => c.product) } }).select('name sku uom').lean() : [];
    const materials = (bom?.components || []).map((c: any) => {
      const p = parts.find(x => String(x._id) === String(c.product));
      const required = r4(requiredFor(bom, c, wo.quantity));
      const line = mrn?.items?.find((i: any) => String(i.product) === String(c.product));
      return { product: p?.name || String(c.product), sku: p?.sku, uom: p?.uom || c.unit, perUnit: perUnit(bom, c), wastagePercentage: c.wastagePercentage || 0, required, reserved: line?.reservedQty ?? null, issued: line?.issuedQty ?? null };
    });
    return NextResponse.json({
      woNumber: wo.woNumber, barcode: wo.woNumber, status: wo.status, priority: wo.priority, demandType: wo.demandType, quantity: wo.quantity,
      product: product ? { name: product.name, sku: product.sku, uom: product.uom } : null,
      salesOrder: so ? { soNumber: so.soNumber, customerName: so.customerName, deliveryDate: so.deliveryDate } : wo.salesOrderRef ? { soNumber: wo.salesOrderRef } : null,
      plannedStartDate: wo.plannedStartDate, plannedEndDate: wo.plannedEndDate, machine,
      bomVersion: bom?.version, materials, otherOutputs: await jobCardOutputs(bom, wo),
      requisition: mrn ? { number: mrn.number, status: mrn.status, shortfall: !!mrn.shortfall } : null,
      stages: (wo.stages || []).map((s: any) => ({ seq: s.seq, name: s.name, input: s.inQty, good: s.good, scrap: s.scrap, rework: s.rework })),
      routingSteps: (bom?.routingSteps || []).map((s: any) => ({ step: s.stepNumber, description: s.description, minutes: s.estimatedTimeMinutes })),
      fg: { received: wo.fgReceivedQty || 0, approved: wo.fgApprovedQty || 0, scrap: wo.fgScrapQty || 0, certificate: wo.fgQc?.certificateNo },
      printedBy: user.name, printedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
