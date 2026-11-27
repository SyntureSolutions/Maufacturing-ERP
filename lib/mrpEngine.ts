import { USABLE_STOCK } from '@/lib/stockRules';
import Product from '@/models/Product';
import '@/models/Category'; // registered so populate('category') works on a cold server
import { defaultBoms, perUnit } from '@/lib/bom';
import Batch from '@/models/Batch';
import PurchaseOrder from '@/models/PurchaseOrder';
import WorkOrder from '@/models/WorkOrder';
import SalesOrder from '@/models/SalesOrder';
import SalesProjection from '@/models/SalesProjection';

export type ItemType = 'FG' | 'SFG' | 'RM' | 'PM';

export interface MRPRow {
  product: string;
  name: string;
  sku: string;
  category?: string;
  itemType: ItemType;
  orderType: 'PURCHASE' | 'WORK_ORDER';
  grossReq: number;
  inStock: number;
  poPipeline: number;
  openWorkOrders: number;
  reorderLevel: number;
  netIndentQty: number;
  onIndent?: number; // already on open indents for this order when the run was made (single-order runs only)
  safetyStock?: number;
  needBy?: Date;        // earliest date the item is needed (a component: before its parent's production lead time)
  leadTimeDays?: number; // from the item master
  orderBy?: Date;       // needBy less the lead time: buy or start by then
  late?: boolean;       // ordering today is already too late for needBy
  notPlanned?: boolean; // item master says "do not plan": shown, never indented or made
}

export interface DemandLine { product: string; quantity: number; requiredDate: Date; source: string }

const TYPE_MAP: Record<string, ItemType> = { FINISHED_GOOD: 'FG', SEMI_FINISHED: 'SFG', RAW_MATERIAL: 'RM', PACKAGING: 'PM' };
const MAX_DEPTH = 12;

interface BomComp { product: string; quantity: number; wastagePercentage: number }

async function loadBomMap(): Promise<Map<string, BomComp[]>> {
  // each item's default BOM, quantities turned into stock units per ONE unit of the item
  const map = new Map<string, BomComp[]>();
  for (const [product, b] of await defaultBoms()) {
    map.set(product, (b.components || []).map((c: any) => ({ product: String(c.product), quantity: perUnit(b, c), wastagePercentage: c.wastagePercentage || 0 })));
  }
  return map;
}

// Demand = open sales orders + monthly forecast (forecast is reduced by confirmed orders due in that month)
export async function gatherDemand(opts: { includeOrders: boolean; includeForecast: boolean; months: number }): Promise<DemandLine[]> {
  const lines: DemandLine[] = [];
  const now = new Date();
  const soByProductMonth = new Map<string, number>();

  const orders = await SalesOrder.find({ status: { $in: ['APPROVED', 'IN_FULFILLMENT'] } }).lean() as any[];
  for (const so of orders) {
    const due = so.deliveryDate ? new Date(so.deliveryDate) : now;
    for (const item of so.items || []) {
      const key = `${item.product}|${due.toISOString().slice(0, 7)}`;
      soByProductMonth.set(key, (soByProductMonth.get(key) || 0) + item.quantity);
      if (opts.includeOrders) lines.push({ product: String(item.product), quantity: item.quantity, requiredDate: due, source: `Sales Order ${so.soNumber}` });
    }
  }

  if (opts.includeForecast) {
    const startMonth = now.toISOString().slice(0, 7);
    const end = new Date(now.getFullYear(), now.getMonth() + opts.months, 1).toISOString().slice(0, 7);
    const projections = await SalesProjection.find({ month: { $gte: startMonth, $lt: end } }).lean() as any[];
    for (const p of projections) {
      const covered = soByProductMonth.get(`${p.product}|${p.month}`) || 0;
      const qty = p.quantity - covered;
      if (qty > 0) lines.push({ product: String(p.product), quantity: qty, requiredDate: new Date(`${p.month}-01T00:00:00Z`), source: `Forecast ${p.month}` });
    }
  }
  return lines;
}

