import mongoose from 'mongoose';
import BillOfMaterials from '@/models/BillOfMaterials';
import Product from '@/models/Product';
import { HttpError } from '@/lib/httpError';

// Bills of materials: the checks a BOM must pass, the scaling every user of a BOM shares, and activation.

/** Roles that can create, edit and activate BOMs. Who must approve an activation is set by the Admin in the approval matrix. */
export const BOM_EDIT_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'];

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Stock units of a component needed for ONE stock unit of the BOM's product, before wastage. */
export function perUnit(bom: { baseQuantity?: number }, c: { quantity: number; unitFactor?: number }) {
  return r6((c.quantity * (c.unitFactor || 1)) / (bom.baseQuantity || 1));
}

/** Stock units of a component a work order for `qty` of the product needs, wastage included. */
export function requiredFor(bom: { baseQuantity?: number }, c: { quantity: number; unitFactor?: number; wastagePercentage?: number }, qty: number) {
  return Math.ceil(perUnit(bom, c) * qty * (1 + (c.wastagePercentage || 0) / 100) * 10000) / 10000;
}

/** What the other outputs of a BOM should come to when `qty` of the product is made, in each item's stock unit. */
export function expectedOutputs(bom: { baseQuantity?: number; outputs?: any[] }, qty: number) {
  return (bom.outputs || []).map(o => ({ product: String(o.product?._id || o.product), kind: o.kind as 'SCRAP' | 'BY_PRODUCT', expectedQty: Math.round(perUnit(bom, o) * qty * 10000) / 10000 }));
}

/** Scrap and by-product lines for a job card: expected for the planned quantity, and what was recorded once the work is done. */
export async function jobCardOutputs(bom: any, wo: any) {
  const expected = expectedOutputs(bom || {}, wo.quantity || 1);
  if (!expected.length) return [];
  const items: any[] = await Product.find({ _id: { $in: expected.map(e => e.product) } }).select('name sku uom').lean();
  return expected.map(e => {
    const p = items.find(x => String(x._id) === e.product);
    const got = (wo.otherOutputs || []).find((o: any) => String(o.product) === e.product);
    return { product: p?.name || e.product, sku: p?.sku, uom: p?.uom, kind: e.kind, expected: e.expectedQty, actual: wo.otherOutputsRecordedAt ? got?.actualQty ?? 0 : null };
  });
}

/**
 * The ACTIVE BOM each product is made from: its default one, or (for BOMs from before defaults existed) the most recently updated ACTIVE one.
 */
export async function defaultBoms(products?: any[]): Promise<Map<string, any>> {
  const filter: any = { status: 'ACTIVE', ...(products ? { product: { $in: products } } : {}) };
  const boms = await BillOfMaterials.find(filter).sort({ isDefault: 1, updatedAt: 1 }).lean() as any[];
  const map = new Map<string, any>();
  for (const b of boms) map.set(String(b.product), b); // ascending, so the default (then the latest) wins
  return map;
}

/** A line's unit must be the item's stock unit or its purchase unit; returns it as the item master spells it, with its factor. */
function unitOf(p: any, given: any, at: string) {
  const asked = String(given || p.uom).trim().toLowerCase();
  if (asked === String(p.uom).toLowerCase()) return { unit: p.uom, unitFactor: 1 };
  if (p.purchaseUom && asked === String(p.purchaseUom).toLowerCase()) return { unit: p.purchaseUom, unitFactor: p.purchaseConversion || 1 };
  throw new HttpError(400, `${at}: ${p.name} is kept in ${p.uom}${p.purchaseUom ? ` (bought in ${p.purchaseUom})` : ''}; "${asked}" is not one of its units.`);
}

const num = (v: any) => (v === '' || v === null || v === undefined ? NaN : Number(v));

export interface BomInput {
  product: string;
  version?: string;
  baseQuantity: number;
  notes?: string;
  components: { product: string; quantity: number; unit: string; unitFactor: number; wastagePercentage: number }[];
  outputs: { product: string; kind: 'SCRAP' | 'BY_PRODUCT'; quantity: number; unit: string; unitFactor: number }[];
  routingSteps: { stepNumber: number; description: string; machineType?: string; estimatedTimeMinutes: number }[];
}

/**
 * Checks a BOM sent from the screen and returns only the fields a user may set. Units come from the item master:
 * a line is in the component's stock unit or its purchase unit (converted with the item's purchase conversion).
 * `keep` holds the current values when editing, so fields left out are not wiped.
 */
