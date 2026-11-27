import { NextRequest } from 'next/server';
import { servePrint } from '@/lib/printServe';

// The sales order as a PDF (by id or SO number), GST worked out as on the sales order screen
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return servePrint(req, 'sales-order', (await context.params).id);
}
