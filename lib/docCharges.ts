import { HttpError } from '@/lib/httpError';
import { CHARGE_LABELS, type ChargeInput } from '@/lib/gst';

// Line discount and document charges (freight, packing & forwarding...) as typed on a document.
// A discounted line keeps its list rate and discount %, and its unit price becomes the net rate, so everything after
// it (receipts, stock cost, bills, invoices) uses the price actually paid. Charges are spread over the lines for GST.

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** listPrice and discountPercent as typed; unitPrice is then the net rate. No discount leaves the line as it was. */
export function applyDiscount(line: { unitPrice: number; discountPercent?: any }, at: string) {
  const raw = line.discountPercent;
  if (raw === undefined || raw === null || raw === '' || Number(raw) === 0) return { unitPrice: line.unitPrice, listPrice: undefined, discountPercent: undefined };
  const d = Number(raw);
  if (!Number.isFinite(d) || d < 0 || d >= 100) throw new HttpError(400, `${at}: discount must be from 0 to below 100%.`);
  return { listPrice: line.unitPrice, discountPercent: d, unitPrice: r4(line.unitPrice * (1 - d / 100)) };
}

/** Charges as typed: a label and an amount of zero or more; empty rows are dropped. */
export function cleanCharges(raw: any): ChargeInput[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, 'Charges must be a list.');
  return raw
    .map((c: any, n: number) => {
      const label = String(c?.label ?? '').trim();
      const amount = c?.amount === '' || c?.amount === undefined || c?.amount === null ? 0 : Number(c.amount);
      if (!Number.isFinite(amount) || amount < 0) throw new HttpError(400, `Charge ${n + 1}: amount must be zero or more.`);
      if (amount > 0 && !label) throw new HttpError(400, `Charge ${n + 1}: say what the charge is for.`);
      if (label.length > 40) throw new HttpError(400, `Charge ${n + 1}: keep the name under 40 characters.`);
      return { label, amount: r2(amount) };
    })
    .filter(c => c.amount > 0);
}

export const chargesTotal = (charges: ChargeInput[] = []) => r2(charges.reduce((t, c) => t + (c.amount || 0), 0));

/** A line's list rate and discount, kept only while they still give its unit price: a price typed by hand drops them. */
export function keptDiscount(raw: { listPrice?: any; discountPercent?: any } | undefined, unitPrice: number): { listPrice?: number; discountPercent?: number } {
  const list = Number(raw?.listPrice), d = Number(raw?.discountPercent);
  if (!(list > 0) || !(d > 0 && d < 100)) return {};
  return Math.abs(list * (1 - d / 100) - unitPrice) <= Math.max(0.01, list * 1e-4) ? { listPrice: list, discountPercent: d } : {};
}

/** The discount that takes a list rate down to a net rate, as a % to 4 places */
export const discountBetween = (list: number, net: number) => r4((1 - net / list) * 100);

/** Charges on an order that its invoices have not billed yet (by name); they go on the next invoice raised. */
export function unbilledCharges(ordered: ChargeInput[] = [], billed: ChargeInput[] = []): ChargeInput[] {
  const left = new Map<string, number>();
  for (const c of ordered) left.set(c.label, r2((left.get(c.label) || 0) + (c.amount || 0)));
  for (const c of billed) if (left.has(c.label)) left.set(c.label, r2((left.get(c.label) || 0) - (c.amount || 0)));
  return [...left].filter(([, a]) => a > 0.004).map(([label, amount]) => ({ label, amount }));
}
export { CHARGE_LABELS };
