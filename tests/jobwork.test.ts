import { describe, it, expect } from 'vitest';
import { returnDeadline, heldQty, itc04Status, itc04Quarter } from '@/lib/jobwork';

describe('job work / ITC-04 rules', () => {
  it('gives inputs 1 year and capital goods 3 years', () => {
    expect(returnDeadline('INPUT', new Date(2026, 4, 10)).getFullYear()).toBe(2027);
    expect(returnDeadline('CAPITAL', new Date(2026, 4, 10)).getFullYear()).toBe(2029);
  });

  it('computes quantity still held by the job worker', () => {
    expect(heldQty({ quantity: 100, consumed: 60, returned: 10, scrap: 5 })).toBe(25);
  });

  it('flags overdue, due-soon and on-track challans', () => {
    const items = [{ quantity: 10, consumed: 0, returned: 0, scrap: 0 }];
    const now = new Date(2026, 9, 14);
    expect(itc04Status({ status: 'OPEN', dueDate: new Date(2026, 8, 1), items }, now).status).toBe('OVERDUE');
    expect(itc04Status({ status: 'OPEN', dueDate: new Date(2026, 10, 20), items }, now).status).toBe('DUE_SOON');
    expect(itc04Status({ status: 'OPEN', dueDate: new Date(2027, 5, 1), items }, now).status).toBe('ON_TRACK');
    expect(itc04Status({ status: 'CLOSED', dueDate: new Date(2026, 8, 1), items }, now).status).toBe('CLOSED');
  });

  it('assigns the financial-year quarter', () => {
    expect(itc04Quarter(new Date(2026, 3, 1))).toBe('2026-27 Q1');
    expect(itc04Quarter(new Date(2026, 11, 31))).toBe('2026-27 Q3');
    expect(itc04Quarter(new Date(2027, 1, 5))).toBe('2026-27 Q4');
  });
});
