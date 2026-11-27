import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import MRPRun from '@/models/MRPRun';
import '@/models/Product';
import { demoMode, demoOrThrow } from '@/lib/demoMode';

const SAMPLE_MRP_RUNS = [
  {
    _id: 'mrp-1',
    runDate: new Date('2026-04-05T10:30:00Z').toISOString(),
    status: 'APPROVED',
    generatedBy: { name: 'Admin User' },
    demandInputs: [
      { product: { name: 'Apex Urban Commuter Bicycle', sku: 'BIK-URB-001' }, quantity: 50, requiredDate: '2026-04-15' },
      { product: { name: 'Velocity Trail Mountain Bike 29er', sku: 'BIK-MTB-002' }, quantity: 20, requiredDate: '2026-04-20' }
    ],
    plannedOrders: [
      { product: { name: 'Apex Urban Commuter Bicycle', sku: 'BIK-URB-001' }, quantity: 50, orderType: 'WORK_ORDER', plannedStartDate: '2026-04-06' },
      { product: { name: 'High-Grade Alloy Frame T6', sku: 'RAW-FRM-001' }, quantity: 30, orderType: 'PURCHASE', plannedStartDate: '2026-04-06' },
      { product: { name: 'Shimano Deore 11-Speed Drivetrain', sku: 'CMP-DRV-001' }, quantity: 35, orderType: 'PURCHASE', plannedStartDate: '2026-04-06' },
      { product: { name: 'Maxxis All-Terrain Tire 29x2.25', sku: 'CMP-TIR-001' }, quantity: 80, orderType: 'PURCHASE', plannedStartDate: '2026-04-07' }
    ]
  },
  {
    _id: 'mrp-2',
    runDate: new Date('2026-03-28T14:15:00Z').toISOString(),
    status: 'COMPLETED',
    generatedBy: { name: 'Operations Manager' },
    demandInputs: [
      { product: { name: 'E-Glide Electric Hybrid Bike 250W', sku: 'BIK-ELE-004' }, quantity: 15, requiredDate: '2026-04-10' }
    ],
    plannedOrders: [
      { product: { name: 'E-Glide Electric Hybrid Bike 250W', sku: 'BIK-ELE-004' }, quantity: 15, orderType: 'WORK_ORDER', plannedStartDate: '2026-03-29' },
      { product: { name: '250W Mid-Drive Motor & Battery Pack', sku: 'ELE-MTR-250' }, quantity: 15, orderType: 'PURCHASE', plannedStartDate: '2026-03-29' }
    ]
  }
];

export async function GET(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      await dbConnect();
      const runs = await MRPRun.find().populate('demandInputs.product', 'name sku').populate('plannedOrders.product', 'name sku').sort({ runDate: -1 }).limit(50).lean();
      if (runs.length || !demoMode()) return NextResponse.json(runs);
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample data only in demo mode
    }
    return NextResponse.json(SAMPLE_MRP_RUNS);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
