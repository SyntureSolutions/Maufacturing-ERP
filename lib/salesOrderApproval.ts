import SalesOrder from '@/models/SalesOrder';
import { allocateUpTo, deallocateStock } from '@/lib/allocation';
import Product from '@/models/Product';
import { logAuditEvent } from '@/lib/audit';
import { HttpError } from '@/lib/httpError';

/** Approves a draft sales order and reserves batch stock (earliest expiry first). */
export async function approveSalesOrder(soId: string, actor: { id?: string; name: string; role: string }) {
  const found: any = await SalesOrder.findById(soId).select('status').lean();
  if (!found) throw new HttpError(404, 'Sales Order not found');
  // Claim the approval first, so two people approving at once reserve stock once
  const so: any = await SalesOrder.findOneAndUpdate({ _id: soId, status: 'DRAFT' }, { status: 'APPROVED', approvalPending: false }, { new: true });
  if (!so) throw new HttpError(400, `Sales Order is already in status '${found.status}'`);

  // Reserve what is in stock, earliest expiry first. A partly covered order keeps what could be reserved; the rest is reported as a shortfall.
  const allAllocations: any[] = [];
  const shortfall: { product: any; quantity: number }[] = [];
  try {
    for (const item of so.items) {
      if (!item.product) continue;
      const { allocations, short } = await allocateUpTo(item.product.toString(), item.quantity);
      for (const alloc of allocations) allAllocations.push({ batch: alloc.batchId, product: item.product, quantity: alloc.quantity });
      if (short > 1e-9) shortfall.push({ product: item.product, quantity: Math.round(short * 10000) / 10000 });
    }
    await SalesOrder.updateOne({ _id: so._id }, { allocatedBatches: allAllocations, allocationShortfall: shortfall });
  } catch (err) {
    // give the reservations back and reopen the order for approval
    await deallocateStock(allAllocations.map(a => ({ batchId: String(a.batch), quantity: a.quantity }))).catch(() => {});
    await SalesOrder.updateOne({ _id: so._id }, { status: 'DRAFT', allocatedBatches: [], allocationShortfall: [] }).catch(() => {});
    throw err;
  }
  so.allocatedBatches = allAllocations;
  let allocationWarning: string | null = null;
  if (shortfall.length) {
    const names = new Map<string, string>((await Product.find({ _id: { $in: shortfall.map(x => x.product) } }).select('name').lean() as any[]).map(p => [String(p._id), p.name]));
    allocationWarning = `Stock shortfall detected: ${shortfall.map(x => `${x.quantity} short of ${names.get(String(x.product)) || x.product}`).join(', ')}. Run planning for this order to cover it.`;
  }

  await logAuditEvent({
    userId: actor.id, userName: actor.name, userRole: actor.role, action: 'APPROVE', resource: 'SALES_ORDER', resourceId: so._id.toString(), resourceName: so.soNumber || soId,
    details: `Sales Order APPROVED. FEFO batch stock allocated.${allocationWarning ? ' Warning: ' + allocationWarning : ''}`,
  }).catch(() => {});
  return { so, allocationWarning };
}
