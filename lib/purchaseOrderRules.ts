import mongoose from 'mongoose';
import { HttpError } from '@/lib/httpError';
import { toStockUnits } from '@/lib/purchaseUnits';
import { applyDiscount, chargesTotal, cleanCharges } from '@/lib/docCharges';

/** Who may raise a purchase order. Everyone else (HR, Quality, Sales, Staff, Viewer) cannot. */
export const PO_CREATE_ROLES = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER', 'FINANCE_MANAGER'];
/** Who may negotiate prices on a PO that is still waiting for approval. */
export const PO_NEGOTIATE_ROLES = ['ADMIN', 'FINANCE_MANAGER'];

export type PORole = 'SUPPLY_CHAIN_MANAGER' | 'FINANCE_MANAGER' | 'ADMIN';

/** Pick the approval tier for an amount from the configured limits (an amount above a limit moves up a tier). */
export function calculatePOTier(amount: number, thresholds: any) {
  const supplyChainLimit = thresholds?.poSupplyChainLimit ?? 50000;
  const financeLimit = thresholds?.poFinanceLimit ?? 500000;

  if (amount > financeLimit) {
    return {
      tier: 'TIER_3_EXECUTIVE' as const,
      requiredRole: 'ADMIN' as const,
      status: 'PENDING_APPROVAL' as const,
      label: 'Requires Super Admin Approval (> ₹' + financeLimit.toLocaleString('en-IN') + ')',
    };
  } else if (amount > supplyChainLimit) {
    return {
      tier: 'TIER_2_FINANCE' as const,
      requiredRole: 'FINANCE_MANAGER' as const,
      status: 'PENDING_APPROVAL' as const,
      label: 'Requires Finance Manager (CFO) Approval (> ₹' + supplyChainLimit.toLocaleString('en-IN') + ')',
    };
  }
  return {
    tier: 'TIER_1_SUPPLY_CHAIN' as const,
    requiredRole: 'SUPPLY_CHAIN_MANAGER' as const,
    status: 'ORDERED' as const, // under the threshold: the Supply Chain tier may release it
    label: 'Supply Chain / Standard Approval',
  };
}

/** Can this user role sign off a PO that needs `required`? Admin signs anything; Finance signs its own tier and below; Supply Chain / Manager only the lowest tier. */
export function canApprovePO(role: string | undefined, required: PORole | string | undefined) {
  if (!role) return false;
  if (role === 'ADMIN') return true;
  if (required === 'ADMIN') return false;
  if (required === 'FINANCE_MANAGER') return role === 'FINANCE_MANAGER';
  return ['FINANCE_MANAGER', 'SUPPLY_CHAIN_MANAGER', 'MANAGER'].includes(role);
}

const ORDER: Record<string, number> = { SUPPLY_CHAIN_MANAGER: 1, FINANCE_MANAGER: 2, ADMIN: 3 };
/** The approval requirement is never lowered after creation: the stricter of what was stored and what the current total needs. */
export function requiredRoleFor(po: { totalAmount: number; approvalRequiredRole?: string }, thresholds: any): PORole {
  const fromAmount = calculatePOTier(Number(po.totalAmount) || 0, thresholds).requiredRole;
  const stored = (po.approvalRequiredRole || 'SUPPLY_CHAIN_MANAGER') as PORole;
  return (ORDER[stored] || 1) > ORDER[fromAmount] ? stored : fromAmount;
}

/** Statuses a person may move a PO to through the API. Received states are only ever set by a GRN. */
const MANUAL_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING_APPROVAL', 'ORDERED', 'CANCELLED'],
  PENDING_APPROVAL: ['ORDERED', 'DRAFT', 'CANCELLED'],
  ORDERED: ['CANCELLED'],
  PARTIALLY_RECEIVED: [],
  RECEIVED: [],
  CANCELLED: [],
};

export function assertManualTransition(po: any, newStatus: string) {
  if (['RECEIVED', 'PARTIALLY_RECEIVED'].includes(newStatus)) {
    throw new HttpError(409, 'Receive goods through a GRN (Purchase > Goods Receipts) so stock passes the quarantine and QC gate. A PO cannot be marked received by hand.');
  }
  const allowed = MANUAL_TRANSITIONS[po.status];
  if (!allowed) throw new HttpError(409, `PO is in an unknown status '${po.status}'.`);
  if (po.status === newStatus) throw new HttpError(409, `PO is already ${newStatus}.`);
  if (!allowed.includes(newStatus)) throw new HttpError(409, `A PO that is ${po.status} cannot be moved to ${newStatus}.`);
  if (newStatus === 'CANCELLED') assertNothingReceivedOrBilled(po);
}

