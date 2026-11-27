import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { verifyAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import { statusOf } from '@/lib/httpError';
import Supplier from '@/models/Supplier';
import PurchaseOrder from '@/models/PurchaseOrder';
import GRN from '@/models/GRN';
import Invoice from '@/models/Invoice';
import { SUPPLIER_WRITE_ROLES, supplierData } from '@/lib/supplierMaster';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await dbConnect();
    const supplier = await Supplier.findById(id);
    return supplier ? NextResponse.json(supplier) : NextResponse.json({ error: 'Supplier not found.' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}

// Update only the fields sent. The Vendor ID (code) cannot change: purchase orders and bills show it.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!SUPPLIER_WRITE_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const body = await req.json();
    await dbConnect();
    const existing: any = await Supplier.findById(id).select('code country gstin').lean();
    if (!existing) return NextResponse.json({ error: 'Supplier not found.' }, { status: 404 });
    if (body.code !== undefined && String(body.code).trim() !== existing.code) return NextResponse.json({ error: 'The Vendor ID cannot be changed.' }, { status: 400 });
    const data = await supplierData(body, existing);
    const updated = await Supplier.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}

// A supplier that appears on any purchase order, receipt or bill is kept; deactivate it instead.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'MANAGER'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Supplier not found.' }, { status: 404 });
    await dbConnect();
    const used = (await PurchaseOrder.exists({ supplier: id })) || (await GRN.exists({ supplier: id })) || (await Invoice.exists({ supplier: id }));
    if (used) return NextResponse.json({ error: 'This supplier is used on purchase orders, receipts or bills. Mark it inactive instead.' }, { status: 409 });
    const deleted = await Supplier.findByIdAndDelete(id);
    return deleted ? NextResponse.json({ message: 'Supplier deleted.' }) : NextResponse.json({ error: 'Supplier not found.' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}
