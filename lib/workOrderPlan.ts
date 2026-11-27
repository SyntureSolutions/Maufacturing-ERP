// Turns the work-order rows of an MRP run into a schedule: which product is built for which parent,
// and when. Sub-assemblies are scheduled to finish before the assembly that consumes them starts.

export interface PlanRow { product: string; itemType: 'FG' | 'SFG' | 'RM' | 'PM'; netIndentQty: number; orderType: 'PURCHASE' | 'WORK_ORDER' }
export interface PlannedWorkOrder {
  product: string;
  itemType: 'FG' | 'SFG';
  quantity: number;
  parentProduct?: string; // product of the planned work order that consumes this one
  level: number;          // 0 = top-level assembly
  startOffsetDays: number;
  endOffsetDays: number;
}

export const STAGE_DAYS = 3; // working window given to each BOM level

/**
 * @param rows        MRP matrix rows
 * @param components  product -> list of component product ids (active BOM)
 */
export function planWorkOrders(rows: PlanRow[], components: Map<string, string[]>): { plan: PlannedWorkOrder[]; skipped: { product: string; reason: string }[] } {
  const skipped: { product: string; reason: string }[] = [];
  const wanted = rows.filter(r => r.orderType === 'WORK_ORDER' && r.netIndentQty > 0 && (r.itemType === 'FG' || r.itemType === 'SFG'));
  const planned = new Map<string, PlanRow>();
  for (const r of wanted) {
    if (!components.has(r.product)) { skipped.push({ product: r.product, reason: 'No active BOM' }); continue; }
    planned.set(r.product, r);
  }

  // parent = a planned product whose BOM contains this one
  const parentOf = new Map<string, string>();
  for (const [parent] of planned) for (const c of components.get(parent) || []) if (planned.has(c) && c !== parent && !parentOf.has(c)) parentOf.set(c, parent);

  // level = distance from the top (0 for products that nothing planned consumes)
  const levelOf = (p: string, seen = new Set<string>()): number => {
    const par = parentOf.get(p);
    if (!par || seen.has(par)) return 0;
    seen.add(p);
    return 1 + levelOf(par, seen);
  };
  const levels = new Map([...planned.keys()].map(p => [p, levelOf(p)]));
  const maxLevel = Math.max(0, ...levels.values());

  const plan: PlannedWorkOrder[] = [...planned.values()].map(r => {
    const level = levels.get(r.product)!;
    const start = (maxLevel - level) * STAGE_DAYS;
    return {
      product: r.product, itemType: r.itemType as 'FG' | 'SFG', quantity: Math.ceil(r.netIndentQty - 1e-9), parentProduct: parentOf.get(r.product),
      level, startOffsetDays: start, endOffsetDays: start + STAGE_DAYS,
    };
  });
  // parents first so child records can reference the parent's work order
  plan.sort((a, b) => a.level - b.level);
  return { plan, skipped };
}
