import { NextRequest } from 'next/server';
import { servePrint } from '@/lib/printServe';

// GET /api/print/<type>/<id or number>: the PDF of a document that has no PDF route of its own (see lib/printDocs)
export async function GET(req: NextRequest, context: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await context.params;
  return servePrint(req, type, id);
}