export function assertNothingReceivedOrBilled(po: any) {
  const touched = (po.items || []).some((i: any) => Number(i.receivedQuantity) > 0 || Number(i.billedQuantity) > 0);
  if (touched) throw new HttpError(409, 'Goods have been received or billed against this PO, so it cannot be cancelled. Return the goods or close the balance instead.');
}

/** Check a new PO's supplier and lines. Returns cleaned items with the line totals computed on the server. */
export function validatePOInput(body: any) {
  const supplier = body?.supplier;
  if (!supplier || !mongoose.isValidObjectId(String(supplier))) throw new HttpError(400, 'Choose a supplier.');
  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'Add at least one item.');
  const seen = new Set<string>();
  const clean = items.map((raw: any, n: number) => {
    const product = raw?.product;
    if (!product || !mongoose.isValidObjectId(String(product))) throw new HttpError(400, `Line ${n + 1}: choose a product.`);
    if (seen.has(String(product))) throw new HttpError(400, `Line ${n + 1}: the product appears twice. Combine the quantities into one line.`);
    seen.add(String(product));
    const quantity = Number(raw.quantity);
    const unitPrice = Number(raw.unitPrice);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpError(400, `Line ${n + 1}: quantity must be more than zero.`);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new HttpError(400, `Line ${n + 1}: unit price cannot be negative.`);
    // a discount makes the unit price the net rate; the list rate and % are kept to show
    const disc = applyDiscount({ unitPrice, discountPercent: raw.discountPercent }, `Line ${n + 1}`);
    const totalPrice = Math.round(quantity * disc.unitPrice * 100) / 100;
    const line: { product: any; quantity: number; unitPrice: number; listPrice?: number; discountPercent?: number; totalPrice: number; lineNo?: number; deliveryDate?: Date; sources?: any[] } = { product, quantity, unitPrice: disc.unitPrice, totalPrice };
    if (disc.discountPercent) { line.listPrice = disc.listPrice; line.discountPercent = disc.discountPercent; }
    if (raw.lineNo !== undefined && raw.lineNo !== null && raw.lineNo !== '') {
      const lineNo = Number(raw.lineNo);
      if (!Number.isInteger(lineNo) || lineNo <= 0) throw new HttpError(400, `Line ${n + 1}: line number must be a positive whole number.`);
      line.lineNo = lineNo;
    }
    if (raw.deliveryDate) {
      const d = new Date(raw.deliveryDate);
      if (isNaN(d.getTime())) throw new HttpError(400, `Line ${n + 1}: delivery date is not a valid date.`);
      line.deliveryDate = d;
    }
    if (raw.sources !== undefined) {
      if (!Array.isArray(raw.sources)) throw new HttpError(400, `Line ${n + 1}: requisition references must be a list.`);
      line.sources = raw.sources;
    }
    return line;
  });
  const charges = cleanCharges(body?.charges);
  const totalAmount = Math.round((clean.reduce((s, i) => s + i.totalPrice, 0) + chargesTotal(charges)) * 100) / 100;
  return { supplier: String(supplier), items: clean, charges, totalAmount };
}

/**
 * Lines typed in the item's purchase unit (a `unit` on the raw line) are turned into stock units: quantity x conversion,
 * rate / conversion. The line remembers the unit so the PO reads in bags to the supplier. Returns the new PO total.
 */
export async function applyOrderUnits(items: any[], rawItems: any[]) {
  const Product = (await import('@/models/Product')).default;
  const products: any[] = await Product.find({ _id: { $in: items.map(i => i.product) } }).select('name uom purchaseUom purchaseConversion').lean();
  items.forEach((line, n) => {
    const p = products.find(x => String(x._id) === String(line.product));
    const unit = rawItems?.[n]?.unit;
    if (!p) return;
    const conv = toStockUnits(line.quantity, line.unitPrice, unit, p);
    if (!conv) throw new HttpError(400, `Line ${n + 1}: ${p.name} is bought in ${p.purchaseUom || p.uom} and kept in ${p.uom}; "${unit}" is not one of its units.`);
    const list = line.listPrice; // typed per order unit too
    Object.assign(line, conv);
    if (list !== undefined && conv.orderFactor) line.listPrice = Math.round((list / conv.orderFactor) * 1e6) / 1e6;
    if (line.discountPercent) line.totalPrice = Math.round(line.quantity * line.unitPrice * 100) / 100;
    if (!conv.orderUnit) { delete line.orderUnit; delete line.orderFactor; }
  });
  return Math.round(items.reduce((s, i) => s + i.totalPrice, 0) * 100) / 100; // lines only; the caller adds the charges
}
