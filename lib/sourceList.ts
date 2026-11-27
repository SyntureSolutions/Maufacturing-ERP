import mongoose from 'mongoose';
import SourceList from '@/models/SourceList';
import Product from '@/models/Product';
import Supplier from '@/models/Supplier';
import { HttpError } from '@/lib/httpError';

export const SOURCE_LIST_ROLES = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER'];

const validOn = (date: Date) => ({ validFrom: { $lte: date }, validTo: { $gte: date } });
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/**
 * Refuses a purchase from `supplierId` for any product whose source list (valid on `date`) does not allow it.
 * A product with no source list entry valid on that date can be bought from anyone.
 */
export async function assertSupplierAllowed(productIds: any[], supplierId: any, date = new Date()) {
  const ids = [...new Set(productIds.map(String))];
  const entries: any[] = await SourceList.find({ product: { $in: ids }, ...validOn(startOfDay(date)) }).lean();
  for (const product of ids) {
    const mine = entries.filter(e => String(e.product) === product);
    if (!mine.length) continue;
    const entry = mine.find(e => String(e.supplier) === String(supplierId));
    if (entry?.blocked || !entry) {
      const p: any = await Product.findById(product).select('sku name').lean();
      const allowed = mine.filter(e => !e.blocked).map(e => String(e.supplier));
      const names = (await Supplier.find({ _id: { $in: allowed } }).select('name').lean()).map((s: any) => s.name);
      throw new HttpError(409, entry?.blocked
        ? `${p?.sku || 'This product'}: the supplier is blocked on the source list.`
        : `${p?.sku || 'This product'} may only be bought from the suppliers on its source list${names.length ? ` (${names.join(', ')})` : ''}.`);
    }
  }
}

/** The fixed, unblocked supplier for each product on `date`, for planning to propose on requisitions. */
export async function fixedSuppliers(productIds: any[], date = new Date()) {
  const entries: any[] = await SourceList.find({ product: { $in: productIds.map(String) }, fixed: true, blocked: false, mrpRelevant: true, ...validOn(startOfDay(date)) }).lean();
  return new Map(entries.map(e => [String(e.product), e.supplier]));
}

/** Cleans a source list entry from a request and checks it does not clash with another one for the same product. */
export async function sourceListEntry(b: any, existing?: any) {
  const pick = (k: string) => (b[k] !== undefined ? b[k] : existing?.[k]);
  const product = pick('product'), supplier = pick('supplier');
  if (!mongoose.isValidObjectId(String(product))) throw new HttpError(400, 'Choose a product.');
  if (!mongoose.isValidObjectId(String(supplier))) throw new HttpError(400, 'Choose a supplier.');
  if (!(await Product.exists({ _id: product }))) throw new HttpError(400, 'That product does not exist.');
  if (!(await Supplier.exists({ _id: supplier }))) throw new HttpError(400, 'That supplier does not exist.');
  const validFrom = startOfDay(new Date(pick('validFrom')));
  const validTo = startOfDay(new Date(pick('validTo')));
  if (isNaN(+validFrom) || isNaN(+validTo)) throw new HttpError(400, 'Enter valid-from and valid-to dates.');
  if (validTo < validFrom) throw new HttpError(400, 'Valid-to cannot be before valid-from.');
  const data = {
    product, supplier, validFrom, validTo,
    plant: pick('plant') || undefined, purchasingOrg: pick('purchasingOrg') || undefined, notes: pick('notes'),
    fixed: Boolean(pick('fixed')), blocked: Boolean(pick('blocked')), mrpRelevant: pick('mrpRelevant') === undefined ? true : Boolean(pick('mrpRelevant')),
  };
  if (data.fixed && data.blocked) throw new HttpError(400, 'A blocked supplier cannot be the fixed source.');

  const overlapping = { product, _id: { $ne: existing?._id }, validFrom: { $lte: validTo }, validTo: { $gte: validFrom } };
  if (await SourceList.exists({ ...overlapping, supplier })) throw new HttpError(409, 'This supplier is already on the source list for an overlapping period.');
  if (data.fixed && await SourceList.exists({ ...overlapping, fixed: true })) throw new HttpError(409, 'Another supplier is already the fixed source for an overlapping period.');
  return data;
}
