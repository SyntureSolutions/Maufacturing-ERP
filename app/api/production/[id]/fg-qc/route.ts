import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import WorkOrder from '@/models/WorkOrder';
import Batch from '@/models/Batch';
import ScrapEntry from '@/models/ScrapEntry';
import Product from '@/models/Product';
import { verifyAuth } from '@/lib/auth';
import { assertPeriodOpen } from '@/lib/accounting';
import { postFinishedGoodsDetailed, undoWipPosting } from '@/lib/costing';
import mongoose from 'mongoose';
import { statusOf } from '@/lib/httpError';

// Mandatory pre-dispatch FG sign-off. Approved units enter the Finished Goods store; rejects go to FG scrap.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'QUALITY_INSPECTOR'].includes(user.role)) return NextResponse.json({ error: 'Only a quality inspector can sign off finished goods.' }, { status: 403 });
    const { id } = await params;
    const b = await req.json();
    const approved = Number(b.approvedQty) || 0, scrap = Number(b.scrapQty) || 0;
    const signature = String(b.signature || '').trim();
    if (approved < 0 || scrap < 0 || approved + scrap <= 0) return NextResponse.json({ error: 'Enter approved and/or rejected quantities.' }, { status: 400 });
    if (!signature) return NextResponse.json({ error: 'Inspector digital signature (typed name) is required.' }, { status: 400 });

    await dbConnect();
    await assertPeriodOpen('INVENTORY');
    await assertPeriodOpen('ACCOUNTING');
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 });
    const wo: any = await WorkOrder.findById(id);
    if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 });
    if (scrap > 0 && !String(b.reason || '').trim()) return NextResponse.json({ error: 'Add a reason for rejected units.' }, { status: 400 });
    const pendingNow = (wo.fgReceivedQty || 0) - (wo.fgApprovedQty || 0) - (wo.fgScrapQty || 0);
    if (approved + scrap > pendingNow + 1e-6) return NextResponse.json({ error: `Only ${pendingNow} finished unit(s) are awaiting inspection.` }, { status: 409 });

    const product: any = await Product.findById(wo.product).select('productType').lean();
    const isSubAssembly = product?.productType === 'SEMI_FINISHED';

    // Claim the units first, in one guarded update: two sign-offs at once cannot both take the same pending units.
    // Everything after that is undone if a later step fails, so a sign-off is never half recorded.
    const claimed = await WorkOrder.updateOne(
      { _id: wo._id, $expr: { $lte: [{ $add: [{ $ifNull: ['$fgApprovedQty', 0] }, { $ifNull: ['$fgScrapQty', 0] }, approved + scrap] }, { $add: [{ $ifNull: ['$fgReceivedQty', 0] }, 1e-6] }] } },
      { $inc: { fgApprovedQty: approved, fgScrapQty: scrap } },
    );
    if (!claimed.modifiedCount) return NextResponse.json({ error: 'Those finished units were just signed off by someone else. Reload and check what is still pending.' }, { status: 409 });
    const undo: (() => Promise<any>)[] = [() => WorkOrder.updateOne({ _id: wo._id }, { $inc: { fgApprovedQty: -approved, fgScrapQty: -scrap } })];

    let batch: any = null;
    try {
      // book the cost first (material in work in progress moves to finished goods or scrap); the batch then carries that cost per unit
      const posted = await postFinishedGoodsDetailed(wo, approved, scrap, isSubAssembly, `${wo.woNumber} QC`, user.id, true);
      if (posted.journal || posted.transferred) undo.push(() => undoWipPosting(wo, posted));
      if (approved > 0) {
        const prefix = isSubAssembly ? 'SF' : 'FG';
        const mfg = new Date();
        batch = await createBatchNumbered(prefix, wo.woNumber, (batchNumber) => Batch.create({
          product: wo.product, batchNumber, manufacturingDate: mfg,
          expiryDate: new Date(mfg.getFullYear() + 5, mfg.getMonth(), mfg.getDate()),
          initialQuantity: approved, currentQuantity: approved, purchasePrice: posted.unitCost, store: isSubAssembly ? 'SFG' : 'FG', location: isSubAssembly ? 'SFG' : 'FG', qualityStatus: 'APPROVED',
        }));
        undo.push(() => Batch.deleteOne({ _id: batch._id }));
      }
      if (scrap > 0) {
        const entry = await ScrapEntry.create({ store: 'FG_SCRAP', workOrder: wo._id, woNumber: wo.woNumber, stageName: 'Final FG QC', product: wo.product, quantity: scrap, reason: b.reason, operator: user.name });
        undo.push(() => ScrapEntry.deleteOne({ _id: entry._id }));
      }

      const after: any = await WorkOrder.findById(wo._id).select('fgApprovedQty fgScrapQty fgReceivedQty fgQc woNumber').lean();
      const decided = after.fgApprovedQty + after.fgScrapQty >= (after.fgReceivedQty || 0);
      const certificateNo = after.fgQc?.certificateNo || `IC-${wo.woNumber}-${Date.now().toString().slice(-5)}`;
      const set: any = {
        fgQc: {
          status: decided ? (after.fgApprovedQty === 0 ? 'FAILED' : after.fgScrapQty > 0 ? 'PARTIAL' : 'PASSED') : 'PENDING',
          inspector: user.name, signature, certificateNo, at: new Date(),
          checks: (b.checks || []).map((c: any) => ({ name: c.name, standard: c.standard, actual: c.actual, result: c.result === 'FAIL' ? 'FAIL' : 'PASS' })),
        },
      };
      if (decided) { set.qcStatus = after.fgApprovedQty > 0 ? 'PASSED' : 'FAILED'; set.qcGatePassed = after.fgApprovedQty > 0; }
      await WorkOrder.updateOne({ _id: wo._id }, { $set: set });
    } catch (err) {
      for (const u of undo.reverse()) await u().catch(() => {});
      throw err;
    }
    return NextResponse.json({ workOrder: await WorkOrder.findById(wo._id), batch });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}

/** Creates a batch under the next free number for this work order; a clash with a simultaneous sign-off just takes the next number */
async function createBatchNumbered(prefix: string, woNumber: string, make: (batchNumber: string) => Promise<any>) {
  for (let i = 0; ; i++) {
    const count = await Batch.countDocuments({ batchNumber: new RegExp(`^${prefix}-${woNumber}-`) });
    try { return await make(`${prefix}-${woNumber}-${count + 1 + i}`); } catch (e: any) { if (e?.code !== 11000 || i >= 6) throw e; }
  }
}
