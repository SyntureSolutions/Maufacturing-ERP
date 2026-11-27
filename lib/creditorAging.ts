// Creditors aging that includes goods received but not yet billed (often called GRNI).
//
// What we owe a supplier is made of:
//   1. bills booked and still unpaid (aged from the bill date)
//   2. goods received but not yet billed (aged from the goods-receipt date)
//   less
//   3. payments made to the supplier that were not applied to a bill (advances)

import { bucketForAge } from '@/lib/reportMath';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export interface ReceivedLine {
  poId: string;
  poNumber: string;
  supplierId: string;
  product: string;
  productName: string;
  grnNumber: string;
  date: Date;
  kept: number;  // quantity received and still owed for (received minus goods returned to the vendor)
  price: number; // PO unit price
}

export interface UnbilledLine extends ReceivedLine { unbilledQty: number; value: number }

/**
 * Splits what has been billed across the goods receipts: the oldest receipts are treated as billed first, so what is
 * left unbilled is the most recent delivery. `billedByPoProduct` is the billed quantity per `${poId}|${product}`.
 */
export function unbilledLines(lines: ReceivedLine[], billedByPoProduct: Map<string, number>): UnbilledLine[] {
  const out: UnbilledLine[] = [];
  const groups = new Map<string, ReceivedLine[]>();
  for (const l of lines) groups.set(`${l.poId}|${l.product}`, [...(groups.get(`${l.poId}|${l.product}`) || []), l]);
  for (const [key, group] of groups) {
    let billed = billedByPoProduct.get(key) || 0;
    for (const l of [...group].sort((a, b) => a.date.getTime() - b.date.getTime())) {
      const covered = Math.min(l.kept, billed);
      billed = r4(billed - covered);
      const remaining = r4(l.kept - covered);
      if (remaining > 1e-9) out.push({ ...l, unbilledQty: remaining, value: r2(remaining * l.price) });
    }
  }
  return out;
}

export interface OpenBill { supplierId: string; number: string; vendorNumber?: string; date: Date; outstanding: number }
export interface Advance { supplierId: string; number: string; date: Date; amount: number }

export interface CreditorItem { kind: 'BILL' | 'UNBILLED' | 'ADVANCE'; ref: string; detail?: string; date: Date; amount: number; bucket?: string }
export interface CreditorRow {
  supplierId: string;
  billed: number;
  unbilled: number;
  advances: number;     // positive number; subtracted in `net`
  net: number;          // billed + unbilled - advances
  total: number;        // billed + unbilled (what the buckets add up to)
  '0-30': number; '31-60': number; '61-90': number; '90+': number;
  items: CreditorItem[];
}

const ageDays = (from: Date, asOf: Date) => Math.max(0, Math.floor((asOf.getTime() - from.getTime()) / 86400000));

export function buildCreditors(input: { bills: OpenBill[]; unbilled: UnbilledLine[]; advances: Advance[]; asOf: Date }): CreditorRow[] {
  const rows = new Map<string, CreditorRow>();
  const row = (id: string) => {
    if (!rows.has(id)) rows.set(id, { supplierId: id, billed: 0, unbilled: 0, advances: 0, net: 0, total: 0, '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, items: [] });
    return rows.get(id)!;
  };
  for (const b of input.bills) {
    if (b.outstanding <= 0 || b.date > input.asOf) continue;
    const r = row(b.supplierId), bucket = bucketForAge(ageDays(b.date, input.asOf));
    r.billed = r2(r.billed + b.outstanding); r[bucket] = r2(r[bucket] + b.outstanding);
    r.items.push({ kind: 'BILL', ref: b.number, detail: b.vendorNumber ? `Vendor bill ${b.vendorNumber}` : undefined, date: b.date, amount: b.outstanding, bucket });
  }
  for (const u of input.unbilled) {
    if (u.value <= 0 || u.date > input.asOf) continue;
    const r = row(u.supplierId), bucket = bucketForAge(ageDays(u.date, input.asOf));
    r.unbilled = r2(r.unbilled + u.value); r[bucket] = r2(r[bucket] + u.value);
    r.items.push({ kind: 'UNBILLED', ref: u.grnNumber, detail: `${u.productName} x ${u.unbilledQty} (PO ${u.poNumber})`, date: u.date, amount: u.value, bucket });
  }
  for (const a of input.advances) {
    if (a.amount <= 0 || a.date > input.asOf) continue;
    const r = row(a.supplierId);
    r.advances = r2(r.advances + a.amount);
    r.items.push({ kind: 'ADVANCE', ref: a.number, detail: 'Payment not applied to a bill', date: a.date, amount: -a.amount });
  }
  for (const r of rows.values()) {
    r.total = r2(r.billed + r.unbilled);
    r.net = r2(r.billed + r.unbilled - r.advances);
    r.items.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
  return [...rows.values()].sort((a, b) => b.net - a.net);
}
