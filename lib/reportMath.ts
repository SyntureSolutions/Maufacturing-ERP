export type AccType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface AccountRow { _id: string; code: string; name: string; type: AccType; category: string; balance: number }
export interface Movement { account: string; debit: number; credit: number; date: Date }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const isDebitNature = (t: AccType) => t === 'ASSET' || t === 'EXPENSE';

/** Signed balance in the account's natural direction (debit-nature: Dr - Cr, otherwise Cr - Dr) */
export const natural = (t: AccType, debit: number, credit: number) => r2(isDebitNature(t) ? debit - credit : credit - debit);

export function bucketForAge(days: number): '0-30' | '31-60' | '61-90' | '90+' {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

/**
 * Account balances as of a date. Account.balance is the live ledger balance; journal movement after `asOf`
 * is backed out so the figure reflects that date, and movement before the first journal is the opening balance.
 */
export function balancesAsOf(accounts: AccountRow[], movements: Movement[], asOf: Date) {
  const after = new Map<string, { d: number; c: number }>();
  for (const m of movements) {
    if (m.date > asOf) {
      const cur = after.get(m.account) || { d: 0, c: 0 };
      cur.d += m.debit; cur.c += m.credit;
      after.set(m.account, cur);
    }
  }
  return accounts.map(a => {
    const a2 = after.get(a._id) || { d: 0, c: 0 };
    return { ...a, asOfBalance: r2(a.balance - natural(a.type, a2.d, a2.c)) };
  });
}

/** Profit & loss for movements inside [from, to] */
export function profitAndLoss(accounts: AccountRow[], movements: Movement[], from: Date, to: Date) {
  const byAcc = new Map<string, number>();
  for (const m of movements) {
    if (m.date >= from && m.date <= to) byAcc.set(m.account, (byAcc.get(m.account) || 0) + (m.debit - m.credit));
  }
  const rows = (type: AccType) => accounts.filter(a => a.type === type).map(a => {
    const dr = byAcc.get(a._id) || 0;
    return { code: a.code, name: a.name, category: a.category, amount: r2(type === 'REVENUE' ? -dr : dr) };
  }).filter(r => r.amount !== 0);
  const revenue = rows('REVENUE'), expenses = rows('EXPENSE');
  const totalRevenue = r2(revenue.reduce((s, r) => s + r.amount, 0)), totalExpense = r2(expenses.reduce((s, r) => s + r.amount, 0));
  return { revenue, expenses, totalRevenue, totalExpense, netProfit: r2(totalRevenue - totalExpense) };
}
