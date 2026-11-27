import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Batch from '@/models/Batch';
import JournalEntry from '@/models/JournalEntry';
import { calculateInventoryValuation, ValuationMethod } from '@/lib/inventoryValuation';
import { verifyAuth } from '@/lib/auth';

let activeCorporateMethod: ValuationMethod = 'FIFO';

// Stock value by FIFO, weighted average and LIFO, from the batches in stock at their own cost. Items kept out of stock
// value (scrap, or marked so in the item master) are left out. A batch with no cost is not given a made-up one: it is
// counted separately so the screen can say how much stock has no cost yet.

export async function GET(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const batches: any[] = await Batch.find({ currentQuantity: { $gt: 0 } }).populate('product', 'name sku uom isScrap includeInValuation').lean();
    const valued = batches.filter(b => b.product && b.product.includeInValuation !== false && !b.product.isScrap);
    const costed = valued.filter(b => (b.purchasePrice || 0) > 0);
    const noCost = valued.filter(b => !((b.purchasePrice || 0) > 0));
    const batchCostItems = costed.map(b => ({ batchNumber: b.batchNumber, quantity: b.currentQuantity, unitCost: b.purchasePrice, createdAt: b.createdAt }));

    const entries: any[] = await JournalEntry.find({ description: { $regex: /COGS|Valuation/i } }).sort({ createdAt: -1 }).limit(10).lean();
    return NextResponse.json({
      activeCorporateMethod,
      methods: {
        FIFO: calculateInventoryValuation(batchCostItems, 'FIFO'),
        WEIGHTED_AVERAGE: calculateInventoryValuation(batchCostItems, 'WEIGHTED_AVERAGE'),
        LIFO: calculateInventoryValuation(batchCostItems, 'LIFO'),
      },
      withoutCost: { batches: noCost.length, quantity: noCost.reduce((t, b) => t + (b.currentQuantity || 0), 0), batchNumbers: noCost.slice(0, 20).map(b => b.batchNumber) },
      recentCOGSJournalEntries: entries.map(e => ({
        _id: e._id, entryNumber: e.entryNumber, date: e.date, description: e.description, cogsAmount: e.totalDebit,
        valuationMethod: /WAC|WEIGHTED/i.test(e.description) ? 'WEIGHTED_AVERAGE' : /LIFO/.test(e.description) ? 'LIFO' : 'FIFO', status: e.status,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { action, method } = await req.json();

    // Action 1: Switch Corporate Valuation Policy
    if (action === 'SET_METHOD') {
      if (!['ADMIN', 'FINANCE_MANAGER'].includes(authedUser.role)) return NextResponse.json({ error: 'Only an Admin or Finance Manager can change the valuation method.' }, { status: 403 });
      if (['FIFO', 'WEIGHTED_AVERAGE', 'LIFO'].includes(method)) {
        activeCorporateMethod = method;
        return NextResponse.json({
          message: `Active corporate inventory valuation method updated to ${method}`,
          activeCorporateMethod
        });
      }
      return NextResponse.json({ error: 'Invalid valuation method' }, { status: 400 });
    }

    // Cost of goods is posted by the documents that move the stock (material issue, finished goods, dispatch), so stock
    // and books always agree. A hand-typed COGS entry would take value out of inventory with no stock leaving.
    if (action === 'POST_COGS') {
      return NextResponse.json({ error: 'COGS is posted automatically when material is issued and goods are dispatched. For a correction, use a journal voucher in Accounts.' }, { status: 410 });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
