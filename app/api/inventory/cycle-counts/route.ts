import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CycleCount from '@/models/CycleCount';
import Batch from '@/models/Batch';
import Product from '@/models/Product';
import { HttpError, statusOf } from '@/lib/httpError';
import { verifyAuth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { createNumbered } from '@/lib/docNumber';

const COUNT_ROLES = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER', 'STAFF', 'QUALITY_INSPECTOR'];

export async function GET(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    return NextResponse.json(await CycleCount.find({}).sort({ createdAt: -1 }));
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await verifyAuth(req);
    if (!COUNT_ROLES.includes(user!.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const userName = user!.name || 'Warehouse Auditor';
    const userRole = user!.role;

    const body = await req.json();
    const { warehouse, assignedCounter } = body;
    if (warehouse !== undefined && typeof warehouse !== 'string') throw new HttpError(400, 'Warehouse must be text.');
    await dbConnect();
    const query: any = { currentQuantity: { $gt: 0 } };
    if (warehouse && warehouse !== 'All Locations') query.location = warehouse;
    const dbBatches = await Batch.find(query).populate('product');
    if (!dbBatches.length) throw new HttpError(400, 'There are no stock batches at this location to count.');
    const items = dbBatches.map((b: any) => ({
      batch: b._id,
      batchNumber: b.batchNumber,
      productName: b.product?.name || 'Component Part',
      productSku: b.product?.sku || '',
      location: b.location || 'Main Warehouse',
      systemQuantity: b.currentQuantity,
      countedQuantity: undefined,
      variance: 0,
      unitCost: b.purchasePrice || 0,
      varianceValue: 0,
      notes: '',
    }));

    const newRecord: any = {
      warehouse: warehouse || 'All Locations',
      scheduledDate: new Date(),
      status: 'IN_PROGRESS',
      items,
      totalVarianceQuantity: 0,
      totalVarianceValue: 0,
      assignedCounter: assignedCounter || userName,
      createdAt: new Date()
    };

    const created: any = await createNumbered(CycleCount, 'CC', 'countNumber', (countNumber) => CycleCount.create({ ...newRecord, countNumber }));
    await logAuditEvent({
        userName,
        userRole,
        action: 'CREATE',
        resource: 'CycleCount',
        resourceId: String(created._id),
        resourceName: created.countNumber,
        details: `Scheduled physical cycle count sheet ${created.countNumber} for ${warehouse} containing ${items.length} batches.`
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: statusOf(error) });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!COUNT_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { countId, items, action } = await req.json(); // action: 'SAVE_DRAFT' | 'SUBMIT_FOR_APPROVAL'
    if (!countId || !Array.isArray(items)) return NextResponse.json({ error: 'Missing countId or items array' }, { status: 400 });

    await dbConnect();
    const count: any = await CycleCount.findById(countId);
    if (!count) return NextResponse.json({ error: 'Cycle count not found' }, { status: 404 });
    if (!['PLANNED', 'IN_PROGRESS'].includes(count.status)) {
      return NextResponse.json({ error: `Count is ${count.status} and can no longer be changed.` }, { status: 409 });
    }

    // Only the counted quantity comes from the request. The system quantity and cost were frozen when the count was planned,
    // so a client cannot invent a variance by sending different numbers.
    let totalVarQty = 0, totalVarVal = 0;
    const processedItems = count.items.map((stored: any, i: number) => {
      const given = items[i]?.countedQuantity;
      const hasCount = given !== undefined && given !== null && given !== '';
      const counted = hasCount ? Number(given) : stored.systemQuantity;
      if (!Number.isFinite(counted) || counted < 0) throw new HttpError(400, `Line ${i + 1}: counted quantity must be zero or more.`);
      const variance = Math.round((counted - stored.systemQuantity) * 10000) / 10000;
      const varianceValue = Math.round(variance * (stored.unitCost || 0) * 100) / 100;
      totalVarQty += variance; totalVarVal += varianceValue;
      return { ...stored.toObject(), countedQuantity: counted, variance, varianceValue, ...(items[i]?.notes !== undefined ? { notes: String(items[i].notes) } : {}) };
    });

    const newStatus = action === 'SUBMIT_FOR_APPROVAL' ? 'PENDING_APPROVAL' : 'IN_PROGRESS';
    const updated: any = await CycleCount.findOneAndUpdate(
      { _id: countId, status: { $in: ['PLANNED', 'IN_PROGRESS'] } },
      { items: processedItems, totalVarianceQuantity: totalVarQty, totalVarianceValue: totalVarVal, status: newStatus, countedAt: new Date() },
      { new: true },
    );
    if (!updated) return NextResponse.json({ error: 'The count changed while you were editing. Reload and try again.' }, { status: 409 });
    if (action === 'SUBMIT_FOR_APPROVAL') {
      await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'EDIT', resource: 'CycleCount', resourceId: String(updated._id), resourceName: updated.countNumber, details: `Submitted cycle count ${updated.countNumber} for reconciliation. Net variance: ${totalVarQty} units (₹${totalVarVal.toLocaleString('en-IN')}).` });
    }
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: statusOf(error) });
  }
}
