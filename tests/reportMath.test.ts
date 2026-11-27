import { describe, it, expect } from 'vitest';
import { balancesAsOf, bucketForAge, profitAndLoss, AccountRow, Movement } from '@/lib/reportMath';

const accounts: AccountRow[] = [
  { _id: 'bank', code: '1010', name: 'Bank', type: 'ASSET', category: 'Cash', balance: 1500 },
  { _id: 'sales', code: '4010', name: 'Sales', type: 'REVENUE', category: 'Sales', balance: 700 },
  { _id: 'exp', code: '5040', name: 'Overheads', type: 'EXPENSE', category: 'Overhead', balance: 200 },
];
const d = (s: string) => new Date(s);
const movements: Movement[] = [
  { account: 'bank', debit: 1000, credit: 0, date: d('2026-04-10') }, { account: 'sales', debit: 0, credit: 1000, date: d('2026-04-10') },
  { account: 'exp', debit: 200, credit: 0, date: d('2026-05-05') }, { account: 'bank', debit: 0, credit: 200, date: d('2026-05-05') },
  { account: 'bank', debit: 700, credit: 0, date: d('2026-06-01') }, { account: 'sales', debit: 0, credit: 700, date: d('2026-06-01') },
];

describe('financial report maths', () => {
  it('buckets receivable age', () => {
    expect([0, 30, 31, 60, 61, 90, 91].map(bucketForAge)).toEqual(['0-30', '0-30', '31-60', '31-60', '61-90', '61-90', '90+']);
  });

  it('backs out later movements to get a past balance', () => {
    const b = balancesAsOf(accounts, movements, d('2026-04-30'));
    expect(b.find(a => a._id === 'bank')!.asOfBalance).toBe(1500 - 700 + 200); // undo June receipt, undo May payment
    expect(b.find(a => a._id === 'sales')!.asOfBalance).toBe(700 - 700);
  });

  it('computes P&L inside a period only', () => {
    const p = profitAndLoss(accounts, movements, d('2026-05-01'), d('2026-06-30'));
    expect(p.totalRevenue).toBe(700);
    expect(p.totalExpense).toBe(200);
    expect(p.netProfit).toBe(500);
  });
});
