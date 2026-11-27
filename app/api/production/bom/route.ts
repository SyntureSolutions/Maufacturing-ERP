import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import BillOfMaterials from '@/models/BillOfMaterials';
import '@/models/Product';
import { verifyAuth } from '@/lib/auth';
import { statusOf } from '@/lib/httpError';
import { BOM_EDIT_ROLES, assertNoLoop, cleanBomInput, nextVersion } from '@/lib/bom';

// Bills of materials. GET lists them (?product= for one item's versions); POST creates a new BOM as a draft.

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const product = req.nextUrl.searchParams.get('product');
    const filter = product && mongoose.isValidObjectId(product) ? { product } : {};
    const boms = await BillOfMaterials.find(filter)
      .populate('product', 'name sku uom productType')
      .populate('components.product', 'name sku uom purchaseUom purchaseConversion')
      .populate('outputs.product', 'name sku uom purchaseUom purchaseConversion isScrap')
      .sort({ updatedAt: -1 })
      .lean();
    return NextResponse.json(boms);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!BOM_EDIT_ROLES.includes(user.role)) return NextResponse.json({ error: 'Only an Admin, Manager or Production Manager can create a bill of materials.' }, { status: 403 });
    await dbConnect();
    const clean = await cleanBomInput(await req.json());
    await assertNoLoop(clean.product, clean.components.map(c => c.product));
    const version = clean.version || await nextVersion(clean.product);
    if (await BillOfMaterials.exists({ product: clean.product, version })) return NextResponse.json({ error: `Version ${version} already exists for this item. Use another version.` }, { status: 409 });
    const bom = await BillOfMaterials.create({ ...clean, version, status: 'DRAFT', isDefault: false, createdBy: user.name });
    return NextResponse.json(bom, { status: 201 });
  } catch (err: any) {
    if (err?.code === 11000) return NextResponse.json({ error: 'That version already exists for this item. Use another version.' }, { status: 409 });
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
