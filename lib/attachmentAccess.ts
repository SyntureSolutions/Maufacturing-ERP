import { canViewFinance, canViewInvoices } from '@/lib/accessRoles';

/**
 * Every kind of document a file can be attached to, and who may see its files.
 * Files on money documents follow the same rules as the documents; the rest are open to any signed-in role.
 */
export const ATTACHMENT_TYPES = [
  'ENQUIRY', 'QUOTATION', 'SALES_ORDER', 'WORK_ORDER', 'DELIVERY_CHALLAN', 'PROFORMA', 'INVOICE',
  'PURCHASE_INDENT', 'RFQ', 'PURCHASE_ORDER', 'GRN', 'PURCHASE_RETURN', 'VENDOR_BILL', 'BILL_OF_ENTRY', 'VOUCHER',
  'JOBWORK', 'QUALITY_CHECK', 'PROJECT', 'SHIPMENT', 'MRN', 'EXPORT_DOCUMENT',
] as const;

const FINANCE_ONLY = new Set(['VOUCHER', 'VENDOR_BILL', 'BILL_OF_ENTRY']);
const INVOICE_READERS = new Set(['INVOICE', 'PROFORMA', 'DELIVERY_CHALLAN', 'SALES_ORDER', 'QUOTATION']);

export const isAttachmentType = (t: string) => (ATTACHMENT_TYPES as readonly string[]).includes(t);

export function canAccessAttachments(entityType: string, role?: string) {
  if (FINANCE_ONLY.has(entityType)) return canViewFinance(role);
  if (INVOICE_READERS.has(entityType)) return canViewInvoices(role);
  return !!role;
}
