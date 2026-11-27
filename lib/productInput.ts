import { HttpError } from '@/lib/httpError';
import { tcsFields } from '@/lib/tcs';

/** The product fields a request may set. Anything else in the body (ids, timestamps, fields added later) is ignored. */
export const PRODUCT_FIELDS = [
  'name', 'description', 'sku', 'category', 'uom', 'barcode', 'image', 'productType', 'hsnCode', 'gstRate',
  'minStockLevel', 'price', 'purchasePrice', 'minSellingPrice', 'grossWeight', 'netWeight', 'oemName', 'oemPartNumber', 'bomId',
  'plant', 'mrpType', 'safetyStock', 'plannedDeliveryDays', 'storageBin', 'batchManaged', 'valuationClass', 'priceControl', 'isActive',
  'remarks', 'deactivatedFrom', 'stockType', 'includeInValuation', 'isScrap', 'rackNo', 'salesUom', 'salesConversion', 'purchaseUom', 'purchaseConversion',
  'salesAccount', 'purchaseAccount', 'hsnDescription', 'tcsGoods', 'tcsRate',
] as const;

export function productFields(body: any): Record<string, any> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Send the product fields as a JSON object.');
  const out: Record<string, any> = {};
  for (const f of PRODUCT_FIELDS) if (body[f] !== undefined) out[f] = body[f];
  checkDetails(out);
  Object.assign(out, tcsFields(out));
  return out;
}

/** The item master details: unit conversions above zero, a known stock type, a real date. */
function checkDetails(p: Record<string, any>) {
  for (const [k, label] of [['salesConversion', 'Sales'], ['purchaseConversion', 'Purchase']] as const) {
    if (p[k] === undefined) continue;
    if (p[k] === null || p[k] === '') { p[k] = 1; continue; } // blank means one stock unit per unit
    const n = Number(p[k]);
    if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, `${label} conversion must be a number more than zero (stock units in one ${label.toLowerCase()} unit).`);
    p[k] = n;
  }
  if (p.stockType !== undefined && !['STOCKABLE', 'NON_STOCK'].includes(p.stockType)) throw new HttpError(400, 'Stock type must be STOCKABLE or NON_STOCK.');
  if (p.deactivatedFrom === '') p.deactivatedFrom = null;
  else if (p.deactivatedFrom != null && isNaN(+new Date(p.deactivatedFrom))) throw new HttpError(400, 'Inactive-from is not a valid date.');
}

/** A sales or purchase ledger named on an item must be an account in the chart of accounts. */
export async function checkLedgers(p: Record<string, any>) {
  const codes = [p.salesAccount, p.purchaseAccount].filter(c => c != null && String(c).trim() !== '').map(c => String(c).trim());
  if (!codes.length) return;
  const { default: Account } = await import('@/models/Account');
  const found = new Set((await Account.find({ code: { $in: codes } }).select('code').lean()).map((a: any) => a.code));
  const missing = codes.filter(c => !found.has(c));
  if (missing.length) throw new HttpError(400, `Ledger ${missing.join(', ')} is not in the chart of accounts.`);
}

/** Net weight cannot be more than gross weight, checked on what the product will hold after the change. */
export function checkWeights(existing: { grossWeight?: number | null; netWeight?: number | null } | null, change: Record<string, any>) {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(change, k);
  const gross = has('grossWeight') ? change.grossWeight : existing?.grossWeight;
  const net = has('netWeight') ? change.netWeight : existing?.netWeight;
  if (gross != null && net != null && Number(net) > Number(gross)) throw new HttpError(400, 'Net weight cannot be more than gross weight.');
}