export async function cleanBomInput(body: any, keep?: any): Promise<BomInput> {
  const product = String(body.product ?? keep?.product ?? '');
  if (!mongoose.isValidObjectId(product)) throw new HttpError(400, 'Choose the item this BOM makes.');
  const output: any = await Product.findById(product).select('name sku uom productType isActive').lean();
  if (!output) throw new HttpError(400, 'The item this BOM makes was not found.');
  if (output.productType === 'SERVICE') throw new HttpError(400, 'A service cannot have a bill of materials.');

  const baseQuantity = num(body.baseQuantity ?? keep?.baseQuantity ?? 1);
  if (!(baseQuantity > 0)) throw new HttpError(400, `Base quantity must be more than zero (how many ${output.uom} this BOM makes).`);

  const lines: any[] = Array.isArray(body.components) ? body.components : keep?.components || [];
  if (!lines.length) throw new HttpError(400, 'Add at least one component.');
  const ids = lines.map(l => String(l.product?._id || l.product || ''));
  if (ids.some(i => !mongoose.isValidObjectId(i))) throw new HttpError(400, 'Choose an item on every component line.');
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'An item is on the BOM twice. Put its full quantity on one line.');
  // other outputs: scrap and by-products the batch also gives
  const outLines: any[] = Array.isArray(body.outputs) ? body.outputs : keep?.outputs || [];
  const outIds = outLines.map(l => String(l.product?._id || l.product || ''));
  if (outIds.some(i => !mongoose.isValidObjectId(i))) throw new HttpError(400, 'Choose an item on every scrap / by-product line.');
  if (new Set(outIds).size !== outIds.length) throw new HttpError(400, 'An item is on the scrap / by-product list twice.');
  const items: any[] = await Product.find({ _id: { $in: [...ids, ...outIds] } }).select('name sku uom purchaseUom purchaseConversion productType isScrap').lean();
  const byId = new Map(items.map(p => [String(p._id), p]));

  const components = lines.map((l, n) => {
    const p = byId.get(ids[n]);
    const at = `Line ${n + 1}`;
    if (!p) throw new HttpError(400, `${at}: the item was not found.`);
    if (ids[n] === product) throw new HttpError(400, `${at}: ${p.name} cannot be a component of itself.`);
    if (p.productType === 'SERVICE') throw new HttpError(400, `${at}: ${p.name} is a service, not a material.`);
    const quantity = num(l.quantity);
    if (!(quantity > 0)) throw new HttpError(400, `${at}: quantity of ${p.name} must be more than zero.`);
    const wastagePercentage = l.wastagePercentage === undefined || l.wastagePercentage === '' ? 0 : num(l.wastagePercentage);
    if (!(wastagePercentage >= 0 && wastagePercentage < 100)) throw new HttpError(400, `${at}: wastage of ${p.name} must be from 0 to below 100%.`);
    return { product: ids[n], quantity, ...unitOf(p, l.unit, at), wastagePercentage };
  });

  const outputs = outLines.map((l, n) => {
    const p = byId.get(outIds[n]);
    const at = `Scrap / by-product line ${n + 1}`;
    if (!p) throw new HttpError(400, `${at}: the item was not found.`);
    if (outIds[n] === product) throw new HttpError(400, `${at}: ${p.name} is what this BOM makes, not a by-product of it.`);
    if (ids.includes(outIds[n])) throw new HttpError(400, `${at}: ${p.name} is also a component. An item cannot go in and come out of the same BOM.`);
    if (p.productType === 'SERVICE') throw new HttpError(400, `${at}: ${p.name} is a service, not a material.`);
    const kind = String(l.kind || '').toUpperCase();
    if (kind !== 'SCRAP' && kind !== 'BY_PRODUCT') throw new HttpError(400, `${at}: say whether ${p.name} is scrap or a by-product.`);
    if (kind === 'SCRAP' && !p.isScrap) throw new HttpError(400, `${at}: ${p.name} is not marked as a scrap item in the item master. Mark it as scrap there, or list it as a by-product.`);
    if (kind === 'BY_PRODUCT' && p.isScrap) throw new HttpError(400, `${at}: ${p.name} is a scrap item, so list it as scrap.`);
    const quantity = num(l.quantity);
    if (!(quantity > 0)) throw new HttpError(400, `${at}: expected quantity of ${p.name} must be more than zero.`);
    return { product: outIds[n], kind: kind as 'SCRAP' | 'BY_PRODUCT', quantity, ...unitOf(p, l.unit, at) };
  });

  const steps: any[] = Array.isArray(body.routingSteps) ? body.routingSteps : keep?.routingSteps || [];
  const routingSteps = steps.map((s, n) => {
    const description = String(s.description || '').trim();
    if (!description) throw new HttpError(400, `Operation ${n + 1} needs a description.`);
    const minutes = s.estimatedTimeMinutes === undefined || s.estimatedTimeMinutes === '' ? 0 : num(s.estimatedTimeMinutes);
    if (!(minutes >= 0)) throw new HttpError(400, `Operation ${n + 1}: time must be zero or more minutes.`);
    return { stepNumber: n + 1, description, machineType: String(s.machineType || '').trim() || undefined, estimatedTimeMinutes: minutes };
  });

  const version = body.version === undefined ? undefined : String(body.version).trim();
  if (version !== undefined && !version) throw new HttpError(400, 'Give the BOM a version.');
  const notes = body.notes === undefined ? keep?.notes : String(body.notes).trim() || undefined;
  return { product, version, baseQuantity, notes, components, outputs, routingSteps };
}