export interface MrpOptions {
  forOrder?: string;                        // plan for this customer order: work orders and purchase orders raised for OTHER orders are not supply for it
  includeReorder?: boolean;                // add the product's re-order level to what must be bought (default true; off for a single customer order)
  ownAllocated?: Map<string, number>;       // stock already reserved for this very demand: it is supply, not something taken from others
  extraSupply?: Map<string, number>;        // quantities already on their way that the usual pipeline does not see (open indents)
}

/** Demand lines for one sales order */
export function gatherDemandForOrder(so: any): DemandLine[] {
  const due = so.deliveryDate ? new Date(so.deliveryDate) : new Date();
  return (so.items || []).filter((i: any) => i.product && i.quantity > 0).map((i: any) => ({ product: String(i.product), quantity: i.quantity, requiredDate: due, source: `Sales Order ${so.soNumber}` }));
}

export async function runMRP(demand: DemandLine[], opts: MrpOptions = {}): Promise<MRPRow[]> {
  const [bomMap, products] = await Promise.all([
    loadBomMap(),
    Product.find({}).populate('category', 'name').lean() as Promise<any[]>,
  ]);
  const productMap = new Map(products.map(p => [String(p._id), p]));

  const stockAgg = await Batch.aggregate([
    { $match: { ...USABLE_STOCK, currentQuantity: { $gt: 0 } } },
    { $group: { _id: '$product', free: { $sum: { $subtract: ['$currentQuantity', '$allocatedQuantity'] } } } },
  ]);
  // supply that is not earmarked for a different customer order (stock-building work and purchases are supply for everyone)
  const mine = (x: any) => !opts.forOrder || !x.salesOrder || String(x.salesOrder) === opts.forOrder;
  const poAgg = (await PurchaseOrder.find({ status: { $in: ['PENDING_APPROVAL', 'ORDERED', 'PARTIALLY_RECEIVED'] } }).lean() as any[]).filter(mine);
  const woAgg = (await WorkOrder.find({ status: { $in: ['PLANNED', 'IN_PROGRESS'] } }).lean() as any[]).filter(mine);

  const inStock = new Map<string, number>(stockAgg.map(s => [String(s._id), Math.max(0, s.free)]));
  const poPipeline = new Map<string, number>();
  for (const po of poAgg) for (const i of po.items) poPipeline.set(String(i.product), (poPipeline.get(String(i.product)) || 0) + Math.max(0, i.quantity - (i.receivedQuantity || 0)));
  for (const [p, q] of opts.ownAllocated || []) inStock.set(p, (inStock.get(p) || 0) + q);
  for (const [p, q] of opts.extraSupply || []) poPipeline.set(p, (poPipeline.get(p) || 0) + q);
  const openWO = new Map<string, number>();
  for (const wo of woAgg) openWO.set(String(wo.product), (openWO.get(String(wo.product)) || 0) + wo.quantity);

  const gross = new Map<string, number>();
  // Supply pool is consumed as demand is netted level by level, so shared components are not double-covered
  const pool = new Map<string, number>();
  const supply = (id: string) => (inStock.get(id) || 0) + (poPipeline.get(id) || 0) + (openWO.get(id) || 0);
  for (const id of new Set([...productMap.keys()])) pool.set(id, supply(id));

  const needBy = new Map<string, Date>();
  const DAY = 86400000;
  const leadOf = (id: string) => Math.max(0, Number(productMap.get(id)?.plannedDeliveryDays) || 0);
  const notPlanned = (id: string) => productMap.get(id)?.mrpType === 'ND';
  const explode = (id: string, qty: number, depth: number, path: Set<string>, date: Date) => {
    if (depth > MAX_DEPTH || path.has(id)) throw new Error(`BOM loop detected at ${productMap.get(id)?.sku || id}`);
    gross.set(id, (gross.get(id) || 0) + qty);
    if (!needBy.has(id) || date < needBy.get(id)!) needBy.set(id, date);
    if (notPlanned(id)) return; // "do not plan": its need is shown, but it is neither bought nor made, so nothing below it either
    const covered = Math.min(pool.get(id) || 0, qty);
    pool.set(id, (pool.get(id) || 0) - covered);
    const short = qty - covered;
    const comps = bomMap.get(id);
    if (short <= 0 || !comps) return;
    const next = new Set(path).add(id);
    // components are needed before the item is made: its lead time (production time) earlier
    const compDate = new Date(date.getTime() - leadOf(id) * DAY);
    for (const c of comps) explode(c.product, c.quantity * short * (1 + c.wastagePercentage / 100), depth + 1, next, compDate);
  };
  for (const d of demand) if (productMap.has(d.product)) explode(d.product, d.quantity, 0, new Set(), new Date(d.requiredDate || Date.now()));
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const rows: MRPRow[] = [];
  for (const [id, grossReq] of gross) {
    const p = productMap.get(id);
    const reorderLevel = opts.includeReorder === false ? 0 : p.minStockLevel || 0;
    const safetyStock = opts.includeReorder === false ? 0 : p.safetyStock || 0;
    const sup = supply(id);
    // Required = (Gross Req + the higher of Reorder Level and Safety Stock) - (Available Stock + Open PO Qty + Open Work Orders)
    const skip = notPlanned(id);
    const net = skip ? 0 : Math.max(0, grossReq + Math.max(reorderLevel, safetyStock) - sup);
    const need = needBy.get(id), lead = leadOf(id);
    const orderBy = need ? new Date(need.getTime() - lead * DAY) : undefined;
    rows.push({
      product: id, name: p.name, sku: p.sku, category: p.category?.name,
      itemType: TYPE_MAP[p.productType] || 'RM',
      orderType: bomMap.has(id) ? 'WORK_ORDER' : 'PURCHASE',
      grossReq: round(grossReq), inStock: round(inStock.get(id) || 0), poPipeline: round(poPipeline.get(id) || 0),
      openWorkOrders: round(openWO.get(id) || 0), reorderLevel, netIndentQty: round(net),
      safetyStock, needBy: need, leadTimeDays: lead, orderBy, late: !!(net > 0 && orderBy && orderBy < today), ...(skip ? { notPlanned: true } : {}),
      ...(opts.extraSupply ? { onIndent: round(opts.extraSupply.get(id) || 0) } : {}),
    });
  }
  const order = { FG: 0, SFG: 1, RM: 2, PM: 3 };
  return rows.sort((a, b) => order[a.itemType] - order[b.itemType] || a.sku.localeCompare(b.sku));
}

