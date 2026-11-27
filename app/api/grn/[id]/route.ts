import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import GRN from '@/models/GRN';
import Batch from '@/models/Batch';
import PurchaseReturn from '@/models/PurchaseReturn';
import ScrapEntry from '@/models/ScrapEntry';
import PurchaseOrder from '@/models/PurchaseOrder';
import { verifyAuth } from '@/lib/auth';
import { createNumbered } from '@/lib/docNumber';
import { HttpError, statusOf } from '@/lib/httpError';
import { ACC, postJournal, postVoucher, revertJournal, revertVoucher, assertPeriodOpen } from '@/lib/accounting';
import { checkPlace } from '@/lib/storageLocations';

const QC_ROLES = ['ADMIN', 'MANAGER', 'QUALITY_INSPECTOR'];
const STORE_ROLES = ['ADMIN', 'MANAGER', 'STAFF', 'SUPPLY_CHAIN_MANAGER', 'QUALITY_INSPECTOR'];
const r2 = (n: number) => Math.round(n * 100) / 100;

// One GRN with its supplier, PO, products, batches and the returns raised from it (object page).
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    await dbConnect();
    const grn: any = await GRN.findById(id)
      .populate('supplier', 'name code address city pincode gstin phone')
      .populate({ path: 'po', select: 'poNumber status orderDate expectedDeliveryDate', model: PurchaseOrder })
      .populate('items.product', 'name sku uom hsnCode')
      .populate({ path: 'items.batch', select: 'batchNumber store zone rack bin qualityStatus currentQuantity expiryDate', model: Batch })
      .lean();
    if (!grn) return NextResponse.json({ error: 'GRN not found.' }, { status: 404 });
    const returns = await PurchaseReturn.find({ grn: grn._id }).select('number status totalAmount afterBilling createdAt items').lean();
    return NextResponse.json({ ...grn, returns });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    const body = await req.json();

    await dbConnect();
    const grn = await GRN.findById(id);
    if (!grn) return NextResponse.json({ error: 'GRN not found.' }, { status: 404 });

    if (body.action === 'inspect') {
      if (!QC_ROLES.includes(user.role)) return NextResponse.json({ error: 'Only QC inspectors can accept or reject inward goods.' }, { status: 403 });
      await assertPeriodOpen('INVENTORY');
      await assertPeriodOpen('ACCOUNTING');

      // Validate everything before mutating anything
      const decisions: any[] = [];
      const seenIdx = new Set<number>();
      for (const d of body.items || []) {
        const idx = Number(d.index);
        if (!Number.isInteger(idx) || seenIdx.has(idx)) return NextResponse.json({ error: 'Each GRN line can appear only once in an inspection.' }, { status: 400 });
        seenIdx.add(idx);
        const item = grn.items[idx];
        if (!item) return NextResponse.json({ error: 'Unknown GRN line.' }, { status: 400 });
        if (item.inspection !== 'PENDING') return NextResponse.json({ error: 'Line is already inspected.' }, { status: 409 });
        const accepted = Number(d.acceptedQty) || 0, scrap = Number(d.scrapQty) || 0, ret = Number(d.returnQty) || 0;
        if (accepted < 0 || scrap < 0 || ret < 0 || Math.abs(accepted + scrap + ret - item.receivedQty) > 1e-6) {
          return NextResponse.json({ error: `Accepted + scrap + return must equal the received quantity (${item.receivedQty}).` }, { status: 400 });
        }
        const inspection = accepted === item.receivedQty ? 'ACCEPTED' : accepted === 0 ? 'REJECTED' : 'PARTIAL';
        const tests = (d.tests || []).map((t: any) => ({ name: t.name, standard: t.standard, actual: t.actual, result: t.result === 'FAIL' ? 'FAIL' : 'PASS' }));
        decisions.push({ idx, item, accepted, scrap, ret, tests, inspection });
      }
      if (!decisions.length) return NextResponse.json({ error: 'No inspection results supplied.' }, { status: 400 });

      // Step 1: claim each line (PENDING -> decided) in one atomic write, so a second inspector or a double click cannot book it twice.
      // Everything after this is undone if it fails, so QC is never half recorded.
      const undo: (() => Promise<any>)[] = [];
      try {
        for (const d of decisions) {
          const claimed = await GRN.updateOne(
            { _id: grn._id, items: { $elemMatch: { _id: d.item._id, inspection: 'PENDING' } } },
            { $set: { 'items.$.inspection': d.inspection, 'items.$.acceptedQty': d.accepted, 'items.$.scrapQty': d.scrap, 'items.$.returnQty': d.ret, 'items.$.tests': d.tests } },
          );
          if (!claimed.modifiedCount) throw new HttpError(409, 'A line was inspected by someone else a moment ago. Reload and check the result.');
          undo.push(() => GRN.updateOne({ _id: grn._id, 'items._id': d.item._id }, { $set: { 'items.$.inspection': 'PENDING', 'items.$.acceptedQty': 0, 'items.$.scrapQty': 0, 'items.$.returnQty': 0, 'items.$.tests': [] } }));
        }

        // Step 2: the stock
        // a non-stock line (consumables, services) is an expense when accepted, never inventory
        let invValue = 0, expenseValue = 0, scrapValue = 0, returnValue = 0, returnStockValue = 0;
        const returnItems: any[] = [];
        const scrapItems: { product: any; quantity: number }[] = [];
        for (const { item, accepted, scrap, ret } of decisions) {
          const before: any = await Batch.findById(item.batch).lean();
          if (before) {
            await Batch.updateOne({ _id: item.batch }, { $set: { currentQuantity: accepted, qualityStatus: accepted > 0 ? 'APPROVED' : 'REJECTED', ...(accepted === 0 ? { store: 'SCRAP' } : {}) } });
            undo.push(() => Batch.updateOne({ _id: item.batch }, { $set: { currentQuantity: before.currentQuantity, qualityStatus: before.qualityStatus, store: before.store } })); // accepted stock stays in QUARANTINE until put-away assigns W1/W2/W3
          }
          if (item.nonStock) expenseValue += (accepted + ret) * item.unitPrice; else invValue += (accepted + ret) * item.unitPrice; // returned goods are reversed by the debit note below
          if (!item.nonStock) returnStockValue += ret * item.unitPrice;
          scrapValue += scrap * item.unitPrice;
          returnValue += ret * item.unitPrice;
          if (ret > 0) returnItems.push({ product: item.product, quantity: ret, unitPrice: item.unitPrice, reason: 'Rejected at inward QC' });
          if (scrap > 0) scrapItems.push({ product: item.product, quantity: scrap });
        }

        // Step 3: the books
        const journal = await postJournal({
          description: `Inward stock accepted ${grn.number} (PO ${grn.poNumber})`, reference: grn.number, referenceType: 'GRN_RECEIPT', createdBy: user.id,
          lines: [
            { acc: ACC.INV_RM, debit: r2(invValue) }, { acc: ACC.OVERHEAD, debit: r2(expenseValue) }, { acc: ACC.SCRAP_LOSS, debit: r2(scrapValue) },
            { acc: ACC.AP, credit: r2(invValue + expenseValue + scrapValue) },
          ],
        });
        undo.push(() => revertJournal(journal));

        let rtv: any = null;
        if (returnItems.length) {
          // Goods returned at inward inspection were never invoiced: GST reaches the books only when the vendor bills what was kept (see vendor bills),
          // so reversing GST here would leave payables and GST input short by that amount for good. The debit note is for the goods alone.
          const total = r2(returnValue);
          const debitNote = await postVoucher({
            type: 'DEBIT_NOTE', amount: total, narration: `Purchase return against ${grn.number}`, createdBy: user.id,
            lines: [{ acc: ACC.AP, debit: total }, { acc: ACC.INV_RM, credit: r2(returnStockValue) }, { acc: ACC.OVERHEAD, credit: r2(total - r2(returnStockValue)) }],
            extra: { partyType: 'SUPPLIER', partyId: grn.supplier, refDoc: { kind: 'GRN', number: grn.number }, taxableAmount: r2(returnValue), noteDetails: { reason: 'PURCHASE_RETURN' } },
          });
          undo.push(() => revertVoucher(debitNote));
          rtv = await createNumbered(PurchaseReturn, 'RTV', 'number', (number) => PurchaseReturn.create({
            number, grn: grn._id, grnNumber: grn.number, supplier: grn.supplier,
            items: returnItems, baseAmount: r2(returnValue), gstPercent: 0, gstAmount: 0, totalAmount: total,
            debitNote: debitNote._id, debitNoteNumber: debitNote.number,
          }));
          undo.push(() => PurchaseReturn.deleteOne({ _id: rtv._id }));
        }

        // Inward scrap goes into the scrap register so it can be seen and reported
        for (const sc of scrapItems) {
          const entry = await ScrapEntry.create({ store: 'RM_SCRAP', product: sc.product, quantity: sc.quantity, stageName: `Inward QC ${grn.number}`, reason: `Scrapped at inward inspection (PO ${grn.poNumber})`, operator: user.name });
          undo.push(() => ScrapEntry.deleteOne({ _id: entry._id }));
        }

        // Goods sent back to the vendor are owed again: re-open that quantity on the PO so it shows as pending.
        // Scrap is deliberately NOT re-opened: it is booked as a loss and the vendor is still paid for it, so a replacement would be paid twice.
        const reopen = returnItems.map(r => ({ product: r.product, quantity: r.quantity }));
        if (reopen.length) {
          for (const r of reopen) {
            await PurchaseOrder.updateOne({ _id: grn.po }, { $inc: { 'items.$[li].receivedQuantity': -r.quantity } }, { arrayFilters: [{ 'li.product': r.product }] });
            undo.push(() => PurchaseOrder.updateOne({ _id: grn.po }, { $inc: { 'items.$[li].receivedQuantity': r.quantity } }, { arrayFilters: [{ 'li.product': r.product }] }));
          }
          const po: any = await PurchaseOrder.findById(grn.po);
          if (po) {
            for (const it of po.items) if ((it.receivedQuantity || 0) < 0) it.receivedQuantity = 0;
            po.status = po.items.every((i: any) => (i.receivedQuantity || 0) >= i.quantity - 1e-9) ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
            await po.save();
            undo.push(async () => { const p2: any = await PurchaseOrder.findById(grn.po); if (p2) { p2.status = p2.items.every((i: any) => (i.receivedQuantity || 0) >= i.quantity - 1e-9) ? 'RECEIVED' : 'PARTIALLY_RECEIVED'; await p2.save(); } });
          }
        }

        const fresh: any = await GRN.findById(grn._id);
        fresh.inspectedBy = user.name; fresh.inspectedAt = new Date();
        if (fresh.items.every((i: any) => i.inspection !== 'PENDING')) {
          fresh.status = fresh.items.every((i: any) => i.acceptedQty === 0 || i.nonStock) ? 'PUT_AWAY' : 'QC_DONE'; // non-stock lines have nothing to put away
        }
        await fresh.save();
        return NextResponse.json({ grn: fresh, purchaseReturn: rtv });
      } catch (err) {
        for (const u of undo.reverse()) await u().catch(() => {});
        throw err;
      }
    }

    if (body.action === 'putaway') {
      if (!STORE_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const item = grn.items[body.index];
      if (!item) return NextResponse.json({ error: 'Unknown GRN line.' }, { status: 400 });
      if (item.nonStock) return NextResponse.json({ error: 'This item is not kept in stock, so there is nothing to put away.' }, { status: 409 });
      if (!item.acceptedQty || item.putAway?.warehouse) return NextResponse.json({ error: 'Line has no accepted stock awaiting put-away.' }, { status: 409 });
      const warehouse = String(body.warehouse || '').trim().toUpperCase();
      const [zone, rack, bin] = [body.zone, body.rack, body.bin].map((v: any) => String(v ?? '').trim().toUpperCase());
      const placeError = await checkPlace(warehouse, zone, rack, bin);
      if (placeError) return NextResponse.json({ error: placeError }, { status: 400 });

      item.putAway = { warehouse, zone, rack, bin, at: new Date() };
      await Batch.updateOne({ _id: item.batch }, { store: warehouse, zone, rack, bin, location: `${warehouse}/${zone}/${rack}/${bin}` });
      if (grn.items.every((i: any) => i.inspection !== 'PENDING' && (i.acceptedQty === 0 || i.nonStock || i.putAway?.warehouse))) grn.status = 'PUT_AWAY';
      await grn.save();
      return NextResponse.json({ grn });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
