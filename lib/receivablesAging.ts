import Invoice from '@/models/Invoice';
import Customer from '@/models/Customer';
import { bucketForAge } from '@/lib/reportMath';

// What each customer owes, by age: issued sales invoices less payments and credit notes, aged from the invoice date
// (the same rule as the debtors report), set against the customer's credit limit.
//   CRITICAL_HOLD  anything over 90 days, or more owed than the credit limit
//   WARNING        anything 61-90 days, or more than 80% of the limit used
//   HEALTHY        otherwise

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface AgingRow {
  customer: string; distributorName: string; distributorCode?: string; creditLimit: number; totalOutstanding: number;
  current0to30: number; overdue31to60: number; overdue61to90: number; overdue90Plus: number;
  creditStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL_HOLD'; invoices: { invoiceNumber: string; date: Date; outstanding: number; days: number }[];
}

export async function receivablesAging(asOf = new Date()): Promise<AgingRow[]> {
  const invoices: any[] = await Invoice.find({ type: 'SALES', status: { $nin: ['CANCELLED', 'DRAFT', 'PAID'] }, date: { $lte: asOf } })
    .select('invoiceNumber date customer parties totalAmount amountPaid creditedAmount').lean();
  const ids = [...new Set(invoices.map(i => String(i.customer || '')).filter(Boolean))];
  const customers = new Map((await Customer.find({ _id: { $in: ids } }).select('name code creditLimit').lean() as any[]).map(c => [String(c._id), c]));
  const rows = new Map<string, AgingRow>();
  for (const inv of invoices) {
    const outstanding = r2((inv.totalAmount || 0) - (inv.amountPaid || 0) - (inv.creditedAmount || 0));
    if (outstanding <= 0) continue;
    const c: any = customers.get(String(inv.customer || ''));
    const key = String(inv.customer || inv.parties?.buyer?.name || 'unknown');
    const row: AgingRow = rows.get(key) || {
      customer: key, distributorName: c?.name || inv.parties?.buyer?.name || 'Unknown customer', distributorCode: c?.code, creditLimit: c?.creditLimit || 0,
      totalOutstanding: 0, current0to30: 0, overdue31to60: 0, overdue61to90: 0, overdue90Plus: 0, creditStatus: 'HEALTHY', invoices: [],
    };
    const days = Math.max(0, Math.floor((asOf.getTime() - new Date(inv.date).getTime()) / 86400000));
    const field = ({ '0-30': 'current0to30', '31-60': 'overdue31to60', '61-90': 'overdue61to90', '90+': 'overdue90Plus' } as const)[bucketForAge(days) as '0-30' | '31-60' | '61-90' | '90+'];
    row[field] = r2(row[field] + outstanding);
    row.totalOutstanding = r2(row.totalOutstanding + outstanding);
    row.invoices.push({ invoiceNumber: inv.invoiceNumber, date: inv.date, outstanding, days });
    rows.set(key, row);
  }
  return [...rows.values()].map(r => ({
    ...r,
    creditStatus: (r.overdue90Plus > 0 || (r.creditLimit > 0 && r.totalOutstanding > r.creditLimit) ? 'CRITICAL_HOLD'
      : r.overdue61to90 > 0 || (r.creditLimit > 0 && r.totalOutstanding > 0.8 * r.creditLimit) ? 'WARNING' : 'HEALTHY') as AgingRow['creditStatus'],
  })).sort((a, b) => b.totalOutstanding - a.totalOutstanding);
}