const round = (n: number) => Math.round(n * 10000) / 10000;

export interface BomNode { product: string; name: string; sku: string; itemType: ItemType; quantity: number; uom?: string; children: BomNode[] }

// Multi-level BOM tree for the explorer; quantities are per one unit of the root
export async function buildBomTree(rootId: string, rootQty = 1): Promise<BomNode | null> {
  const [bomMap, products] = await Promise.all([loadBomMap(), Product.find({}).lean() as Promise<any[]>]);
  const productMap = new Map(products.map(p => [String(p._id), p]));
  const build = (id: string, qty: number, depth: number, path: Set<string>): BomNode => {
    if (depth > MAX_DEPTH || path.has(id)) throw new Error(`BOM loop detected at ${productMap.get(id)?.sku || id}`);
    const p = productMap.get(id);
    const next = new Set(path).add(id);
    return {
      product: id, name: p?.name || 'Unknown', sku: p?.sku || '', uom: p?.uom,
      itemType: TYPE_MAP[p?.productType] || 'RM', quantity: round(qty),
      children: (bomMap.get(id) || []).map(c => build(c.product, qty * c.quantity * (1 + c.wastagePercentage / 100), depth + 1, next)),
    };
  };
  return productMap.has(rootId) ? build(rootId, rootQty, 0, new Set()) : null;
}
