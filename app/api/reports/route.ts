import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import WorkOrder from '@/models/WorkOrder';
import Invoice from '@/models/Invoice';
import { verifyAuth } from '@/lib/auth';
import { demoOrThrow } from '@/lib/demoMode';

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const type = req.nextUrl.searchParams.get('type') || 'SUMMARY';

    try {
      await dbConnect();
      
      if (type === 'PRODUCTION') {
        const wos = await WorkOrder.find({}).populate('product', 'name');
        return NextResponse.json({
          total: wos.length,
          completed: wos.filter(w => w.status === 'COMPLETED').length,
          data: wos
        });
      }

      if (type === 'FINANCIAL') {
        const invoices = await Invoice.find({});
        const sales = invoices.filter(i => i.type === 'SALES').reduce((sum, i) => sum + i.totalAmount, 0);
        const purchases = invoices.filter(i => i.type === 'PURCHASE').reduce((sum, i) => sum + i.totalAmount, 0);
        return NextResponse.json({ sales, purchases, data: invoices });
      }
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample data only in demo mode
      if (type === 'PRODUCTION') {
        return NextResponse.json({
          total: 15,
          completed: 12,
          data: [
            { _id: '1', workOrderNumber: 'WO-BIK-2026-001', product: { name: 'Apex Urban Commuter Bicycle' }, status: 'COMPLETED', targetQuantity: 100, producedQuantity: 98 },
            { _id: '2', workOrderNumber: 'WO-BIK-2026-002', product: { name: 'Velocity Trail Mountain Bike 29er' }, status: 'COMPLETED', targetQuantity: 50, producedQuantity: 48 },
            { _id: '3', workOrderNumber: 'WO-BIK-2026-003', product: { name: 'E-Glide Electric Hybrid Bike 250W' }, status: 'IN_PROGRESS', targetQuantity: 30, producedQuantity: 18 }
          ]
        });
      }

      if (type === 'FINANCIAL') {
        return NextResponse.json({ sales: 3020000, purchases: 1565000, data: [] });
      }
    }

    return NextResponse.json({ message: 'Select a valid report type' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
