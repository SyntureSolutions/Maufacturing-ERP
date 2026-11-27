import { describe, it, expect } from 'vitest';
import { planWorkOrders, PlanRow, STAGE_DAYS } from '@/lib/workOrderPlan';

const row = (product: string, itemType: PlanRow['itemType'], net: number, orderType: PlanRow['orderType'] = 'WORK_ORDER'): PlanRow => ({ product, itemType, netIndentQty: net, orderType });
const boms = new Map<string, string[]>([['BIKE', ['FRAME', 'TUBE']], ['FRAME', ['STEEL', 'JOINT']], ['JOINT', ['STEEL']]]);

describe('MRP work order plan', () => {
  it('plans only work-order rows with a net requirement and rounds partial quantities up', () => {
    const { plan } = planWorkOrders([row('BIKE', 'FG', 4.2), row('TUBE', 'RM', 10, 'PURCHASE'), row('FRAME', 'SFG', 0)], boms);
    expect(plan.map(p => p.product)).toEqual(['BIKE']);
    expect(plan[0].quantity).toBe(5);
  });

  it('links each sub-assembly to the planned work order that consumes it', () => {
    const { plan } = planWorkOrders([row('BIKE', 'FG', 20), row('FRAME', 'SFG', 20)], boms);
    expect(plan.find(p => p.product === 'FRAME')!.parentProduct).toBe('BIKE');
    expect(plan.find(p => p.product === 'BIKE')!.parentProduct).toBeUndefined();
  });

  it('schedules sub-assemblies to finish before the assembly starts', () => {
    const { plan } = planWorkOrders([row('BIKE', 'FG', 20), row('FRAME', 'SFG', 20), row('JOINT', 'SFG', 20)], boms);
    const by = (p: string) => plan.find(x => x.product === p)!;
    expect(by('BIKE').level).toBe(0);
    expect(by('FRAME').level).toBe(1);
    expect(by('JOINT').level).toBe(2); // joint feeds the frame, the frame feeds the bike
    expect(by('JOINT').startOffsetDays).toBe(0);
    expect(by('JOINT').endOffsetDays).toBeLessThanOrEqual(by('FRAME').startOffsetDays);
    expect(by('FRAME').endOffsetDays).toBeLessThanOrEqual(by('BIKE').startOffsetDays);
    expect(by('BIKE').endOffsetDays - by('BIKE').startOffsetDays).toBe(STAGE_DAYS);
  });

  it('lists parents before children', () => {
    const { plan } = planWorkOrders([row('JOINT', 'SFG', 5), row('FRAME', 'SFG', 5), row('BIKE', 'FG', 5)], boms);
    expect(plan.map(p => p.product)).toEqual(['BIKE', 'FRAME', 'JOINT']);
  });

  it('skips work-order items that have no active BOM, and reports why', () => {
    const { plan, skipped } = planWorkOrders([row('GADGET', 'SFG', 5), row('BIKE', 'FG', 5)], boms);
    expect(plan.map(p => p.product)).toEqual(['BIKE']);
    expect(skipped).toEqual([{ product: 'GADGET', reason: 'No active BOM' }]);
  });

  it('plans an independent sub-assembly at the top level when its parent is not being built', () => {
    const { plan } = planWorkOrders([row('FRAME', 'SFG', 8)], boms);
    expect(plan[0]).toMatchObject({ level: 0, parentProduct: undefined, startOffsetDays: 0 });
  });
});
