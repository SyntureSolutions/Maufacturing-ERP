import { NextRequest } from 'next/server';
import { servePrint } from '@/lib/printServe';

// GST tax invoice (or, for a purchase invoice, the bill voucher) as a PDF; ?copies=all prints all three copies
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return servePrint(req, 'invoice', (await context.params).id);
}
