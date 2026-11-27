import BillOfMaterials from '@/models/BillOfMaterials';
import Product from '@/models/Product';
import { HttpError } from '@/lib/httpError';
import { defaultBoms, perUnit } from '@/lib/bom';
import { stockByItem } from '@/lib/stockSummary';

// What the BOM screen shows about one BOM: the full multi-level tree with live stock, whether it balances, where its
// item is used, its versions, and "can we build N?". The top level is this very version; levels below use each
// sub-assembly's default BOM, the same as MRP and work orders.

const MAX_DEPTH = 12;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export interface TreeNode {
  product: string; sku: string; name: string; uom: string; productType?: string;
  perParent: number;      // stock units for one unit of the parent, wastage included
  need: number;           // for the quantity asked about, wastage included
  available: number;      // usable and free right now
  onOrder: number;
  bomVersion?: string;    // the item is made from this BOM (its default)
  children: TreeNode[];
}

interface Ctx { boms: Map<string, any>; items: Map<string, any>; stock: Map<string, any> }

async function context(): Promise<Ctx> {
  const [boms, items, stock] = await Promise.all([defaultBoms(), Product.find({}).select('name sku uom productType isScrap').lean() as Promise<any[]>, stockByItem()]);
  return { boms, items: new Map(items.map(p => [String(p._id), p])), stock: new Map(stock.map(s => [s._id, s])) };
}

const lines = (bom: any) => (bom?.components || []).map((c: any) => ({ product: String(c.product?._id || c.product), perParent: perUnit(bom, c) * (1 + (c.wastagePercentage || 0) / 100) }));

function loopError(ctx: Ctx, id: string): never {
  throw new HttpError(400, `The BOMs make a loop at ${ctx.items.get(id)?.sku || id}; fix that BOM first.`);
}

/** The tree for `qty` of the BOM's item: gross quantities at every level, each with its own stock beside it. */
function tree(ctx: Ctx, bom: any, qty: number): TreeNode {
  const node = (id: string, perParent: number, need: number, own: any, depth: number, path: Set<string>): TreeNode => {
    if (depth > MAX_DEPTH || path.has(id)) loopError(ctx, id);
    const p = ctx.items.get(id) || {}, s = ctx.stock.get(id) || {};
    const b = own || ctx.boms.get(id);
    const next = new Set(path).add(id);
    return {
      product: id, sku: p.sku || '', name: p.name || 'Item not found', uom: p.uom || '', productType: p.productType,
      perParent: r4(perParent), need: r4(need), available: s.available || 0, onOrder: s.onOrder || 0, bomVersion: b?.version,
      children: b ? lines(b).map((c: any) => node(c.product, c.perParent, need * c.perParent, null, depth + 1, next)) : [],
    };
  };
  return node(String(bom.product), 1, qty, bom, 0, new Set());
}

export interface Shortage { product: string; sku: string; name: string; uom: string; need: number; available: number; short: number; onOrder: number; made: boolean }

/**
 * Can `qty` be made from the stock there is now? Like MRP: a sub-assembly is taken from stock first and only the rest is
 * made from its own BOM; every item draws from one shared pool, so two lines needing the same part are not both covered
 * by the same units. Returns what is short (bought items, and made items with no BOM to make them from).
 */
function check(ctx: Ctx, bom: any, qty: number): Shortage[] {
  const pool = new Map<string, number>();
  const need = new Map<string, number>();
  const shortBy = new Map<string, number>();
  const take = (id: string, wanted: number) => {
    if (!pool.has(id)) pool.set(id, ctx.stock.get(id)?.available || 0);
    const got = Math.min(pool.get(id)!, wanted);
    pool.set(id, pool.get(id)! - got);
    return got;
  };
  const walk = (b: any, makeQty: number, depth: number, path: Set<string>) => {
    for (const c of lines(b)) {
      if (depth > MAX_DEPTH || path.has(c.product)) loopError(ctx, c.product);
      const wanted = makeQty * c.perParent;
      need.set(c.product, (need.get(c.product) || 0) + wanted);
      const rest = wanted - take(c.product, wanted);
      if (rest <= 1e-9) continue;
      const sub = ctx.boms.get(c.product);
      if (sub) walk(sub, rest, depth + 1, new Set(path).add(c.product));
      else shortBy.set(c.product, (shortBy.get(c.product) || 0) + rest);
    }
  };
  walk(bom, qty, 0, new Set([String(bom.product)]));
  return [...shortBy].filter(([, s]) => s > 1e-6).map(([id, s]) => {
    const p = ctx.items.get(id) || {}, st = ctx.stock.get(id) || {};
    return { product: id, sku: p.sku || '', name: p.name || 'Item not found', uom: p.uom || '', need: r4(need.get(id) || 0), available: st.available || 0, short: r4(s), onOrder: st.onOrder || 0, made: false };
  }).sort((a, b) => a.sku.localeCompare(b.sku));
}

