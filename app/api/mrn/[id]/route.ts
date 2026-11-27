import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import MaterialRequisition from '@/models/MaterialRequisition';
import Product from '@/models/Product';
import { assertPeriodOpen } from '@/lib/accounting';
import { verifyAuth } from '@/lib/auth';
import { reserveMore, releaseMrn, takeReservedStock } from '@/lib/mrn';
import { HttpError, statusOf } from '@/lib/httpError';
import { postMaterialIssue } from '@/lib/costing';
import { assertPeriodOpen as assertOpen } from '@/lib/accounting';
import WorkOrder from '@/models/WorkOrder';

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'SUPPLY_CHAIN_MANAGER', 'STAFF'];

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'You do not have permission to change material requisitions.' }, { status: 403 });
    const { id } = await context.params;
    const { action, scans } = await req.json();

    await dbConnect();
    // one change at a time on a requisition: a second click or a second user waits for a retry instead of issuing the same stock twice
    const locked = await MaterialRequisition.findOneAndUpdate({ _id: id, issueLock: { $ne: true } }, { $set: { issueLock: true } }, { new: false });
    if (!locked) {
      if (!(await MaterialRequisition.exists({ _id: id }))) return NextResponse.json({ error: 'MRN not found.' }, { status: 404 });
      return NextResponse.json({ error: 'This requisition is being changed by someone else. Try again in a moment.' }, { status: 409 });
    }
    try {
    const mrn = await MaterialRequisition.findById(id);
    if (!mrn) return NextResponse.json({ error: 'MRN not found.' }, { status: 404 });
    if (['ISSUED', 'CANCELLED'].includes(mrn.status)) return NextResponse.json({ error: `MRN is ${mrn.status}.` }, { status: 409 });

    if (action === 'issue') {
      await assertPeriodOpen('INVENTORY');
      // Storekeeper must scan (or type) the SKU / barcode of every item being handed over
      const products: any[] = await Product.find({ _id: { $in: mrn.items.map((i: any) => i.product) } }).select('sku barcode name').lean();
      const scanned = new Set((Array.isArray(scans) ? scans : []).map((s: any) => String(s).trim().toUpperCase()).filter(Boolean));
      const missing = mrn.items.filter((i: any) => i.reservedQty - i.issuedQty > 0).map((i: any) => products.find(p => String(p._id) === String(i.product))).filter((p: any) => p && !scanned.has(String(p.sku).toUpperCase()) && !(p.barcode && scanned.has(String(p.barcode).toUpperCase())));
      if (missing.length) return NextResponse.json({ error: `Scan to confirm: ${missing.map((p: any) => p.name).join(', ')}` }, { status: 400 });
      await assertOpen('ACCOUNTING');
      // Storekeeper issues the reserved quantities, from the batches that were reserved for this requisition
      const { takes, rollback } = await takeReservedStock(mrn);
      // the material moves from stock into work in progress at the cost of the batches issued; undo the issue if that cannot be booked
      try {
        const wo: any = await WorkOrder.findById(mrn.workOrder).select('woNumber').lean();
        await postMaterialIssue(wo || { _id: mrn.workOrder, woNumber: String(mrn.workOrder) }, takes, mrn.number, user.id);
      } catch (err) {
        await rollback();
        throw err;
      }
      mrn.status = mrn.items.every((i: any) => i.issuedQty >= i.requiredQty) ? 'ISSUED' : 'PARTIALLY_ISSUED';
    } else if (action === 'reserve') {
      // pick up stock that arrived after the MRN was raised
      if (mrn.status !== 'RESERVED') return NextResponse.json({ error: 'Only an unissued MRN can be topped up.' }, { status: 409 });
      await reserveMore(mrn);
      return NextResponse.json(mrn);
    } else if (action === 'cancel') {
      if (mrn.status !== 'RESERVED') return NextResponse.json({ error: 'Only an unissued MRN can be cancelled.' }, { status: 409 });
      await releaseMrn(mrn);
      return NextResponse.json(await MaterialRequisition.findById(id));
    } else {
      return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
    }
    await mrn.save();
    return NextResponse.json(mrn);
    } finally {
      await MaterialRequisition.updateOne({ _id: id }, { $set: { issueLock: false } });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
