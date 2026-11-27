import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import Product from '@/models/Product';
import Category from '@/models/Category';
import Batch from '@/models/Batch';
import BOM from '@/models/BillOfMaterials';
import PurchaseOrder from '@/models/PurchaseOrder';
import SalesOrder from '@/models/SalesOrder';
import mongoose from 'mongoose';
import { getSession } from '@/lib/auth';
import { statusOf } from '@/lib/httpError';
import { productFields, checkWeights, checkLedgers } from '@/lib/productInput';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await dbConnect();
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const product = await Product.findById(id).populate({ path: 'category', model: Category });
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    return NextResponse.json(product);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await getSession();
    if (!session || !['ADMIN', 'MANAGER'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const change = productFields(await req.json());

    await dbConnect();
    const existing: any = mongoose.isValidObjectId(id) ? await Product.findById(id).select('grossWeight netWeight').lean() : null;
    if (!existing) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    checkWeights(existing, change);
    await checkLedgers(change);
    const product = await Product.findByIdAndUpdate(id, { $set: change }, { new: true, runValidators: true });
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    return NextResponse.json(product); // a failed save is an error, never the request echoed back
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await getSession();
    if (!session || !['ADMIN', 'MANAGER'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    await dbConnect();
    // A product with stock, a BOM or orders is kept so those records stay readable; deactivate it instead.
    const used = (await Batch.exists({ product: id })) || (await BOM.exists({ $or: [{ product: id }, { 'components.product': id }] }))
      || (await PurchaseOrder.exists({ 'items.product': id })) || (await SalesOrder.exists({ 'items.product': id }));
    if (used) return NextResponse.json({ error: 'This product is used on stock, a bill of materials or orders. Mark it inactive instead.' }, { status: 409 });
    const deleted = await Product.findByIdAndDelete(id);
    if (!deleted) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    return NextResponse.json({ message: 'Product deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}
