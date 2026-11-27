import { statusOf } from '@/lib/httpError';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import Product from '@/models/Product';
import Category from '@/models/Category';
import { productFields, checkWeights, checkLedgers } from '@/lib/productInput';
import { demoMode } from '@/lib/demoMode';

const SAMPLE_PRODUCTS = [
  { _id: 'p1', name: 'Apex Urban Commuter Bicycle', sku: 'BIK-URB-001', category: { name: 'Finished Bicycles', slug: 'finished-bicycles' }, uom: 'unit', minStockLevel: 20, price: 18500, purchasePrice: 12000, isActive: true },
  { _id: 'p2', name: 'Velocity Trail Mountain Bike 29er', sku: 'BIK-MTB-002', category: { name: 'Finished Bicycles', slug: 'finished-bicycles' }, uom: 'unit', minStockLevel: 15, price: 32000, purchasePrice: 22000, isActive: true },
  { _id: 'p3', name: 'AeroPro Carbon Road Bike', sku: 'BIK-ROD-003', category: { name: 'Finished Bicycles', slug: 'finished-bicycles' }, uom: 'unit', minStockLevel: 10, price: 65000, purchasePrice: 45000, isActive: true },
  { _id: 'p4', name: 'E-Glide Electric Hybrid Bike 250W', sku: 'BIK-ELE-004', category: { name: 'Finished Bicycles', slug: 'finished-bicycles' }, uom: 'unit', minStockLevel: 10, price: 48000, purchasePrice: 34000, isActive: true },
  { _id: 'p5', name: 'High-Grade Alloy Frame T6', sku: 'RAW-FRM-001', category: { name: 'Frames & Chassis', slug: 'frames-chassis' }, uom: 'pcs', minStockLevel: 100, price: 4500, purchasePrice: 3200, isActive: true },
  { _id: 'p6', name: 'Shimano Deore 11-Speed Drivetrain', sku: 'CMP-DRV-001', category: { name: 'Drivetrains & Transmission', slug: 'drivetrains' }, uom: 'set', minStockLevel: 50, price: 8000, purchasePrice: 6000, isActive: true },
  { _id: 'p7', name: 'Hydraulic Disc Brake Assembly', sku: 'CMP-BRK-001', category: { name: 'Brakes & Steering', slug: 'brakes-steering' }, uom: 'set', minStockLevel: 80, price: 3500, purchasePrice: 2400, isActive: true },
  { _id: 'p8', name: 'Maxxis All-Terrain Tire 29x2.25', sku: 'CMP-TIR-001', category: { name: 'Wheels & Tires', slug: 'wheels-tires' }, uom: 'pcs', minStockLevel: 200, price: 1500, purchasePrice: 950, isActive: true }
];

export async function GET(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect(); // an unreachable database is an error, not an empty list
    if (Category) {}
    const products = await Product.find({}).populate('category', 'name slug').sort({ createdAt: -1 });
    // sample products only in DEMO_MODE: their ids are not real, so they cannot be put on a document
    return NextResponse.json(products.length === 0 && demoMode() ? SAMPLE_PRODUCTS : products);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();

    const payload: Record<string, any> = productFields(body);
    checkWeights(null, payload);
    payload.category = body.category || undefined;

    try {
      await dbConnect();
      // The template gives the Material Group by name; it is the product's category.
      if (!payload.category && String(body.materialGroup || '').trim()) {
        const name = String(body.materialGroup).trim();
        const group: any = await Category.findOne({ name }).collation({ locale: 'en', strength: 2 }).select('_id').lean(); // case-insensitive
        if (!group) return NextResponse.json({ error: `Material group "${name}" is not a known category. Create it first.` }, { status: 400 });
        payload.category = group._id;
      }
      delete payload.materialGroup;
      await checkLedgers(payload);
      const product = await Product.create(payload);
      return NextResponse.json(product, { status: 201 });
    } catch (dbErr) {
      throw dbErr; // never pretend a product was saved
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}
