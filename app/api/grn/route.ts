import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import GRN from '@/models/GRN';
import PurchaseOrder from '@/models/PurchaseOrder';
import Batch from '@/models/Batch';
import Product from '@/models/Product';
import '@/models/Supplier';
import { verifyAuth } from '@/lib/auth';
import { createNumbered } from '@/lib/docNumber';
import { HttpError, statusOf } from '@/lib/httpError';
import { assertPeriodOpen } from '@/lib/accounting';

const RECEIVE_ROLES = ['ADMIN', 'MANAGER', 'STAFF', 'SUPPLY_CHAIN_MANAGER', 'QUALITY_INSPECTOR'];

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const grns = await GRN.find().populate('supplier', 'name code').populate('items.product', 'name sku uom').sort({ createdAt: -1 });
    return NextResponse.json(grns);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Gate inward: create a GRN against a PO. Received stock goes to the QUARANTINE store until QC decides.
export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!RECEIVE_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const b = await req.json();
    for (const f of ['gateEntryNo', 'vendorChallanNo', 'vehicleNo']) {
      if (!String(b[f] || '').trim()) return NextResponse.json({ error: `${f} is required.` }, { status: 400 });
    }
    const c = b.checklist || {};
    if (!c.quantityVerified || !c.packingIntact || !c.documentsVerified) {
      return NextResponse.json({ error: 'Complete the physical verification checklist before receiving.' }, { status: 400 });
    }

    await dbConnect();
    await assertPeriodOpen('INVENTORY');
    const po = await PurchaseOrder.findById(b.poId);
    if (!po) return NextResponse.json({ error: 'Purchase order not found.' }, { status: 404 });
    if (!['ORDERED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
      return NextResponse.json({ error: `PO is ${po.status}; goods can only be received against approved (ORDERED) POs.` }, { status: 409 });
    }

    const lines = (b.items || []).filter((i: any) => Number(i.receivedQty) > 0);
    if (!lines.length) return NextResponse.json({ error: 'Enter a received quantity for at least one item.' }, { status: 400 });

    // Check every line, and the TOTAL per product (the same product may appear on several lines, e.g. different expiries)
    const today = new Date(); today.setHours(0, 0, 0, 0);
    // items the item master keeps out of stock: consumables marked non-stock, and services
    const nonStockIds = new Set((await Product.find({ _id: { $in: po.items.map((i: any) => i.product) }, $or: [{ stockType: 'NON_STOCK' }, { productType: 'SERVICE' }] }).select('_id').lean() as any[]).map(p => String(p._id)));
    const wanted = new Map<string, number>();
    const planned: any[] = [];
    for (const l of lines) {
      const poItem = po.items.find((i: any) => String(i.product) === String(l.product));
      if (!poItem) return NextResponse.json({ error: 'Item is not on this PO.' }, { status: 400 });
      const qty = Number(l.receivedQty);
      if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: 'Received quantity must be a positive number.' }, { status: 400 });
      // consumables and services marked non-stock in the item master are received without a batch, so no expiry either
      const nonStock = nonStockIds.has(String(poItem.product));
      let expiry: Date | undefined;
      if (!nonStock) {
        if (!l.expiryDate) return NextResponse.json({ error: 'Expiry date is required for every item.' }, { status: 400 });
        expiry = new Date(l.expiryDate);
        if (isNaN(expiry.getTime())) return NextResponse.json({ error: 'Expiry date is not a valid date.' }, { status: 400 });
        if (expiry < today) return NextResponse.json({ error: 'Expiry date is in the past: expired goods cannot be received.' }, { status: 400 });
      }
      // the supplier's batch number and manufacturing date, as on their label (optional)
      const supplierBatchNo = nonStock ? '' : String(l.supplierBatchNo ?? '').trim();
      if (supplierBatchNo.length > 40) return NextResponse.json({ error: 'Supplier batch number: keep it under 40 characters.' }, { status: 400 });
      let mfg: Date | undefined;
      if (!nonStock && l.manufacturingDate) {
        mfg = new Date(l.manufacturingDate);
        if (isNaN(mfg.getTime())) return NextResponse.json({ error: 'Manufacturing date is not a valid date.' }, { status: 400 });
        if (mfg.getTime() > Date.now() + 86400000) return NextResponse.json({ error: 'Manufacturing date cannot be in the future.' }, { status: 400 });
        if (expiry && mfg >= expiry) return NextResponse.json({ error: 'Manufacturing date must be before the expiry date.' }, { status: 400 });
      }
      const key = String(poItem.product);
      wanted.set(key, (wanted.get(key) || 0) + qty);
      const remaining = poItem.quantity - (poItem.receivedQuantity || 0);
      if (wanted.get(key)! > remaining + 1e-9) return NextResponse.json({ error: `Received quantity exceeds the open PO quantity (${remaining}).` }, { status: 400 });
      planned.push({ poItem, qty, expiry, nonStock, supplierBatchNo: supplierBatchNo || undefined, mfg });
    }

    // Everything below is undone if a later step fails, so a half-made receipt never stays behind
    const undo: (() => Promise<any>)[] = [];
    try {
      // Claim the quantity on the PO atomically; a second receipt arriving at the same moment cannot take the same balance
      for (const [product, qty] of wanted) {
        const poItem = po.items.find((i: any) => String(i.product) === product);
        const claimed = await PurchaseOrder.updateOne(
          { _id: po._id, status: { $in: ['ORDERED', 'PARTIALLY_RECEIVED'] }, items: { $elemMatch: { _id: poItem._id, receivedQuantity: { $lte: poItem.quantity - qty + 1e-9 } } } },
          { $inc: { 'items.$.receivedQuantity': qty } },
        );
        if (!claimed.modifiedCount) throw new HttpError(409, 'The open quantity on this PO changed while you were receiving. Reload and try again.');
        undo.push(() => PurchaseOrder.updateOne({ _id: po._id, 'items._id': poItem._id }, { $inc: { 'items.$.receivedQuantity': -qty } }));
      }

      const grnItems = planned.map(p => ({ product: p.poItem.product, orderedQty: p.poItem.quantity, receivedQty: p.qty, unitPrice: p.poItem.unitPrice, expiryDate: p.expiry, supplierBatchNo: p.supplierBatchNo, manufacturingDate: p.mfg, nonStock: p.nonStock }));
      const grn: any = await createNumbered(GRN, 'GRN', 'number', (number) => GRN.create({
        number, po: po._id, poNumber: po.poNumber, supplier: po.supplier,
        gateEntryNo: b.gateEntryNo.trim(), vendorChallanNo: b.vendorChallanNo.trim(), vehicleNo: b.vehicleNo.trim(),
        checklist: c, items: grnItems, createdBy: user.name,
      }));
      undo.push(() => GRN.deleteOne({ _id: grn._id }));

      const seen = new Map<string, number>();
      for (const item of grn.items) {
        if (item.nonStock) continue; // nothing goes into stock
        const product: any = await Product.findById(item.product).select('sku');
        const base = `BN-${grn.number}-${product?.sku || String(item.product).slice(-6)}`;
        const n = (seen.get(base) || 0) + 1; seen.set(base, n);
        const batch = await Batch.create({
          product: item.product, batchNumber: n > 1 ? `${base}-${n}` : base,
          expiryDate: item.expiryDate, supplierBatchNo: item.supplierBatchNo, manufacturingDate: item.manufacturingDate, initialQuantity: item.receivedQty, currentQuantity: item.receivedQty,
          purchasePrice: item.unitPrice, po: po._id, grn: grn._id, store: 'QUARANTINE', location: 'QUARANTINE', qualityStatus: 'PENDING_QC',
        });
        undo.push(() => Batch.deleteOne({ _id: batch._id }));
        item.batch = batch._id;
      }
      await grn.save();

      const fresh: any = await PurchaseOrder.findById(po._id);
      const done = fresh.items.every((i: any) => (i.receivedQuantity || 0) >= i.quantity - 1e-9);
      await PurchaseOrder.updateOne({ _id: po._id }, { $set: { status: done ? 'RECEIVED' : 'PARTIALLY_RECEIVED' }, ...(done ? { receivedDate: new Date() } : {}) });
      return NextResponse.json(grn, { status: 201 });
    } catch (err) {
      for (const u of undo.reverse()) await u().catch(() => {});
      throw err;
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
