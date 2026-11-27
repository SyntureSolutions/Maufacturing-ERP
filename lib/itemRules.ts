import Product from '@/models/Product';
import { HttpError } from '@/lib/httpError';

// Rules from the item master that documents follow.

/** An item is in use unless it is switched off, or its "inactive from" date has come. */
export function isItemActive(p: { isActive?: boolean; deactivatedFrom?: Date | string | null }, on = new Date()) {
  if (p.isActive === false) return false;
  return !(p.deactivatedFrom && new Date(p.deactivatedFrom) <= on);
}

/**
 * Refuses a new document line for an item that is no longer in use. `keep` lists items already on the document being
 * edited: those may stay, so an order raised before the item was retired can still be finished.
 */
export async function assertItemsActive(products: any[], what: string, keep: any[] = []) {
  const kept = new Set(keep.map(k => String(k?._id || k)));
  const ids = [...new Set(products.map(p => String(p?._id || p || '')).filter(id => id && !kept.has(id)))];
  if (!ids.length) return;
  const items: any[] = await Product.find({ _id: { $in: ids } }).select('name sku isActive deactivatedFrom').lean();
  const off = items.filter(p => !isItemActive(p));
  if (off.length) {
    throw new HttpError(400, `${off.map(p => `${p.sku || p.name}`).join(', ')} ${off.length > 1 ? 'are' : 'is'} no longer in use (inactive in the item master), so ${off.length > 1 ? 'they' : 'it'} cannot go on a new ${what}.`);
  }
}
