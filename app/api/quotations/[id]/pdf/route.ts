import { NextRequest } from 'next/server';
import { servePrint } from '@/lib/printServe';

// The quotation as a PDF (by id or quote number), with the GST saved on it
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return servePrint(req, 'quotation', (await context.params).id);
}
