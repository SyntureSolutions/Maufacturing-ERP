import { NextRequest } from 'next/server';
import { servePrint } from '@/lib/printServe';

// Rule 55 delivery challan as a PDF: all three copies, or one with ?copy=<label>
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return servePrint(req, 'delivery-challan', (await context.params).id);
}
