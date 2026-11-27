import Batch from '@/models/Batch';
import GRN from '@/models/GRN';

/**
 * One definition of "stock you may use": QC-approved, and not sitting in the quarantine bay or the scrap store.
 * Sales allocation, material reservation (MRN), planning (MRP) and dispatch all filter with this, so a batch is either stock for all of them or for none.
 * Goods accepted at the gate stay in QUARANTINE until put-away, so they are not usable yet.
 */
export const USABLE_STOCK = { qualityStatus: 'APPROVED', store: { $nin: ['QUARANTINE', 'SCRAP'] } } as const;

export function isUsableBatch(b: { qualityStatus?: string; store?: string } | null | undefined) {
  return !!b && b.qualityStatus === 'APPROVED' && b.store !== 'QUARANTINE' && b.store !== 'SCRAP';
}

export type QcOutcome = { changed: boolean; status?: string; reason?: string };

/**
 * A Quality-module check result reaching a batch. The inward GRN inspection is the only thing that can approve or reject goods at the gate,
 * and a batch it rejected or scrapped stays that way. The Quality module can:
 *  - approve a batch that is waiting (PENDING_QC) or on hold, if it is not an uninspected GRN batch and not scrapped
 *  - put an approved batch ON_HOLD when a later check fails (stock is held for disposition, not silently called rejected)
 * It never flips REJECTED back to approved, and never touches scrapped stock.
 */
export async function applyCheckToBatch(batchId: any, checkStatus: 'PASSED' | 'FAILED', checkId: any): Promise<QcOutcome> {
  const batch: any = await Batch.findById(batchId).lean();
  if (!batch) return { changed: false, reason: 'Batch not found.' };
  await Batch.updateOne({ _id: batch._id }, { $addToSet: { qualityChecks: checkId } });

  if (batch.store === 'SCRAP') return { changed: false, status: batch.qualityStatus, reason: 'The batch was scrapped at inward inspection; a check cannot change it.' };

  if (checkStatus === 'PASSED') {
    if (batch.qualityStatus === 'APPROVED') return { changed: false, status: 'APPROVED' };
    if (batch.qualityStatus === 'REJECTED') return { changed: false, status: 'REJECTED', reason: 'The batch was rejected; a passing check cannot reverse that. Raise a new inward decision or an NCR disposition.' };
    if (batch.grn) {
      const grn: any = await GRN.findById(batch.grn).lean();
      const line = grn?.items?.find((i: any) => String(i.batch) === String(batch._id));
      if (!line || line.inspection === 'PENDING') return { changed: false, status: batch.qualityStatus, reason: 'This delivery has not been inspected at the gate yet. Inspect the GRN to accept it.' };
      if (!(line.acceptedQty > 0)) return { changed: false, status: batch.qualityStatus, reason: 'Nothing from this delivery was accepted at the gate.' };
    }
    const r = await Batch.updateOne({ _id: batch._id, qualityStatus: { $in: ['PENDING_QC', 'ON_HOLD'] }, store: { $ne: 'SCRAP' } }, { $set: { qualityStatus: 'APPROVED' } });
    return r.modifiedCount ? { changed: true, status: 'APPROVED' } : { changed: false, status: batch.qualityStatus, reason: 'The batch changed while the check was saved.' };
  }

  // FAILED
  if (batch.qualityStatus === 'REJECTED' || batch.qualityStatus === 'ON_HOLD') return { changed: false, status: batch.qualityStatus };
  if (batch.qualityStatus === 'PENDING_QC' && batch.grn) return { changed: false, status: 'PENDING_QC', reason: 'Not yet inspected at the gate; reject it there so the books and the vendor return follow.' };
  const r = await Batch.updateOne({ _id: batch._id, qualityStatus: { $in: ['APPROVED', 'PENDING_QC'] } }, { $set: { qualityStatus: 'ON_HOLD' } });
  return r.modifiedCount ? { changed: true, status: 'ON_HOLD' } : { changed: false, status: batch.qualityStatus };
}
