import mongoose from 'mongoose';
import Batch from '../models/Batch';
import { USABLE_STOCK } from './stockRules';

export interface Allocation {
  batchId: string;
  quantity: number;
}

/**
 * First Expiry First Out (FEFO) Allocation Logic
 * @param productId The ID of the product to allocate
 * @param requestedQuantity The total quantity needed
 * @returns Array of allocations (batchId and quantity)
 */
export async function allocateStock(
  productId: string,
  requestedQuantity: number
): Promise<Allocation[]> {
  // 1. Find all active batches for the product, sorted by expiry date
  // We only care about batches with available stock (current - allocated > 0)
  // And that are NOT expired
  const now = new Date();
  
  // QC HARD GATE: only QC-approved stock that has left the quarantine bay (see lib/stockRules.ts) can be reserved.
  const batches = await Batch.find({
    product: productId,
    expiryDate: { $gt: now },
    ...USABLE_STOCK,
    $expr: { $gt: [{ $subtract: ['$currentQuantity', '$allocatedQuantity'] }, 0] }
  }).sort({ expiryDate: 1 });

  let remainingToAllocate = requestedQuantity;
  const allocations: Allocation[] = [];

  for (const batch of batches) {
    if (remainingToAllocate <= 0) break;

    const availableInBatch = batch.currentQuantity - batch.allocatedQuantity;
    const allocationAmount = Math.min(availableInBatch, remainingToAllocate);

    if (allocationAmount > 0) {
      allocations.push({
        batchId: (batch._id as mongoose.Types.ObjectId).toString(),
        quantity: allocationAmount,
      });

      // Update the batch's allocated quantity in the database
      // USING $inc for atomic updates to prevent race conditions
      await Batch.findByIdAndUpdate(batch._id, {
        $inc: { allocatedQuantity: allocationAmount }
      });

      remainingToAllocate -= allocationAmount;
    }
  }

  if (remainingToAllocate > 0) {
    // If we couldn't fulfill the whole order, we should probably roll back 
    // or handle this at a higher level. For now, we'll throw an error
    // so the transaction (if any) can be reversed.
    
    // ROLLBACK: Decrement what we just incremented
    for (const alloc of allocations) {
      await Batch.findByIdAndUpdate(alloc.batchId, {
        $inc: { allocatedQuantity: -alloc.quantity }
      });
    }
    
    throw new Error(`Insufficient stock for product ${productId}. Shortfall: ${remainingToAllocate}`);
  }

  return allocations;
}

/**
 * Reverses an allocation (e.g., if an order is cancelled)
 */
export async function deallocateStock(allocations: Allocation[]) {
  for (const alloc of allocations) {
    await Batch.findByIdAndUpdate(alloc.batchId, {
      $inc: { allocatedQuantity: -alloc.quantity }
    });
  }
}

/**
 * Finalizes an allocation (e.g., when stock is shipped)
 * This subtracts both allocatedQuantity AND currentQuantity
 */
export async function finalizeAllocation(allocations: Allocation[]) {
  for (const alloc of allocations) {
    await Batch.findByIdAndUpdate(alloc.batchId, {
      $inc: { 
        allocatedQuantity: -alloc.quantity,
        currentQuantity: -alloc.quantity
      }
    });
  }
}

/**
 * Like allocateStock, but reserves as much as is available instead of failing: a partly covered order still gets what can be given to it now.
 * Returns what was reserved (possibly nothing) and how much is still short.
 */
export async function allocateUpTo(productId: string, requestedQuantity: number): Promise<{ allocations: Allocation[]; short: number }> {
  const now = new Date();
  const batches = await Batch.find({
    product: productId,
    expiryDate: { $gt: now },
    ...USABLE_STOCK,
    $expr: { $gt: [{ $subtract: ['$currentQuantity', '$allocatedQuantity'] }, 0] }
  }).sort({ expiryDate: 1 });

  let remaining = requestedQuantity;
  const allocations: Allocation[] = [];
  for (const batch of batches) {
    if (remaining <= 1e-9) break;
    const take = Math.min(batch.currentQuantity - batch.allocatedQuantity, remaining);
    if (take <= 0) continue;
    // guarded: only reserve if that much is still free, so two approvals at once cannot take the same units
    const res = await Batch.updateOne({ _id: batch._id, $expr: { $gte: [{ $subtract: ['$currentQuantity', '$allocatedQuantity'] }, take - 1e-9] } }, { $inc: { allocatedQuantity: take } });
    if (!res.modifiedCount) continue;
    allocations.push({ batchId: (batch._id as mongoose.Types.ObjectId).toString(), quantity: take });
    remaining = Math.round((remaining - take) * 10000) / 10000;
  }
  return { allocations, short: Math.max(0, remaining) };
}
