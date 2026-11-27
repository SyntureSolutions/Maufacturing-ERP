import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { verifyAuth } from '@/lib/auth';
import { canViewParties } from '@/lib/accessRoles';
import dbConnect from '@/lib/mongodb';
import { statusOf } from '@/lib/httpError';
import Customer from '@/models/Customer';
import SalesOrder from '@/models/SalesOrder';
import Quotation from '@/models/Quotation';
import Invoice from '@/models/Invoice';
import { CUSTOMER_WRITE_ROLES, customerData } from '@/lib/customerMaster';

const notFound = () => NextResponse.json({ error: 'Customer not found.' }, { status: 404 });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewParties(user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return notFound();
    await dbConnect();
    const customer = await Customer.findById(id).lean();
    return customer ? NextResponse.json(customer) : notFound();
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}

// Update only the fields sent. The Customer ID (code) cannot change: orders and invoices show it.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!CUSTOMER_WRITE_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return notFound();
    const body = await req.json();
    await dbConnect();
    const existing: any = await Customer.findById(id).select('code country gstin').lean();
    if (!existing) return notFound();
    if (body.code !== undefined && String(body.code).trim() !== existing.code) return NextResponse.json({ error: 'The Customer ID cannot be changed.' }, { status: 400 });
    const data = customerData(body, existing);
    const updated = await Customer.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}

// A customer that appears on any quotation, order or invoice is kept; deactivate it instead.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'MANAGER'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return notFound();
    await dbConnect();
    const used = (await SalesOrder.exists({ customer: id })) || (await Quotation.exists({ customer: id })) || (await Invoice.exists({ customer: id }));
    if (used) return NextResponse.json({ error: 'This customer is used on quotations, orders or invoices. Mark it inactive instead.' }, { status: 409 });
    const deleted = await Customer.findByIdAndDelete(id);
    return deleted ? NextResponse.json({ message: 'Customer deleted.' }) : notFound();
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}
