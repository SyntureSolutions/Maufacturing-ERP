// Ordering in the item's purchase unit (bag, roll, drum) while stock is kept in its stock unit (kg, m, L).
// A PO line keeps quantity and price in stock units, so receiving, stock, MRP and bills work as before, and remembers the
// unit it was ordered in with the item master's conversion. Safe to import in the browser (no database code).

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** How a PO line reads to the supplier: in the unit it was ordered in, with the rate per that unit. */
export function orderView(line: { quantity: number; unitPrice: number; orderUnit?: string; orderFactor?: number }, stockUom?: string) {
  const f = line.orderUnit && line.orderFactor ? line.orderFactor : 1;
  return { qty: r6(line.quantity / f), rate: r2(line.unitPrice * f), unit: line.orderUnit && line.orderFactor ? line.orderUnit : stockUom || '', factor: f, inStockUnits: f === 1 };
}

/**
 * Turns a line typed in a unit (quantity and rate per that unit) into stock units. `unit` empty, or the stock unit, leaves
 * it as typed. Any other unit must be the item's purchase unit; returns null when it is not.
 */
export function toStockUnits(qty: number, rate: number, unit: string | undefined, item: { uom?: string; purchaseUom?: string; purchaseConversion?: number }) {
  const u = String(unit || '').trim().toLowerCase();
  if (!u || u === String(item.uom || '').toLowerCase()) return { quantity: qty, unitPrice: rate, totalPrice: r2(qty * rate), orderUnit: undefined, orderFactor: undefined };
  if (!item.purchaseUom || u !== String(item.purchaseUom).toLowerCase()) return null;
  const f = Number(item.purchaseConversion) || 1;
  return { quantity: r6(qty * f), unitPrice: r6(rate / f), totalPrice: r2(qty * rate), orderUnit: item.purchaseUom, orderFactor: f };
}
