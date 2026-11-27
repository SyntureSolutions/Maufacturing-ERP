import { randomUUID } from 'crypto';
import { ApprovalRule, ApprovalRequest, ApprovalModule } from '@/models/ApprovalMatrix';
import PurchaseOrder from '@/models/PurchaseOrder';
import SalesOrder from '@/models/SalesOrder';
import { approveSalesOrder } from '@/lib/salesOrderApproval';
import { createVoucher } from '@/lib/voucherPosting';
import JobWorkOrder from '@/models/JobWorkOrder';
import { commitOutward, planOutward } from '@/lib/jobworkOutward';
import BillOfMaterials from '@/models/BillOfMaterials';
import { activateBom } from '@/lib/bom';

/** Picks the rule with the highest threshold that the amount reaches (pure; used by tests). */
export function pickRule<T extends { minAmount: number }>(rules: T[], amount: number): T | null {
  const hit = rules.filter(r => amount >= r.minAmount).sort((a, b) => b.minAmount - a.minAmount)[0];
  return hit || null;
}

/** Can this user act on the request's current level? Admins can act on any level. */
export function canAct(request: { status: string; currentLevel: number; levels: { role: string }[] }, role: string) {
  return request.status === 'PENDING' && (role === 'ADMIN' || request.levels[request.currentLevel]?.role === role);
}

export interface ApprovalInput {
  module: ApprovalModule;
  refId?: string;        // the existing document; omitted for documents that are created only once approved
  refNumber: string;
  amount: number;
  requestedBy: string;
  requestedById?: string;
  requestedByRole?: string;
  summary?: string;
  payload?: any;
}

/** Opens an approval request if a rule matches. Returns null when no rule applies (the document follows its normal flow). */
export async function requestApproval(input: ApprovalInput) {
  const rules = await ApprovalRule.find({ module: input.module }).lean() as any[];
  const rule = pickRule(rules, input.amount);
  if (!rule || !rule.levels.length) return null;
  const refId = input.refId || `new-${randomUUID()}`;
  if (input.refId) {
    const existing = await ApprovalRequest.findOne({ module: input.module, refId, status: 'PENDING' });
    if (existing) return existing;
  }
  try {
    return await ApprovalRequest.create({ ...input, refId, levels: rule.levels.map((role: string) => ({ role, status: 'PENDING' })), currentLevel: 0, status: 'PENDING' });
  } catch (err: any) {
    if (err?.code === 11000 && input.refId) return ApprovalRequest.findOne({ module: input.module, refId, status: 'PENDING' }); // simultaneous click: reuse the winner
    throw err;
  }
}

/**
 * Applies the outcome to the source document when the request is fully decided.
 * For APPROVED this may throw (for example a locked period or stock that is no longer there); the caller then leaves the request pending.
 */
export async function applyOutcome(request: any) {
  const last = request.levels[request.levels.length - 1];
  const approver = { id: undefined as string | undefined, name: last?.actedBy || 'Approver', role: last?.role || 'ADMIN' };
  const requester = { id: request.requestedById, name: request.requestedBy };

  switch (request.module as ApprovalModule) {
    case 'PURCHASE_ORDER': {
      if (request.status === 'APPROVED') {
        await PurchaseOrder.updateOne({ _id: request.refId, status: { $in: ['DRAFT', 'PENDING_APPROVAL'] } }, { status: 'ORDERED', approvedBy: { name: last.actedBy, role: last.role, date: last.actedAt } });
      } else if (request.status === 'REJECTED') {
        // Back to DRAFT so it can be amended and resubmitted
        const rejected = request.levels.find((l: any) => l.status === 'REJECTED');
        await PurchaseOrder.updateOne({ _id: request.refId, status: { $in: ['DRAFT', 'PENDING_APPROVAL'] } }, { status: 'DRAFT', notes: `Rejected by ${rejected?.actedBy} (${rejected?.role}): ${rejected?.remarks}` });
      }
      return;
    }
    case 'SALES_ORDER': {
      if (request.status === 'APPROVED') {
        const so: any = await SalesOrder.findById(request.refId).select('status').lean();
        if (so?.status === 'DRAFT') await approveSalesOrder(request.refId, approver); // already approved some other way: nothing to do
        else await SalesOrder.updateOne({ _id: request.refId }, { approvalPending: false });
      } else await SalesOrder.updateOne({ _id: request.refId }, { approvalPending: false });
      return;
    }
    case 'EXPENSE_VOUCHER': case 'PAYMENT_VOUCHER': case 'CREDIT_NOTE': {
      if (request.status !== 'APPROVED') return;
      const voucher = await createVoucher(request.payload, requester, { key: String(request._id) }); // exactly once, even if this step is retried
      request.resultRef = voucher.number;
      return;
    }
    case 'JOB_WORK_OUTWARD': {
      if (request.status !== 'APPROVED') return;
      // a challan already issued for this request (an earlier attempt that failed to record) is reused, never duplicated
      const issued: any = await JobWorkOrder.findOne({ approvalRef: String(request._id) });
      if (issued) { request.resultRef = issued.number; return; }
      // stock is checked again now: it may have changed since the request was raised
      const plan = await planOutward(request.payload);
      const job = await commitOutward(plan, request.payload, request.requestedBy, String(request._id));
      request.resultRef = job.number;
      return;
    }
    case 'BOM_ACTIVATION': {
      if (request.status === 'APPROVED') {
        // checked again on activation: an item may have changed while it waited; if so the request stays pending
        const bom: any = await BillOfMaterials.findById(request.refId).select('status').lean();
        if (bom?.status === 'PENDING_APPROVAL') await activateBom(request.refId, last.actedBy || 'Approver');
      } else if (request.status === 'REJECTED') {
        const rejected = request.levels.find((l: any) => l.status === 'REJECTED');
        await BillOfMaterials.updateOne({ _id: request.refId, status: 'PENDING_APPROVAL' }, { status: 'DRAFT', rejection: { by: rejected?.actedBy, role: rejected?.role, remarks: rejected?.remarks, at: rejected?.actedAt || new Date() } });
      }
      return;
    }
  }
}
