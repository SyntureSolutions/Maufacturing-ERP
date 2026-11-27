import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import Quotation from '@/models/Quotation';
import { verifyAuth } from '@/lib/auth';
import { statusOf } from '@/lib/httpError';
import { reviseQuotation } from '@/lib/quotationRevision';
const ROLES = ['ADMIN', 'MANAGER', 'SALES'];

// All revisions (history + current) for the compare drawer
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Invalid quotation.' }, { status: 400 });
    await dbConnect();
    const q: any = await Quotation.findById(id).lean();
    if (!q) return NextResponse.json({ error: 'Quotation not found.' }, { status: 404 });
    const current = { rev: q.revision || 1, items: q.items, totalAmount: q.totalAmount, paymentTerms: q.paymentTerms, validUntil: q.validUntil, terms: q.terms, taxSummary: q.taxSummary, at: q.updatedAt, current: true };
    return NextResponse.json({ quoteNumber: q.quoteNumber, customerName: q.customerName, revisions: [...(q.revisions || []), current].sort((a: any, b: any) => a.rev - b.rev) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Create the next revision: the current state is snapshotted, then the changes are applied and GST recalculated
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Invalid quotation.' }, { status: 400 });
    const b = await req.json();

    await dbConnect();
    const quote: any = await Quotation.findById(id);
    if (!quote) return NextResponse.json({ error: 'Quotation not found.' }, { status: 404 });
    if ((quote.discountRequests || []).at(-1)?.status === 'PENDING') return NextResponse.json({ error: 'A discount request is waiting for approval; decide it before revising the quotation.' }, { status: 409 });
    await reviseQuotation(quote, b, user.name);
    return NextResponse.json(quote);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
