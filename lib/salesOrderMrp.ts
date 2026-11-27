import SalesOrder from '@/models/SalesOrder';
import PurchaseIndent from '@/models/PurchaseIndent';
import RFQ from '@/models/RFQ';
import PurchaseOrder from '@/models/PurchaseOrder';
import { gatherDemandForOrder, runMRP, MRPRow } from '@/lib/mrpEngine';
import { HttpError } from '@/lib/httpError';

/** Quantities already asked for on open indents of this order that have not become a purchase order yet */
export async function openIndentQuantities(soId: any): Promise<Map<string, number>> {
  const indents: any[] = await PurchaseIndent.find({ salesOrder: soId, status: { $ne: 'REJECTED' } }).lean();
  // An awarded RFQ has become a purchase order. Once that order is live the usual pipeline counts it (or the goods are in stock, or it was cancelled), so the indent
  // no longer counts; while the order is still only a draft the pipeline does not see it yet, so the indent must keep counting.
  const rfqs: any[] = await RFQ.find({ _id: { $in: indents.map(i => i.rfq).filter(Boolean) }, purchaseOrder: { $exists: true } }).select('purchaseOrder').lean();
  const draftPos = new Set((await PurchaseOrder.find({ _id: { $in: rfqs.map(r => r.purchaseOrder) }, status: 'DRAFT' }).select('_id').lean()).map((p: any) => String(p._id)));
  const awarded = new Set(rfqs.filter(r => !draftPos.has(String(r.purchaseOrder))).map(r => String(r._id)));
  const out = new Map<string, number>();
  for (const i of indents) {
    if (i.rfq && awarded.has(String(i.rfq))) continue; // already a purchase order, which the usual pipeline counts
    for (const it of i.items || []) out.set(String(it.product), (out.get(String(it.product)) || 0) + it.quantity);
  }
  return out;
}

/** What it takes to make and ship one customer order: its own demand only, netted against free stock, what is already reserved for it, and what is already on order for it */
export async function planForSalesOrder(soId: string): Promise<{ so: any; matrix: MRPRow[]; demandCount: number }> {
  const so: any = await SalesOrder.findById(soId).lean();
  if (!so) throw new HttpError(404, 'Sales order not found.');
  if (!['DRAFT', 'APPROVED', 'IN_FULFILLMENT'].includes(so.status)) throw new HttpError(409, `A ${String(so.status).replace('_', ' ').toLowerCase()} sales order cannot be planned.`);
  const demand = gatherDemandForOrder(so);
  if (!demand.length) throw new HttpError(400, 'The order has no items to plan.');

  const ownAllocated = new Map<string, number>();
  for (const a of so.allocatedBatches || []) ownAllocated.set(String(a.product), (ownAllocated.get(String(a.product)) || 0) + (a.quantity || 0));
  const matrix = await runMRP(demand, { forOrder: String(so._id), includeReorder: false, ownAllocated, extraSupply: await openIndentQuantities(so._id) });
  return { so, matrix, demandCount: demand.length };
}
