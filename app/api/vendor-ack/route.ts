import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PurchaseOrder from '@/models/PurchaseOrder';
import '@/models/Supplier';
import '@/models/Product';

// Public endpoints (no login): the vendor opens the emailed link. The unguessable token is the credential.
const TOKEN_RE = /^[a-f0-9]{32}$/;

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || '';
    if (!TOKEN_RE.test(token)) return NextResponse.json({ error: 'Invalid link.' }, { status: 400 });
    await dbConnect();
    const po: any = await PurchaseOrder.findOne({ 'dispatch.ackToken': token }).populate('supplier', 'name').populate('items.product', 'name sku').lean();
    if (!po) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 });
    return NextResponse.json({
      poNumber: po.poNumber, supplier: po.supplier?.name, totalAmount: po.totalAmount, expectedDeliveryDate: po.expectedDeliveryDate, acknowledgedAt: po.dispatch?.ackAt,
      items: po.items.map((i: any) => ({ name: i.product?.name, sku: i.product?.sku, quantity: i.quantity, unitPrice: i.unitPrice })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { token, name } = await req.json();
    if (!TOKEN_RE.test(String(token))) return NextResponse.json({ error: 'Invalid link.' }, { status: 400 });
    if (!String(name || '').trim()) return NextResponse.json({ error: 'Enter your name to acknowledge.' }, { status: 400 });
    await dbConnect();
    const res = await PurchaseOrder.updateOne({ 'dispatch.ackToken': token, 'dispatch.ackAt': { $exists: false } }, { $set: { 'dispatch.ackAt': new Date(), 'dispatch.ackBy': String(name).trim().slice(0, 80) } });
    if (!res.matchedCount) return NextResponse.json({ error: 'Already acknowledged or link not valid.' }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
