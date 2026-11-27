import Batch from '@/models/Batch';
import Product from '@/models/Product';
import WorkOrder from '@/models/WorkOrder';
import { ACC, postJournal, revertJournal } from '@/lib/accounting';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/*
 * Cost flow (materials only; labour and overhead are not absorbed):
 *   goods received          Dr Raw material inventory   Cr Payables              (already done at inward QC)
 *   material issued to a WO Dr Work in progress          Cr Raw material inventory (at the cost of the batches issued)
 *   finished goods approved Dr Finished goods inventory  Cr Work in progress       (cost per unit = cost issued / units planned)
 *   rejected units          Dr Scrap loss                Cr Work in progress
 *   goods dispatched        Dr Cost of goods sold        Cr Finished goods inventory (at the cost of the batches dispatched)
 * A sub-assembly's cost stays in work in progress when it is issued to the parent work order, so nothing is posted for it.
 */

export type Take = { batch: any; qty: number; product: any };

/** Value of units taken from batches, at each batch's cost per unit */
export async function takeValue(takes: Take[]) {
  const batches: any[] = await Batch.find({ _id: { $in: takes.map(t => t.batch) } }).select('purchasePrice').lean();
  const cost = new Map(batches.map(b => [String(b._id), b.purchasePrice || 0]));
  return r2(takes.reduce((s, t) => s + t.qty * (cost.get(String(t.batch)) || 0), 0));
}

const typeMap = async (productIds: any[]) => new Map<string, string>((await Product.find({ _id: { $in: productIds } }).select('productType').lean() as any[]).map(p => [String(p._id), p.productType]));

/** Books the material issued to a work order: it moves from stock into work in progress. Returns the value issued. */
export async function postMaterialIssue(wo: any, takes: Take[], ref: string, createdBy?: string) {
  if (!takes.length) return 0;
  const types = await typeMap(takes.map(t => t.product));
  let fromRm = 0, fromFg = 0, fromSfg = 0;
  for (const t of takes) {
    const v = await takeValue([t]);
    const type = types.get(String(t.product));
    if (type === 'SEMI_FINISHED') fromSfg += v; else if (type === 'FINISHED_GOOD') fromFg += v; else fromRm += v;
  }
  const postable = r2(fromRm + fromFg);
  if (postable > 0) {
    await postJournal({
      description: `Material issued to ${wo.woNumber} (${ref})`, reference: ref, referenceType: 'MATERIAL_ISSUE', createdBy,
      lines: [{ acc: ACC.INV_WIP, debit: postable }, { acc: ACC.INV_RM, credit: r2(fromRm) }, { acc: ACC.INV_FG, credit: r2(fromFg) }],
    });
  }
  const total = r2(postable + fromSfg);
  if (total > 0) await WorkOrder.updateOne({ _id: wo._id }, { $inc: { materialCost: total } });
  return total;
}

const inlineScrapOf = (wo: any) => (wo?.stages || []).reduce((n: number, st: any) => n + (st.scrap || 0), 0);

/**
 * Books the outcome of a finished-goods sign-off. Returns the cost per unit of this batch (to set on the stock it creates).
 * Cost per unit = material cost not yet moved on, spread over the units that can still come out: planned units, less units already scrapped
 * on the line, less units already decided at sign-off. Pass `claimed` when this sign-off's quantity has already been added to the work order's decided totals.
 */
export async function postFinishedGoodsDetailed(wo: any, approved: number, scrap: number, isSubAssembly: boolean, ref: string, createdBy?: string, claimed = false) {
  const fresh: any = await WorkOrder.findById(wo._id).select('materialCost costTransferred fgApprovedQty fgScrapQty quantity stages').lean();
  const decidedBefore = Math.max(0, (fresh?.fgApprovedQty || 0) + (fresh?.fgScrapQty || 0) - (claimed ? approved + scrap : 0));
  const unitsLeft = Math.max((fresh?.quantity || 0) - inlineScrapOf(fresh) - decidedBefore, approved + scrap);
  const pool = Math.max(0, (fresh?.materialCost || 0) - (fresh?.costTransferred || 0));
  const unitCost = unitsLeft > 0 ? r4(pool / unitsLeft) : 0;
  const goodCost = r2(approved * unitCost), scrapCost = r2(scrap * unitCost);
  if (goodCost + scrapCost <= 0) return { unitCost, journal: null as any, transferred: 0 };
  const lines: any[] = [];
  if (!isSubAssembly && goodCost > 0) lines.push({ acc: ACC.INV_FG, debit: goodCost });
  if (scrapCost > 0) lines.push({ acc: ACC.SCRAP_LOSS, debit: scrapCost });
  const credit = r2((isSubAssembly ? 0 : goodCost) + scrapCost);
  let journal: any = null;
  if (credit > 0) {
    lines.push({ acc: ACC.INV_WIP, credit });
    journal = await postJournal({ description: `Finished goods ${wo.woNumber} (${ref})`, reference: ref, referenceType: 'FG_RECEIPT', createdBy, lines });
  }
  const transferred = r2(goodCost + scrapCost);
  await WorkOrder.updateOne({ _id: wo._id }, { $inc: { costTransferred: transferred } });
  return { unitCost, journal, transferred };
}

