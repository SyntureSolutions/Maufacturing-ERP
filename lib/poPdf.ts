// Checks made before a purchase order PDF is e-mailed to a vendor (the PDF itself is laid out by lib/printLayout).
export { safeFileName } from '@/lib/documentPdf';

const UNSUPPORTED = /[^\x20-\x7E\xA0-\xFF\r\n\t\u20B9]/;
/** True when any text that will be printed contains characters the PDF's standard fonts cannot draw (they print as "?") */
export function hasUnsupportedText(po: any, company?: any): boolean {
  const parts = [po?.poNumber, po?.notes, po?.supplier?.name, po?.supplier?.address, po?.supplier?.paymentTerms, company?.legalName, company?.address1, company?.address2, company?.city,
    ...(po?.items || []).flatMap((i: any) => [i?.product?.name, i?.product?.sku])];
  return parts.some(p => typeof p === 'string' && UNSUPPORTED.test(p));
}