/** The most that can be made from stock now, to 3 decimals (whole units for items counted in pieces). */
function maxBuildable(ctx: Ctx, bom: any, wholeUnits: boolean) {
  if (!lines(bom).length) return 0;
  let lo = 0, hi = 1;
  while (!check(ctx, bom, hi).length && hi < 1e9) { lo = hi; hi *= 2; }
  for (let i = 0; i < 60 && hi - lo > (wholeUnits ? 0.5 : 0.0005); i++) {
    const mid = (lo + hi) / 2;
    if (check(ctx, bom, mid).length) hi = mid; else lo = mid;
  }
  return wholeUnits ? Math.floor(lo + 1e-9) : Math.floor(lo * 1000) / 1000;
}

const COUNTED = new Set(['pcs', 'nos', 'no', 'unit', 'units', 'set', 'sets', 'pair', 'pairs', 'box', 'boxes', 'carton', 'cartons', 'roll', 'rolls', 'sheet', 'sheets', 'ea', 'each']);

/**
 * Do inputs and outputs add up? Only when every line is in the same unit as the item (all kg, say): then
 * inputs = output + scrap + by-products + loss. For mixed units (pcs of frame, litres of paint) there is nothing to add up.
 */
function balance(ctx: Ctx, bom: any) {
  const out = ctx.items.get(String(bom.product));
  const unit = String(out?.uom || '').toLowerCase();
  const sameUnit = (id: string) => String(ctx.items.get(id)?.uom || '').toLowerCase() === unit;
  const comps = (bom.components || []).map((c: any) => String(c.product?._id || c.product));
  const outs = (bom.outputs || []).map((o: any) => String(o.product?._id || o.product));
  if (!unit || COUNTED.has(unit) || !comps.length || ![...comps, ...outs].every(sameUnit)) return { comparable: false as const };
  const base = bom.baseQuantity || 1;
  const input = (bom.components || []).reduce((t: number, c: any) => t + c.quantity * (c.unitFactor || 1) * (1 + (c.wastagePercentage || 0) / 100), 0);
  const sum = (kind: string) => (bom.outputs || []).filter((o: any) => o.kind === kind).reduce((t: number, o: any) => t + o.quantity * (o.unitFactor || 1), 0);
  const scrap = sum('SCRAP'), byProduct = sum('BY_PRODUCT');
  return { comparable: true as const, unit: out.uom, input: r4(input), output: r4(base), scrap: r4(scrap), byProduct: r4(byProduct), loss: r4(input - base - scrap - byProduct) };
}

async function whereUsed(product: string) {
  const boms: any[] = await BillOfMaterials.find({ status: { $ne: 'OBSOLETE' }, $or: [{ 'components.product': product }, { 'outputs.product': product }] })
    .populate('product', 'name sku uom').lean();
  return boms.flatMap(b => {
    const comp = (b.components || []).find((c: any) => String(c.product) === product);
    const out = (b.outputs || []).find((o: any) => String(o.product) === product);
    const line = comp || out;
    return line ? [{
      bom: String(b._id), sku: b.product?.sku, name: b.product?.name, uom: b.product?.uom, version: b.version, status: b.status, isDefault: !!b.isDefault,
      role: comp ? 'COMPONENT' : out.kind, quantity: line.quantity, unit: line.unit, baseQuantity: b.baseQuantity || 1,
    }] : [];
  }).sort((a, b) => String(a.sku).localeCompare(String(b.sku)) || Number(b.isDefault) - Number(a.isDefault));
}

/** Everything the BOM screen shows for one BOM, for `qty` of its item (the BOM's own base quantity when not given). */
export async function exploreBom(bomId: string, qty?: number) {
  const bom: any = await BillOfMaterials.findById(bomId).lean();
  if (!bom) throw new HttpError(404, 'Bill of materials not found.');
  const ctx = await context();
  const n = qty && qty > 0 ? qty : bom.baseQuantity || 1;
  const versions: any[] = await BillOfMaterials.find({ product: bom.product })
    .populate('components.product', 'name sku uom').populate('outputs.product', 'name sku uom').sort({ createdAt: -1 }).lean();
  return { quantity: n, tree: tree(ctx, bom, n), balance: balance(ctx, bom), whereUsed: await whereUsed(String(bom.product)), versions };
}

/** Can `qty` of the BOM's item be made now, what is short, and the most that could be made today. */
export async function canBuild(bomId: string, qty: number) {
  const bom: any = await BillOfMaterials.findById(bomId).lean();
  if (!bom) throw new HttpError(404, 'Bill of materials not found.');
  if (!(qty > 0)) throw new HttpError(400, 'Enter a quantity more than zero.');
  const ctx = await context();
  const shortages = check(ctx, bom, qty);
  const unit = String(ctx.items.get(String(bom.product))?.uom || '').toLowerCase();
  return { quantity: qty, ok: !shortages.length, shortages, maxNow: maxBuildable(ctx, bom, COUNTED.has(unit)) };
}
