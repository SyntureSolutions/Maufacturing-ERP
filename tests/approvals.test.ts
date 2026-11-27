import { describe, it, expect } from 'vitest';
import { pickRule, canAct } from '@/lib/approvals';

describe('approval matrix', () => {
  const rules = [{ minAmount: 0, levels: ['SUPPLY_CHAIN_MANAGER'] }, { minAmount: 100000, levels: ['SUPPLY_CHAIN_MANAGER', 'ADMIN'] }, { minAmount: 1000000, levels: ['FINANCE_MANAGER', 'ADMIN'] }];

  it('picks the highest threshold reached', () => {
    expect(pickRule(rules, 50000)?.levels).toEqual(['SUPPLY_CHAIN_MANAGER']);
    expect(pickRule(rules, 100000)?.levels.length).toBe(2);
    expect(pickRule(rules, 2500000)?.levels[0]).toBe('FINANCE_MANAGER');
  });

  it('returns null when no rule applies', () => {
    expect(pickRule([{ minAmount: 500, levels: ['ADMIN'] }], 100)).toBeNull();
  });

  it('lets only the current level role (or admin) act on a pending request', () => {
    const req = { status: 'PENDING', currentLevel: 1, levels: [{ role: 'SUPPLY_CHAIN_MANAGER' }, { role: 'FINANCE_MANAGER' }] };
    expect(canAct(req, 'FINANCE_MANAGER')).toBe(true);
    expect(canAct(req, 'SUPPLY_CHAIN_MANAGER')).toBe(false);
    expect(canAct(req, 'ADMIN')).toBe(true);
    expect(canAct({ ...req, status: 'APPROVED' }, 'ADMIN')).toBe(false);
  });
});
