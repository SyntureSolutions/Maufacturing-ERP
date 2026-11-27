import { NextRequest } from 'next/server';
import { servePrint } from '@/lib/printServe';

// The goods receipt note as a PDF (by id or GRN number)
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return servePrint(req, 'grn', (await context.params).id);
}
