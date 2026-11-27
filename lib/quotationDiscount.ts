import ApprovalThreshold from '@/models/ApprovalThreshold';
import { HttpError } from '@/lib/httpError';
import { logAuditEvent } from '@/lib/audit';
import { OPEN_STAGES, reviseQuotation } from '@/lib/quotationRevision';
import { discountBetween } from '@/lib/docCharges';

// Discount requests on a quotation (CRM: "Request for discount -> apply discount as per matrix -> approval release").
// The tier comes from the discount limits in Approval Policies (ApprovalThreshold):
//   up to the Sales limit (and the amount ceiling)    -> Sales applies it
//   up to the Finance limit (and the amount ceiling)  -> a Manager or Finance Manager approves
//   anything more                                      -> Admin approves
// An approved discount is applied as a new quotation revision, so the earlier prices stay in the history.

export const DISCOUNT_REQUEST_ROLES = ['ADMIN', 'MANAGER', 'SALES'];
const APPROVERS: Record<'SALES' | 'MANAGER' | 'ADMIN', string[]> = {
  SALES: ['SALES', 'MANAGER', 'FINANCE_MANAGER', 'ADMIN'],
  MANAGER: ['MANAGER', 'FINANCE_MANAGER', 'ADMIN'],
  ADMIN: ['ADMIN'],
};
const DEFAULTS = { discountSalesLimitPercent: 10, discountFinanceLimitPercent: 25, discountAmountLimit: 50000 };

type Actor = { id?: string; name: string; role: string };
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function discountLimits() {
  const t: any = await ApprovalThreshold.findOne().sort({ updatedAt: -1 }).lean();
  return { ...DEFAULTS, ...(t ? { discountSalesLimitPercent: t.discountSalesLimitPercent, discountFinanceLimitPercent: t.discountFinanceLimitPercent, discountAmountLimit: t.discountAmountLimit } : {}) };
}

export function discountTier(percent: number, amount: number, l: typeof DEFAULTS): 'SALES' | 'MANAGER' | 'ADMIN' {
  if (amount > l.discountAmountLimit) return 'ADMIN';
  if (percent <= l.discountSalesLimitPercent) return 'SALES';
  if (percent <= l.discountFinanceLimitPercent) return 'MANAGER';
  return 'ADMIN';
}

const current = (quote: any) => (quote.discountRequests || []).at(-1);

async function apply(quote: any, req: any, user: Actor) {
  const factor = 1 - req.percent / 100;
  // the line keeps its list rate; the % shown is the whole discount from it (an earlier one included)
  const items = quote.items.map((i: any) => {
    const unitPrice = r2(i.unitPrice * factor), listPrice = i.listPrice || i.unitPrice;
    return { product: i.product, productName: i.productName, quantity: i.quantity, unitPrice, ...(listPrice > 0 && unitPrice < listPrice ? { listPrice, discountPercent: discountBetween(listPrice, unitPrice) } : {}) };
  });
  Object.assign(req, { status: 'APPROVED', decidedBy: user.name, decidedRole: user.role, decidedAt: new Date(), appliedRevision: (quote.revision || 1) + 1 });
  await reviseQuotation(quote, { items, note: `Discount ${req.percent}% approved by ${user.name}: ${req.reason}` }, user.name);
}

export async function requestDiscount(quote: any, b: any, user: Actor) {
  if (!DISCOUNT_REQUEST_ROLES.includes(user.role)) throw new HttpError(403, 'Only Sales, a Manager or an Admin can ask for a discount.');
  if (!OPEN_STAGES.includes(quote.stage)) throw new HttpError(409, 'A discount can only be asked for on an open quotation.');
  if (current(quote)?.status === 'PENDING') throw new HttpError(409, 'A discount request on this quotation is already waiting for approval.');
  const percent = Number(b.percent);
  if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) throw new HttpError(400, 'Discount must be more than 0% and less than 100%.');
  const reason = String(b.reason || '').trim();
  if (reason.length < 5) throw new HttpError(400, 'Give a reason for the discount (at least 5 characters).');

  const subTotal = quote.items.reduce((s: number, i: any) => s + i.totalPrice, 0);
  const amount = r2(subTotal * percent / 100);
  const requiredRole = discountTier(percent, amount, await discountLimits());
  quote.discountRequests.push({ percent, amount, reason, requiredRole, status: 'PENDING', requestedBy: user.name, requestedById: user.id, requestedAt: new Date() });
  const req = current(quote);

  // within the requester's own authority it is applied at once
  if (APPROVERS[requiredRole].includes(user.role)) await apply(quote, req, user);
  else await quote.save();
  await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'CREATE', resource: 'Quotation', resourceId: String(quote._id), resourceName: quote.quoteNumber, details: `Discount ${percent}% (₹${amount}) ${req.status === 'APPROVED' ? 'applied' : `requested; needs ${requiredRole.toLowerCase()} approval`}.`, reason }).catch(() => {});
  return { quote, request: req };
}

export async function decideDiscount(quote: any, approve: boolean, remarks: string, user: Actor) {
  const req = current(quote);
  if (req?.status !== 'PENDING') throw new HttpError(409, 'There is no discount request waiting for a decision.');
  if (!APPROVERS[req.requiredRole as 'SALES' | 'MANAGER' | 'ADMIN'].includes(user.role)) throw new HttpError(403, `This discount needs ${req.requiredRole === 'ADMIN' ? 'an Admin' : 'a Manager or Finance Manager'} to decide.`);
  if (user.role !== 'ADMIN' && req.requestedById && req.requestedById === user.id) throw new HttpError(403, 'You cannot approve your own discount request.');
  if (!approve && String(remarks || '').trim().length < 5) throw new HttpError(400, 'Say why the discount is rejected (at least 5 characters).');
  if (!OPEN_STAGES.includes(quote.stage)) throw new HttpError(409, 'The quotation is no longer open.');

  req.remarks = String(remarks || '').trim() || undefined;
  if (approve) await apply(quote, req, user);
  else {
    Object.assign(req, { status: 'REJECTED', decidedBy: user.name, decidedRole: user.role, decidedAt: new Date() });
    await quote.save();
  }
  await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: approve ? 'APPROVE' : 'REJECT', resource: 'Quotation', resourceId: String(quote._id), resourceName: quote.quoteNumber, details: `Discount ${req.percent}% (₹${req.amount}) ${approve ? 'approved and applied' : 'rejected'}.`, reason: req.remarks }).catch(() => {});
  return { quote, request: req };
}
