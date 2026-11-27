import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import MRPRun from '@/models/MRPRun';
import { verifyAuth } from '@/lib/auth';
import { gatherDemand, runMRP } from '@/lib/mrpEngine';
import { planForSalesOrder } from '@/lib/salesOrderMrp';
import { statusOf } from '@/lib/httpError';
import { demoOrThrow } from '@/lib/demoMode';

const ORDER_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'SUPPLY_CHAIN_MANAGER'];

// Body: { includeOrders?, includeForecast?, months?, preview?, demandInputs?: manual extra demand }
export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const months = Math.min(Math.max(Number(body.months) || 3, 1), 12);

    try {
      await dbConnect();
    } catch (dbErr) {
      demoOrThrow(dbErr); // an invented run only in demo mode
      return NextResponse.json(fallbackRun(body.demandInputs), { status: 201 });
    }

    // Run for one customer order: only that order's demand, tagged to it
    if (body.salesOrderId !== undefined) {
      if (!ORDER_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      if (!mongoose.isValidObjectId(body.salesOrderId)) return NextResponse.json({ error: 'Invalid sales order.' }, { status: 400 });
      const { so, matrix, demandCount } = await planForSalesOrder(String(body.salesOrderId));
      if (body.preview) return NextResponse.json({ matrix, demandCount, salesOrder: so.soNumber });
      const now = new Date();
      const run = await MRPRun.create({
        generatedBy: mongoose.isValidObjectId(user.id) ? user.id : '65f011111111111111111100',
        salesOrder: so._id, sourceType: 'SO_DRIVEN',
        demandInputs: so.items.map((i: any) => ({ product: i.product, quantity: i.quantity, requiredDate: so.deliveryDate || now, source: `Sales Order ${so.soNumber}` })),
        plannedOrders: matrix.filter(r => r.netIndentQty > 0).map(r => ({ product: r.product, quantity: r.netIndentQty, orderType: r.orderType, plannedStartDate: now, plannedReleaseDate: now })),
        matrix, status: 'APPROVED',
      });
      return NextResponse.json(run, { status: 201 });
    }

    const demand = await gatherDemand({ includeOrders: body.includeOrders !== false, includeForecast: body.includeForecast !== false, months });
    for (const d of body.demandInputs || []) {
      if (mongoose.isValidObjectId(d.product) && Number(d.quantity) > 0) {
        demand.push({ product: String(d.product), quantity: Number(d.quantity), requiredDate: new Date(d.requiredDate || Date.now()), source: 'Manual' });
      }
    }
    const matrix = await runMRP(demand);

    if (body.preview) return NextResponse.json({ matrix, demandCount: demand.length });

    const now = new Date();
    const run = await MRPRun.create({
      generatedBy: mongoose.isValidObjectId(user.id) ? user.id : '65f011111111111111111100',
      demandInputs: demand.map(d => ({ product: d.product, quantity: d.quantity, requiredDate: d.requiredDate, source: d.source })),
      plannedOrders: matrix.filter(r => r.netIndentQty > 0).map(r => ({
        product: r.product, quantity: r.netIndentQty, orderType: r.orderType, plannedStartDate: now, plannedReleaseDate: now,
      })),
      matrix,
      status: 'APPROVED',
    });
    return NextResponse.json(run, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}

function fallbackRun(demandInputs: any[] = []) {
  const today = new Date().toISOString().split('T')[0];
  return {
    _id: `mrp-${Date.now()}`,
    runDate: new Date().toISOString(),
    status: 'APPROVED',
    generatedBy: { name: 'Admin User' },
    demandInputs: demandInputs.length ? demandInputs : [
      { product: { name: 'Apex Urban Commuter Bicycle', sku: 'BIK-URB-001' }, quantity: 50, requiredDate: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0] },
    ],
    plannedOrders: [
      { product: { name: 'Apex Urban Commuter Bicycle', sku: 'BIK-URB-001' }, quantity: 50, orderType: 'WORK_ORDER', plannedStartDate: today },
      { product: { name: 'High-Grade Alloy Frame T6', sku: 'RAW-FRM-001' }, quantity: 50, orderType: 'PURCHASE', plannedStartDate: today },
      { product: { name: 'Shimano Deore 11-Speed Drivetrain', sku: 'CMP-DRV-001' }, quantity: 50, orderType: 'PURCHASE', plannedStartDate: today },
      { product: { name: 'Maxxis All-Terrain Tire 29x2.25', sku: 'CMP-TIR-001' }, quantity: 100, orderType: 'PURCHASE', plannedStartDate: today },
    ],
  };
}
