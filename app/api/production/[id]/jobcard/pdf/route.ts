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
import CompanySettings from '@/models/CompanySettings';
import { verifyAuth } from '@/lib/auth';
import { jobCardSpec } from '@/lib/printDocs';
import { buildPrintPdf } from '@/lib/printLayout';
import { safeFileName } from '@/lib/documentPdf';

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'STAFF', 'QUALITY_INSPECTOR', 'VIEWER'];
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await context.params;
    await dbConnect();

    let wo: any = null;
    if (mongoose.isValidObjectId(id)) {
      wo = await WorkOrder.findById(id).lean();
    }
    if (!wo) {
      wo = await WorkOrder.findOne({ woNumber: id }).lean();
    }
    if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 });

    let jobCard: any = null;

    if (wo) {
      const productPromise = (typeof wo.product === 'object' && wo.product !== null && wo.product.name)
        ? Promise.resolve(wo.product)
        : (mongoose.isValidObjectId(wo.product) ? Product.findById(wo.product).select('name sku uom').lean() : Promise.resolve(null));

      const bomPromise = mongoose.isValidObjectId(wo.bom) ? BillOfMaterials.findById(wo.bom).lean() : Promise.resolve(null);
      const mrnPromise = mongoose.isValidObjectId(wo._id) ? MaterialRequisition.findOne({ workOrder: wo._id, status: { $ne: 'CANCELLED' } }).sort({ createdAt: -1 }).lean() : Promise.resolve(null);
      const soPromise = (typeof wo.salesOrder === 'object' && wo.salesOrder !== null)
        ? Promise.resolve(wo.salesOrder)
        : (mongoose.isValidObjectId(wo.salesOrder) ? SalesOrder.findById(wo.salesOrder).select('soNumber customerName deliveryDate').lean() : Promise.resolve(null));
      const machinePromise = (typeof wo.assignedMachine === 'object' && wo.assignedMachine !== null)
        ? Promise.resolve(wo.assignedMachine)
        : (mongoose.isValidObjectId(wo.assignedMachine) ? Machine.findById(wo.assignedMachine).select('name code').lean() : Promise.resolve(null));

      const [product, bom, mrn, so, machine]: any[] = await Promise.all([
        productPromise,
        bomPromise,
        mrnPromise,
        soPromise,
        machinePromise,
      ]);

      const parts: any[] = bom ? await Product.find({ _id: { $in: (bom.components || []).map((c: any) => c.product) } }).select('name sku uom').lean() : [];
      const materials = (bom?.components || []).map((c: any) => {
        const p = parts.find(x => String(x._id) === String(c.product));
        const required = r4(requiredFor(bom, c, wo.quantity || 1));
        const line = mrn?.items?.find((i: any) => String(i.product) === String(c.product));
        return {
          product: p?.name || String(c.product),
          sku: p?.sku,
          uom: p?.uom || c.unit,
          perUnit: perUnit(bom, c),
          wastagePercentage: c.wastagePercentage || 0,
          required,
          reserved: line?.reservedQty ?? null,
          issued: line?.issuedQty ?? null
        };
      });

      jobCard = {
        woNumber: wo.woNumber,
        status: wo.status,
        priority: wo.priority,
        demandType: wo.demandType,
        quantity: wo.quantity,
        product,
        salesOrder: so,
        salesOrderRef: wo.salesOrderRef,
        plannedStartDate: wo.plannedStartDate,
        plannedEndDate: wo.plannedEndDate,
        machine,
        materials,
        otherOutputs: await jobCardOutputs(bom, wo),
        stages: wo.stages || [],
      };
    }

    const company: any = await CompanySettings.findOne({ key: 'company' }).lean();
    const pdf = await buildPrintPdf(jobCardSpec(jobCard), company || {});
    const isDownload = req.nextUrl.searchParams.get('download') === '1';
    const disposition = isDownload ? 'attachment' : 'inline';

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${safeFileName(`JobCard_${jobCard.woNumber}`)}"`,
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
