'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { PdfPreview } from '@/components/workspace/PdfPreview';

/** A "PDF" button that opens the document's PDF in the preview window (print, download, new tab) */
export function PdfButton({ url, title, label = 'PDF', className = 'btn btn-sm btn-secondary' }: { url: string; title: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} title={`Preview ${title}`}><FileText className="h-4 w-4" /> {label}</button>
      {open && <PdfPreview req={{ url, title }} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Where each kind of document's PDF lives */
export const pdfUrl = {
  quotation: (id: string) => `/api/quotations/${id}/pdf`,
  salesOrder: (id: string) => `/api/sales-orders/${id}/pdf`,
  purchaseOrder: (id: string) => `/api/purchase/${id}/pdf`,
  grn: (id: string) => `/api/grn/${id}/pdf`,
  invoice: (id: string) => `/api/finance/invoices/${id}/pdf`,
  challan: (id: string) => `/api/delivery-challans/${id}/pdf`,
  bom: (id: string) => `/api/production/bom/${id}/pdf`,
  jobCard: (workOrderId: string) => `/api/production/${workOrderId}/jobcard/pdf`,
  print: (type: string, id: string, query = '') => `/api/print/${type}/${id}${query ? `?${query}` : ''}`,
};
