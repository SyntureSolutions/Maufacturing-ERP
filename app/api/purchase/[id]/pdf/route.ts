import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { servePrint } from '@/lib/printServe';

// The purchase order as a PDF: exactly what is attached to the vendor email. ?download=1 forces a download.
// It carries supplier contact details and the vendor's acknowledgement link, so only buyers and finance may open it.
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Invalid purchase order.' }, { status: 400 });
  return servePrint(req, 'purchase-order', id);
}