/**
 * Refuses a BOM whose components lead back to its own product through the BOMs in use (A needs B, B needs A).
 * The BOM being checked replaces the product's current default for the check.
 */
export async function assertNoLoop(product: string, componentIds: string[]) {
  const boms = await defaultBoms();
  const names = new Map<string, string>();
  const children = (id: string) => (id === product ? componentIds : (boms.get(id)?.components || []).map((c: any) => String(c.product)));
  const seen = new Set<string>();
  const walk = (id: string, path: string[]): string[] | null => {
    for (const c of children(id)) {
      if (c === product) return [...path, c];
      if (seen.has(c)) continue;
      seen.add(c);
      const hit = walk(c, [...path, c]);
      if (hit) return hit;
    }
    return null;
  };
  const loop = walk(product, [product]);
  if (!loop) return;
  for (const p of await Product.find({ _id: { $in: loop } }).select('sku name').lean() as any[]) names.set(String(p._id), p.sku || p.name);
  throw new HttpError(400, `This BOM makes a loop: ${loop.map(i => names.get(i) || i).join(' → ')}. An item cannot be made from itself.`);
}

/** The next free version label for a product: one more than the highest numbered version so far. */
export async function nextVersion(product: string) {
  const versions = (await BillOfMaterials.find({ product }).select('version').lean() as any[]).map(b => parseFloat(String(b.version).replace(/^v/i, '')));
  const top = Math.max(0, ...versions.filter(Number.isFinite));
  return String(Math.floor(top) + 1);
}

/**
 * Makes a BOM the product's default: checks it again (items may have changed since it was written), retires the previous
 * default as OBSOLETE and activates this one. Only a DRAFT or PENDING_APPROVAL BOM can be activated.
 */
export async function activateBom(bomId: string, by: string) {
  const bom: any = await BillOfMaterials.findById(bomId).lean();
  if (!bom) throw new HttpError(404, 'Bill of materials not found.');
  if (!['DRAFT', 'PENDING_APPROVAL'].includes(bom.status)) throw new HttpError(409, `This BOM is ${bom.status.toLowerCase().replace('_', ' ')}; only a draft can be activated.`);
  const clean = await cleanBomInput({}, bom);
  await assertNoLoop(clean.product, clean.components.map(c => c.product));

  const now = new Date();
  const previous: any[] = await BillOfMaterials.find({ product: bom.product, status: 'ACTIVE', _id: { $ne: bom._id } }).select('_id isDefault').lean();
  await BillOfMaterials.updateMany({ _id: { $in: previous.map(p => p._id) } }, { status: 'OBSOLETE', isDefault: false, obsoletedAt: now });
  const done = await BillOfMaterials.findOneAndUpdate(
    { _id: bom._id, status: bom.status },
    { status: 'ACTIVE', isDefault: true, activatedBy: by, activatedAt: now, $unset: { rejection: 1 } },
    { returnDocument: 'after' },
  ).catch(async (err: any) => {
    await restore(previous);
    if (err?.code === 11000) throw new HttpError(409, 'Another version of this item was activated at the same moment. Refresh and try again.');
    throw err;
  });
  if (!done) {
    await restore(previous); // someone else changed it in between: put the old default back
    throw new HttpError(409, 'This BOM was changed while it was being activated. Refresh and try again.');
  }
  return done;
}

async function restore(previous: any[]) {
  for (const p of previous) await BillOfMaterials.updateOne({ _id: p._id }, { status: 'ACTIVE', isDefault: !!p.isDefault, $unset: { obsoletedAt: 1 } });
}
