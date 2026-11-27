import type { NotifyChannel, NotifyEvent } from '@/models/Notification';

export const EVENT_VARIABLES: Record<NotifyEvent, string[]> = {
  PO_DISPATCH: ['poNumber', 'supplierName', 'totalAmount', 'expectedDelivery', 'ackLink', 'companyName'],
  ORDER_CONFIRMATION: ['orderNumber', 'customerName', 'totalAmount', 'deliveryDate', 'companyName'],
  FOLLOWUP_DUE: ['enquiryNumber', 'customerName', 'mode', 'dueAt', 'notes', 'companyName'],
  DISPATCH_ALERT: ['challanNumber', 'orderNumber', 'customerName', 'transporterName', 'vehicleNo', 'lrNo', 'companyName'],
};

/** Replaces {{variable}} tokens; unknown variables are left blank rather than printed raw. */
export function renderTemplate(text: string, vars: Record<string, string | number | undefined>) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => (vars[key] === undefined || vars[key] === null ? '' : String(vars[key])));
}

/** Variables used in a template that the event does not provide (shown as a warning in the editor) */
export function unknownVariables(text: string, event: NotifyEvent) {
  const used = [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]);
  return [...new Set(used.filter(v => !EVENT_VARIABLES[event].includes(v)))];
}

export const DEFAULT_TEMPLATES: { event: NotifyEvent; channel: NotifyChannel; subject?: string; body: string }[] = [
  { event: 'PO_DISPATCH', channel: 'EMAIL', subject: 'Purchase Order {{poNumber}} from {{companyName}}', body: 'Dear {{supplierName}},\n\nPlease find our purchase order {{poNumber}} for INR {{totalAmount}} attached as a PDF. Expected delivery: {{expectedDelivery}}.\n\nKindly acknowledge receipt: {{ackLink}}\n\nRegards,\n{{companyName}}' },
  { event: 'PO_DISPATCH', channel: 'WHATSAPP', body: 'PO {{poNumber}} (INR {{totalAmount}}) sent to {{supplierName}}. Please acknowledge: {{ackLink}}' },
  { event: 'ORDER_CONFIRMATION', channel: 'EMAIL', subject: 'Order {{orderNumber}} confirmed', body: 'Dear {{customerName}},\n\nYour order {{orderNumber}} for INR {{totalAmount}} is confirmed. Planned delivery: {{deliveryDate}}.\n\nRegards,\n{{companyName}}' },
  { event: 'ORDER_CONFIRMATION', channel: 'SMS', body: '{{companyName}}: order {{orderNumber}} (INR {{totalAmount}}) confirmed. Delivery {{deliveryDate}}.' },
  { event: 'FOLLOWUP_DUE', channel: 'EMAIL', subject: 'Follow-up due: {{customerName}} ({{enquiryNumber}})', body: 'A {{mode}} follow-up with {{customerName}} for enquiry {{enquiryNumber}} was due {{dueAt}}.\n\nNotes: {{notes}}\n\n{{companyName}} CRM' },
  { event: 'DISPATCH_ALERT', channel: 'EMAIL', subject: 'Your order {{orderNumber}} has been dispatched', body: 'Dear {{customerName}},\n\nOrder {{orderNumber}} is on its way via {{transporterName}} (vehicle {{vehicleNo}}, LR {{lrNo}}). Delivery challan: {{challanNumber}}.\n\nRegards,\n{{companyName}}' },
  { event: 'DISPATCH_ALERT', channel: 'SMS', body: '{{companyName}}: order {{orderNumber}} dispatched via {{transporterName}}, vehicle {{vehicleNo}}, LR {{lrNo}}.' },
];
