import { describe, it, expect } from 'vitest';
import { pivot } from '@/lib/pivot';

const rows = [
  { supplier: 'A', month: '2026-04', received: 100, accepted: 90 },
  { supplier: 'A', month: '2026-05', received: 100, accepted: 100 },
  { supplier: 'B', month: '2026-04', received: 50, accepted: 25 },
];

describe('pivot engine', () => {
  it('sums a metric by row and column dimension with totals', () => {
    const p = pivot(rows, ['supplier'], 'month', { key: 'received', label: 'Received', agg: 'sum', field: 'received' });
    expect(p.cells['A||2026-04']).toBe(100);
    expect(p.rowTotals['A']).toBe(200);
    expect(p.colTotals['2026-04']).toBe(150);
    expect(p.grandTotal).toBe(250);
    expect(p.cells['B||2026-05']).toBeNull();
  });

  it('computes a ratio metric as sum(num)/sum(den), not an average of ratios', () => {
    const p = pivot(rows, ['supplier'], null, { key: 'q', label: 'Quality', agg: 'ratio', num: 'accepted', den: 'received', format: 'percent' });
    expect(p.rowTotals['A']).toBe(0.95);
    expect(p.rowTotals['B']).toBe(0.5);
    expect(p.grandTotal).toBe(0.86);
  });

  it('counts rows and averages', () => {
    expect(pivot(rows, [], null, { key: 'c', label: 'n', agg: 'count' }).grandTotal).toBe(3);
    expect(pivot(rows, ['supplier'], null, { key: 'a', label: 'avg', agg: 'avg', field: 'received' }).rowTotals['A']).toBe(100);
  });

  it('labels blank dimension values', () => {
    const p = pivot([{ x: undefined, v: 1 }], ['x'], null, { key: 'v', label: 'v', agg: 'sum', field: 'v' });
    expect(p.rowKeys[0]).toEqual(['(blank)']);
  });
});