export async function postFinishedGoods(wo: any, approved: number, scrap: number, isSubAssembly: boolean, ref: string, createdBy?: string) {
  return (await postFinishedGoodsDetailed(wo, approved, scrap, isSubAssembly, ref, createdBy)).unitCost;
}

/**
 * Books units scrapped on the line (stage output). They have used material, so their cost leaves work in progress for scrap loss now,
 * at the cost per unit still to come out, which keeps the cost of the good units the same. `scrapBefore` is the line scrap logged before this entry.
 * Returns what was posted so it can be undone.
 */
export async function postInlineScrap(wo: any, scrap: number, scrapBefore: number, ref: string, createdBy?: string) {
  const fresh: any = await WorkOrder.findById(wo._id).select('materialCost costTransferred fgApprovedQty fgScrapQty quantity').lean();
  const decided = (fresh?.fgApprovedQty || 0) + (fresh?.fgScrapQty || 0);
  const unitsLeft = (fresh?.quantity || 0) - scrapBefore - decided;
  const pool = Math.max(0, (fresh?.materialCost || 0) - (fresh?.costTransferred || 0));
  const cost = unitsLeft > 0 ? Math.min(pool, r2(scrap * (pool / unitsLeft))) : 0;
  if (cost <= 0) return { journal: null as any, amount: 0 };
  const journal = await postJournal({
    description: `Scrap on the line ${wo.woNumber} (${ref})`, reference: ref, referenceType: 'WIP_SCRAP', createdBy,
    lines: [{ acc: ACC.SCRAP_LOSS, debit: cost }, { acc: ACC.INV_WIP, credit: cost }],
  });
  await WorkOrder.updateOne({ _id: wo._id }, { $inc: { costTransferred: cost } });
  return { journal, amount: cost };
}

/** Undoes postInlineScrap / postFinishedGoodsDetailed when a later step fails */
export async function undoWipPosting(wo: any, posted: { journal: any; amount?: number; transferred?: number }) {
  const amount = posted.amount ?? posted.transferred ?? 0;
  if (posted.journal) await revertJournal(posted.journal);
  if (amount) await WorkOrder.updateOne({ _id: wo._id }, { $inc: { costTransferred: -amount } });
}

/** Books the cost of goods that left on a delivery challan. Returns the journal (so a cancellation can reverse it) and the value. */
export async function postDispatchCost(so: any, challanNumber: string, movements: { batch: any; qty: number; product: any }[], createdBy?: string) {
  if (!movements.length) return { journal: null as any, value: 0 };
  const types = await typeMap(movements.map(m => m.product));
  let fg = 0, rm = 0;
  for (const m of movements) { const v = await takeValue([m]); if (types.get(String(m.product)) === 'RAW_MATERIAL' || types.get(String(m.product)) === 'PACKAGING') rm += v; else fg += v; }
  const value = r2(fg + rm);
  if (value <= 0) return { journal: null as any, value: 0 };
  const journal = await postJournal({
    description: `Cost of goods sold on ${challanNumber} (${so.soNumber})`, reference: challanNumber, referenceType: 'COGS',  createdBy,
    lines: [{ acc: ACC.COGS, debit: value }, { acc: ACC.INV_FG, credit: r2(fg) }, { acc: ACC.INV_RM, credit: r2(rm) }],
  });
  return { journal, value };
}

/** Reverses the cost of goods sold of a cancelled challan with an opposite entry (the original stays on record) */
export async function reverseDispatchCost(entry: any, challanNumber: string, createdBy?: string) {
  if (!entry) return null;
  const Account = (await import('@/models/Account')).default as any;
  const accounts: any[] = await Account.find({ _id: { $in: entry.lines.map((l: any) => l.account) } }).lean();
  const lines = entry.lines.map((l: any) => ({ acc: { code: accounts.find(a => String(a._id) === String(l.account))?.code }, debit: l.credit, credit: l.debit }));
  return postJournal({ description: `Reversal of cost of goods sold on cancelled ${challanNumber}`, reference: challanNumber, referenceType: 'COGS_REVERSAL', createdBy, lines });
}

export { revertJournal };
