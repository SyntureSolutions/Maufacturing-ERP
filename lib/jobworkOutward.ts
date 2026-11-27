import JobWorkOrder from '@/models/JobWorkOrder';
import Supplier from '@/models/Supplier';
import Product from '@/models/Product';
import Batch from '@/models/Batch';
import { nextDocNumber } from '@/lib/docNumber';
import { assertPeriodOpen } from '@/lib/accounting';
import { returnDeadline } from '@/lib/jobwork';
import { HttpError } from '@/lib/httpError';

export interface OutwardPlan {
  supplier: any;
  goodsType: 'INPUT' | 'CAPITAL';
  date: Date;
  plans: { product: any; qty: number; allocations: { batch: any; quantity: number; price: number }[]; value: number }[];
  totalValue: number;
}

/** Validates an outward job-work request and works out which stock would be sent and its value. Changes nothing. */
export async function planOutward(b: any): Promise<OutwardPlan> {
  await assertPeriodOpen('INVENTORY');
  const supplier: any = await Supplier.findById(b.party);
  if (!supplier) throw new HttpError(400, 'Select a subcontractor.');
  if (!String(b.natureOfJob || '').trim()) throw new HttpError(400, 'Nature of job work is required on the challan.');
  const lines = (b.items || []).filter((i: any) => i.product && Number(i.quantity) > 0);
  if (!lines.length) throw new HttpError(400, 'Add at least one item to send.');

  const plans: OutwardPlan['plans'] = [];
  for (const l of lines) {
    const product: any = await Product.findById(l.product);
    if (!product) throw new HttpError(400, 'Product not found.');
    const batches = await Batch.find({ product: l.product, qualityStatus: 'APPROVED', currentQuantity: { $gt: 0 }, store: { $nin: ['QUARANTINE', 'SCRAP'] } }).sort({ expiryDate: 1 });
    let need = Number(l.quantity);
    const allocations: OutwardPlan['plans'][number]['allocations'] = [];
    for (const batch of batches) {
      if (need <= 0) break;
      const take = Math.min(batch.currentQuantity - batch.allocatedQuantity, need);
      if (take > 0) { allocations.push({ batch, quantity: take, price: batch.purchasePrice }); need -= take; }
    }
    if (need > 1e-9) throw new HttpError(409, `Not enough free approved stock of ${product.name} (short by ${need}).`);
    plans.push({ product, qty: Number(l.quantity), allocations, value: Number(l.value) || allocations.reduce((s, a) => s + a.quantity * a.price, 0) });
  }
  const goodsType = b.goodsType === 'CAPITAL' ? 'CAPITAL' : 'INPUT';
  return { supplier, goodsType, date: b.date ? new Date(b.date) : new Date(), plans, totalValue: Math.round(plans.reduce((s, p) => s + p.value, 0) * 100) / 100 };
}

/** Deducts the planned stock and issues the challan */
export async function commitOutward(plan: OutwardPlan, b: any, actorName?: string, approvalRef?: string) {
  // deduct atomically per batch (only if the stock is still there), and put it all back if anything fails
  const taken: { batch: any; quantity: number }[] = [];
  try {
    for (const p of plan.plans) {
      for (const a of p.allocations) {
        const res = await Batch.updateOne({ _id: a.batch._id, $expr: { $gte: [{ $subtract: ['$currentQuantity', '$allocatedQuantity'] }, a.quantity - 1e-9] } }, { $inc: { currentQuantity: -a.quantity } });
        if (!res.modifiedCount) throw new HttpError(409, `Stock of ${p.product.name} changed while issuing; please try again.`);
        taken.push(a);
      }
    }
    return await createOutwardJob(plan, b, actorName, approvalRef);
  } catch (err) {
    for (const t of taken) await Batch.updateOne({ _id: t.batch._id }, { $inc: { currentQuantity: t.quantity } });
    throw err;
  }
}

async function createOutwardJob(plan: OutwardPlan, b: any, actorName?: string, approvalRef?: string) {
  return JobWorkOrder.create({
    kind: 'OUTWARD', number: await nextDocNumber(JobWorkOrder, 'A', 'number'), party: plan.supplier._id, partyName: plan.supplier.name, partyGstin: plan.supplier.gstin,
    date: plan.date, goodsType: plan.goodsType, natureOfJob: String(b.natureOfJob).trim(), dueDate: returnDeadline(plan.goodsType, plan.date), vehicleNo: b.vehicleNo,
    outputProduct: b.outputProduct || undefined, expectedOutputQty: Number(b.expectedOutputQty) || undefined, createdBy: actorName, approvalRef,
    items: plan.plans.map(p => ({ product: p.product._id, description: p.product.name, hsnCode: p.product.hsnCode, quantity: p.qty, uom: p.product.uom, value: Math.round(p.value * 100) / 100,
      allocations: p.allocations.map(a => ({ batch: a.batch._id, quantity: a.quantity, price: a.price })) })),
  });
}
