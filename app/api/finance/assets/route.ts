import { NextRequest, NextResponse } from 'next/server';
import { canViewFinance } from '@/lib/accessRoles';
import dbConnect from '@/lib/mongodb';
import FixedAsset from '@/models/FixedAsset';
import { verifyAuth } from '@/lib/auth';
import { demoOrThrow } from '@/lib/demoMode';

const memoryAssets: any[] = [
  {
    _id: 'ast-1',
    assetTag: 'AST-WELD-001',
    name: 'Frame Robotic Welding Line',
    category: 'MACHINERY',
    purchaseDate: new Date('2024-01-15').toISOString(),
    originalCost: 2500000,
    salvageValue: 200000,
    usefulLifeYears: 10,
    accumulatedDepreciation: 460000,
    location: 'Building A - Welding Shop',
    status: 'ACTIVE'
  },
  {
    _id: 'ast-2',
    assetTag: 'AST-CNC-002',
    name: 'Automatic Wheel Truing Machine',
    category: 'EQUIPMENT',
    purchaseDate: new Date('2024-06-01').toISOString(),
    originalCost: 1200000,
    salvageValue: 100000,
    usefulLifeYears: 8,
    accumulatedDepreciation: 240000,
    location: 'Building B - Assembly Bay 3',
    status: 'ACTIVE'
  },
  {
    _id: 'ast-3',
    assetTag: 'AST-TRK-003',
    name: 'Tata 16-Ton Logistics Delivery Truck',
    category: 'VEHICLE',
    purchaseDate: new Date('2023-11-20').toISOString(),
    originalCost: 1800000,
    salvageValue: 300000,
    usefulLifeYears: 6,
    accumulatedDepreciation: 620000,
    location: 'JNPT Fleet Yard',
    status: 'ACTIVE'
  }
];

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewFinance(user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });

    try {
      await dbConnect();
      const assets = await FixedAsset.find({}).sort({ createdAt: -1 });
      if (assets.length > 0) {
        return NextResponse.json(assets);
      }
    } catch (dbErr) {
      demoOrThrow(dbErr);
      console.warn('MongoDB query for FixedAssets unavailable, using memory fallback:', dbErr);
    }

    return NextResponse.json(memoryAssets);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    try {
      await dbConnect();
      const asset = await FixedAsset.create(body);
      return NextResponse.json(asset, { status: 201 });
    } catch (dbErr) {
      demoOrThrow(dbErr);
      console.warn('MongoDB create asset failed, using fallback:', dbErr);
      const newAsset = {
        _id: `ast-${Date.now()}`,
        assetTag: `AST-EQP-${Math.floor(100 + Math.random() * 900)}`,
        name: body.name || 'Factory Machinery Asset',
        category: body.category || 'MACHINERY',
        purchaseDate: body.purchaseDate || new Date().toISOString(),
        originalCost: Number(body.originalCost) || 500000,
        salvageValue: Number(body.salvageValue) || 50000,
        usefulLifeYears: Number(body.usefulLifeYears) || 5,
        accumulatedDepreciation: 0,
        location: body.location || 'Main Assembly Works',
        status: 'ACTIVE'
      };
      memoryAssets.unshift(newAsset);
      return NextResponse.json(newAsset, { status: 201 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: 500 });
  }
}
