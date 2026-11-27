'use client';

import { PdfButton, pdfUrl } from '@/components/workspace/PdfButton';

// Shop-floor job card for a work order (what to make, material to draw, routing, sign-off boxes), shown as a PDF
export default function JobCardButton({ workOrderId, label = 'Job card' }: { workOrderId: string; label?: string }) {
  return <PdfButton url={pdfUrl.jobCard(workOrderId)} title={label} label={label} />;
}
