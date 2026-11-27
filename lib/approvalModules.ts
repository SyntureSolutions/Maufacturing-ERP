// Documents that can be put behind the approval matrix. Safe to import in the browser (no database code).

export const APPROVAL_MODULES = ['PURCHASE_ORDER', 'SALES_ORDER', 'EXPENSE_VOUCHER', 'PAYMENT_VOUCHER', 'CREDIT_NOTE', 'JOB_WORK_OUTWARD', 'BOM_ACTIVATION'] as const;
export type ApprovalModule = (typeof APPROVAL_MODULES)[number];

/** noAmount: the rule applies to every document of the type; there is no value to compare with a threshold. */
export const MODULE_INFO: Record<ApprovalModule, { label: string; basis: string; holds: string; noAmount?: boolean }> = {
  PURCHASE_ORDER: { label: 'Purchase orders', basis: 'PO total', holds: 'The PO stays a draft until every level approves; a rejection sends it back for amendment.' },
  SALES_ORDER: { label: 'Sales orders', basis: 'Order total', holds: 'The order stays in draft, with no stock reserved, until approved.' },
  EXPENSE_VOUCHER: { label: 'Expense vouchers', basis: 'Expense incl. GST', holds: 'Nothing is posted to the books until approved.' },
  PAYMENT_VOUCHER: { label: 'Bank / cash payments', basis: 'Payment amount', holds: 'The payment is not posted, and no invoice is settled, until approved.' },
  CREDIT_NOTE: { label: 'Credit notes', basis: 'Credit note incl. GST', holds: 'The credit is not posted and the invoice stays unchanged until approved.' },
  JOB_WORK_OUTWARD: { label: 'Outward job work', basis: 'Value of material sent', holds: 'No stock leaves and no challan is issued until approved.' },
  BOM_ACTIVATION: { label: 'BOM activation', basis: 'Every new BOM version', holds: 'The new version waits as pending and cannot be edited; work orders and MRP keep using the current version until it is approved. A rejection sends it back to draft.', noAmount: true },
};

export const isApprovalModule = (m: unknown): m is ApprovalModule => (APPROVAL_MODULES as readonly string[]).includes(String(m));
