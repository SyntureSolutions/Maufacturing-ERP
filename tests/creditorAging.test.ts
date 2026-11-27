import { describe, it, expect } from 'vitest';
import { buildCreditors, unbilledLines, ReceivedLine } from '@/lib/creditorAging';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const line = (grn: string, date: string, kept: number, extra: Partial<ReceivedLine> = {}): ReceivedLine => ({
  poId: 'PO1', poNumber: 'PO-1', supplierId: 'S1', product: 'P1', productName: 'Tube', grnNumber: grn, date: d(date), kept, price: 10, ...extra,
});

describe('goods received but not billed', () => {
  it('everything is unbilled when nothing has been billed', () => {
    const u = unbilledLines([line('GRN-1', '2026-01-01', 50), line('GRN-2', '2026-02-01', 30)], new Map());
    expect(u.map(x => [x.grnNumber, x.unbilledQty, x.value])).toEqual([['GRN-1', 50, 500], ['GRN-2', 30, 300]]);
  });

  it('treats the oldest receipts as billed first, leaving the newest delivery unbilled', () => {
    const u = unbilledLines([line('GRN-1', '2026-01-01', 50), line('GRN-2', '2026-02-01', 30)], new Map([['PO1|P1', 60]]));
    expect(u.map(x => [x.grnNumber, x.unbilledQty])).toEqual([['GRN-2', 20]]); // 50 billed from GRN-1, 10 more from GRN-2
  });

  it('a fully billed order leaves nothing', () => {
    expect(unbilledLines([line('GRN-1', '2026-01-01', 50)], new Map([['PO1|P1', 50]]))).toEqual([]);
  });

  it('keeps products and purchase orders separate, and ignores input order', () => {
    const u = unbilledLines([
      line('GRN-B', '2026-03-01', 10, { poId: 'PO2', poNumber: 'PO-2' }),
      line('GRN-2', '2026-02-01', 30), line('GRN-1', '2026-01-01', 50),
      line('GRN-X', '2026-01-15', 5, { product: 'P2', productName: 'Bolt' }),
    ], new Map([['PO1|P1', 50]]));
    expect(u.map(x => x.grnNumber).sort()).toEqual(['GRN-2', 'GRN-B', 'GRN-X']);
    expect(u.find(x => x.grnNumber === 'GRN-2')!.unbilledQty).toBe(30);
  });

  it('copes with decimal quantities', () => {
    const u = unbilledLines([line('GRN-1', '2026-01-01', 10.5)], new Map([['PO1|P1', 0.3]]));
    expect(u[0].unbilledQty).toBe(10.2);
    expect(u[0].value).toBe(102);
  });
});

describe('creditors aging', () => {
  const asOf = d('2026-04-30');
  const unbilled = unbilledLines([line('GRN-1', '2026-04-20', 50), line('GRN-0', '2026-01-10', 20)], new Map());

  it('combines bills, unbilled receipts and advances per supplier, aged from the right date', () => {
    const rows = buildCreditors({
      asOf, unbilled,
      bills: [{ supplierId: 'S1', number: 'BILL-1', vendorNumber: 'V-77', date: d('2026-03-15'), outstanding: 1000 }],
      advances: [{ supplierId: 'S1', number: 'BP-1', date: d('2026-04-01'), amount: 300 }],
    });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.billed).toBe(1000);
    expect(r.unbilled).toBe(700);        // 500 (10 days old) + 200 (110 days old)
    expect(r.advances).toBe(300);
    expect(r.total).toBe(1700);
    expect(r.net).toBe(1400);            // 1700 owed less 300 already paid on account
    expect(r['0-30']).toBe(500);         // the recent delivery
    expect(r['31-60']).toBe(1000);       // the bill from 46 days ago
    expect(r['90+']).toBe(200);          // the old delivery nobody billed
    expect(r['0-30'] + r['31-60'] + r['61-90'] + r['90+']).toBe(r.total);
  });

  it('lists every item behind the figures, oldest first, with advances negative', () => {
    const [r] = buildCreditors({ asOf, unbilled, bills: [{ supplierId: 'S1', number: 'BILL-1', date: d('2026-03-15'), outstanding: 1000 }], advances: [{ supplierId: 'S1', number: 'BP-1', date: d('2026-04-01'), amount: 300 }] });
    expect(r.items.map(i => i.kind)).toEqual(['UNBILLED', 'BILL', 'ADVANCE', 'UNBILLED']);
    expect(r.items.find(i => i.kind === 'ADVANCE')!.amount).toBe(-300);
    expect(r.items.find(i => i.ref === 'GRN-0')!.bucket).toBe('90+');
  });

  it('ignores settled bills, zero values and anything dated after the report date', () => {
    const rows = buildCreditors({
      asOf, unbilled: unbilledLines([line('GRN-F', '2026-05-10', 5)], new Map()),
      bills: [{ supplierId: 'S1', number: 'B', date: d('2026-04-01'), outstanding: 0 }, { supplierId: 'S1', number: 'B2', date: d('2026-06-01'), outstanding: 50 }],
      advances: [],
    });
    expect(rows).toEqual([]);
  });

  it('a supplier we only owe through an unbilled delivery still appears, and rows are sorted by what is owed', () => {
    const rows = buildCreditors({
      asOf,
      unbilled: unbilledLines([line('GRN-1', '2026-04-20', 5, { supplierId: 'S2', poId: 'PO9' })], new Map()),
      bills: [{ supplierId: 'S1', number: 'BILL-1', date: d('2026-04-10'), outstanding: 900 }], advances: [],
    });
    expect(rows.map(r => r.supplierId)).toEqual(['S1', 'S2']);
    expect(rows[1]).toMatchObject({ billed: 0, unbilled: 50, net: 50 });
  });

  it('an advance larger than what is owed gives a negative net (we are in credit)', () => {
    const [r] = buildCreditors({ asOf, unbilled: [], bills: [{ supplierId: 'S1', number: 'B', date: d('2026-04-10'), outstanding: 100 }], advances: [{ supplierId: 'S1', number: 'A', date: d('2026-04-11'), amount: 250 }] });
    expect(r.net).toBe(-150);
    expect(r.total).toBe(100);
  });
});
