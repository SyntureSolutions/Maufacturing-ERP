import { NextRequest, NextResponse } from 'next/server';
import { canViewInvoices } from '@/lib/accessRoles';
import dbConnect from '@/lib/mongodb';
import DeliveryChallan from '@/models/DeliveryChallan';
import { verifyAuth } from '@/lib/auth';
import { nextDocNumber } from '@/lib/docNumber';
import { loadSalesContext } from '@/lib/invoicing';
import { notify, companyName } from '@/lib/notify';
import { claimQuantities, releaseQuantities, consumeStock, restoreStock, refreshOrderState, StockMovement } from '@/lib/dispatch';
import { HttpError } from '@/lib/httpError';
import { postDispatchCost } from '@/lib/costing';
import { revertJournal } from '@/lib/accounting';
import { claimPicked, releasePicked, usesPickLists, PickClaim } from '@/lib/picking';

const ROLES = ['ADMIN', 'MANAGER', 'SALES', 'SUPPLY_CHAIN_MANAGER', 'FINANCE_MANAGER', 'STAFF'];

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewInvoices(user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });
    await dbConnect();
    return NextResponse.json(await DeliveryChallan.find().sort({ createdAt: -1 }).limit(200).lean());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const b = await req.json();
    for (const f of ['transporterName', 'vehicleNo', 'lrNo']) {
      if (!String(b[f] || '').trim()) return NextResponse.json({ error: `${f} is required on a delivery challan.` }, { status: 400 });
    }

    await dbConnect();
    // Dispatch everything still outstanding (no `lines`), or just the lines asked for: [{ product, quantity }]. An empty list is refused, not read as everything.
    const ctx = await loadSalesContext(b.salesOrderId, b.placeOfSupply, { kind: 'dispatch', lines: Array.isArray(b.lines) ? b.lines : undefined });
    if (!['APPROVED', 'IN_FULFILLMENT', 'FULFILLED'].includes(ctx.so.status)) throw new Error(`Sales order is ${ctx.so.status}; only approved orders can be dispatched.`);

    // take the quantities off the order, then the goods out of stock; undo both if the challan cannot be saved
    await claimQuantities(ctx.so, 'dispatchedQty', ctx.allocations);
    let stock: { movements: StockMovement[]; shortfall: { product: string; qty: number }[] } = { movements: [], shortfall: [] };
    let dc: any;
    let picked: PickClaim[] = [];
    let cogs: { journal: any; value: number } = { journal: null, value: 0 };
    try {
      // with pick lists in use, only goods that were picked may go out; this is refused (and everything above undone) when a
      // product has not been picked in full. Without them, consumeStock takes the reserved batches, then the earliest expiry.
      const names = new Map<string, string>((ctx.tax.items || []).map((i: any) => [String(i.productId), String(i.description || 'an item')]));
      if (await usesPickLists()) picked = await claimPicked(ctx.so._id, ctx.allocations.map(a => ({ product: a.product, quantity: a.quantity })), (p) => names.get(p) || 'an item');
      stock = await consumeStock(ctx.so, ctx.allocations);
      const number = await nextDocNumber(DeliveryChallan, 'DC');
      // the goods leave stock at their cost: Dr cost of goods sold, Cr inventory (refused here if the accounting period is locked)
      cogs = await postDispatchCost(ctx.so, number, stock.movements, user.id);
      dc = await DeliveryChallan.create({
        number, salesOrder: ctx.so._id, soNumber: ctx.so.soNumber, customer: ctx.customer._id, customerName: ctx.customer.name,
        reason: b.reason || 'SUPPLY', placeOfSupply: ctx.placeOfSupply, items: ctx.tax.items, totalTaxable: ctx.tax.subTotal,
        transporterName: b.transporterName.trim(), vehicleNo: String(b.vehicleNo).replace(/\s/g, '').toUpperCase(), lrNo: b.lrNo.trim(), parties: ctx.parties,
        stockMovements: stock.movements, stockShortfall: stock.shortfall, pickClaims: picked, cogsValue: cogs.value, cogsJournal: cogs.journal?._id,
      });
    } catch (err) {
      if (cogs.journal) await revertJournal(cogs.journal).catch(() => {});
      await restoreStock(ctx.so._id, stock.movements).catch(() => {});
      await releasePicked(picked).catch(() => {});
      await releaseQuantities(ctx.so._id, 'dispatchedQty', ctx.allocations).catch(() => {});
      throw err;
    }
    await refreshOrderState(ctx.so._id);
    const vars = { challanNumber: dc.number, orderNumber: ctx.so.soNumber, customerName: ctx.customer.name, transporterName: dc.transporterName, vehicleNo: dc.vehicleNo, lrNo: dc.lrNo, companyName: await companyName() };
    await notify({ event: 'DISPATCH_ALERT', channel: 'EMAIL', to: ctx.customer.email, vars, refType: 'DELIVERY_CHALLAN', refNumber: dc.number });
    await notify({ event: 'DISPATCH_ALERT', channel: 'SMS', to: ctx.customer.phone, vars, refType: 'DELIVERY_CHALLAN', refNumber: dc.number });
    return NextResponse.json(dc, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err instanceof HttpError ? err.status : 500 });
  }
}
