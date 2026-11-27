import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import JobWorkOrder from '@/models/JobWorkOrder';
import Batch from '@/models/Batch';
import Customer from '@/models/Customer';
import Invoice from '@/models/Invoice';
import CompanySettings from '@/models/CompanySettings';
import ScrapEntry from '@/models/ScrapEntry';
import { verifyAuth } from '@/lib/auth';
import { nextDocNumber } from '@/lib/docNumber';
import { ACC, assertPeriodOpen, postJournal } from '@/lib/accounting';
import { computeTax, stateCodeOf } from '@/lib/gst';
import { heldQty } from '@/lib/jobwork';

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'SUPPLY_CHAIN_MANAGER'];
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role) && !(user.role === 'FINANCE_MANAGER' && (await req.clone().json()).action === 'invoice')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await context.params;
    const b = await req.json();

    await dbConnect();
    const job: any = await JobWorkOrder.findById(id);
    if (!job) return NextResponse.json({ error: 'Job work order not found.' }, { status: 404 });
    if (job.status === 'CLOSED' && b.action !== 'invoice') return NextResponse.json({ error: 'This job work order is closed.' }, { status: 409 });

    // ---------- OUTWARD ----------
    if (job.kind === 'OUTWARD' && b.action === 'receive') {
      await assertPeriodOpen('INVENTORY');
      const outputQty = Number(b.outputQty) || 0;
      if (outputQty < 0) return NextResponse.json({ error: 'Output quantity cannot be negative.' }, { status: 400 });
      if (outputQty > 0 && !job.outputProduct) return NextResponse.json({ error: 'This order has no output product defined, so finished output cannot be received.' }, { status: 400 });
      const lines = (b.items || []).map((l: any) => ({ index: Number(l.index), consumed: Number(l.consumed) || 0, returned: Number(l.returned) || 0, scrap: Number(l.scrap) || 0 }));
      for (const l of lines) {
        const item = job.items[l.index];
        if (!item) return NextResponse.json({ error: 'Unknown line.' }, { status: 400 });
        if ([l.consumed, l.returned, l.scrap].some(n => n < 0)) return NextResponse.json({ error: 'Quantities cannot be negative.' }, { status: 400 });
        if (r4(l.consumed + l.returned + l.scrap) > heldQty(item) + 1e-9) return NextResponse.json({ error: `${item.description}: only ${heldQty(item)} is held by the job worker.` }, { status: 409 });
      }
      if (!lines.some((l: any) => l.consumed + l.returned + l.scrap > 0) && outputQty <= 0) return NextResponse.json({ error: 'Nothing to receive.' }, { status: 400 });

      const expiry = new Date(); expiry.setFullYear(expiry.getFullYear() + 5);
      for (const l of lines) {
        const item = job.items[l.index];
        item.consumed = r4(item.consumed + l.consumed); item.returned = r4(item.returned + l.returned); item.scrap = r4(item.scrap + l.scrap);
        const unit = item.quantity ? item.value / item.quantity : 0;
        if (l.returned > 0) {
          await Batch.create({ product: item.product, batchNumber: `RET-${job.number}-${l.index + 1}-${job.receipts.length + 1}`, expiryDate: expiry, initialQuantity: l.returned, currentQuantity: l.returned, purchasePrice: unit, store: 'W1', location: 'W1', qualityStatus: 'APPROVED' });
        }
        if (l.scrap > 0) await ScrapEntry.create({ store: 'RM_SCRAP', product: item.product, quantity: l.scrap, stageName: `Job work ${job.number}`, reason: `Loss at ${job.partyName}`, operator: user.name });
      }
      if (outputQty > 0) {
        const value = job.items.reduce((s: number, i: any) => s + i.value, 0);
        await Batch.create({ product: job.outputProduct, batchNumber: `JW-${job.number}-${job.receipts.length + 1}`, manufacturingDate: new Date(), expiryDate: expiry, initialQuantity: outputQty, currentQuantity: outputQty,
          purchasePrice: job.expectedOutputQty ? Math.round(value / job.expectedOutputQty * 100) / 100 : 0, store: 'SFG', location: 'SFG', qualityStatus: 'APPROVED' });
        job.outputReceivedQty = r4(job.outputReceivedQty + outputQty);
      }
      job.receipts.push({ challanNo: `${job.number}-R${job.receipts.length + 1}`, at: new Date(), outputQty, note: b.note, items: lines });
      job.status = job.items.every((i: any) => heldQty(i) <= 0) ? 'CLOSED' : 'PARTIAL';
      await job.save();
      return NextResponse.json(job);
    }

    if (job.kind === 'OUTWARD' && b.action === 'writeoff') {
      if (!['ADMIN', 'MANAGER'].includes(user.role)) return NextResponse.json({ error: 'Only a manager can write off material held by a job worker.' }, { status: 403 });
      if (!String(b.reason || '').trim()) return NextResponse.json({ error: 'A reason is required to write off.' }, { status: 400 });
      for (const item of job.items) {
        const held = heldQty(item);
        if (held > 0) {
          item.scrap = r4(item.scrap + held);
          await ScrapEntry.create({ store: 'RM_SCRAP', product: item.product, quantity: held, stageName: `Job work ${job.number}`, reason: `Write-off: ${b.reason}`, operator: user.name });
        }
      }
      job.status = 'CLOSED'; job.closeNote = b.reason;
      await job.save();
      return NextResponse.json(job);
    }

    // ---------- INWARD ----------
    if (job.kind === 'INWARD' && b.action === 'process') {
      const q = Number(b.quantity);
      const received = job.items.reduce((s: number, i: any) => s + i.quantity, 0);
      if (!(q > 0) || r4(job.processedQty + q) > received) return NextResponse.json({ error: `Processed quantity cannot exceed the ${received} received.` }, { status: 400 });
      job.processedQty = r4(job.processedQty + q);
      job.status = 'PARTIAL';
      await job.save();
      return NextResponse.json(job);
    }

    if (job.kind === 'INWARD' && b.action === 'return') {
      const q = Number(b.quantity);
      const returned = job.returns.reduce((s: number, r: any) => s + r.quantity, 0);
      if (!(q > 0) || r4(returned + q) > job.processedQty) return NextResponse.json({ error: 'Cannot return more than has been processed.' }, { status: 400 });
      if (!String(b.vehicleNo || '').trim()) return NextResponse.json({ error: 'Vehicle number is required on the return challan.' }, { status: 400 });
      const count = await JobWorkOrder.aggregate([{ $unwind: '$returns' }, { $count: 'n' }]);
      const challanNo = `B-${new Date().getFullYear()}-${String((count[0]?.n || 0) + 1).padStart(4, '0')}`;
      job.returns.push({ challanNo, quantity: q, vehicleNo: String(b.vehicleNo).toUpperCase().replace(/\s/g, ''), at: new Date() });
      const received = job.items.reduce((s: number, i: any) => s + i.quantity, 0);
      if (r4(returned + q) >= received) job.status = 'CLOSED';
      await job.save();
      return NextResponse.json(job);
    }

    if (job.kind === 'INWARD' && b.action === 'invoice') {
      if (!['ADMIN', 'FINANCE_MANAGER'].includes(user.role)) return NextResponse.json({ error: 'Only Finance can issue the service invoice.' }, { status: 403 });
      const returned = job.returns.reduce((s: number, r: any) => s + r.quantity, 0);
      const billable = r4(Math.min(job.processedQty, returned) - job.invoicedQty);
      if (billable <= 0) return NextResponse.json({ error: 'Nothing to invoice: only processed and returned quantity is billable.' }, { status: 409 });
      const company: any = await CompanySettings.findOne({ key: 'company' }).lean();
      const customer: any = await Customer.findById(job.party);
      if (!company?.legalName || !company.stateCode) return NextResponse.json({ error: 'Complete Company Settings before invoicing.' }, { status: 400 });
      const buyerState = customer.stateCode || stateCodeOf(customer.gstin);
      if (!buyerState) return NextResponse.json({ error: 'Customer state / GSTIN is missing.' }, { status: 400 });
      const tax = computeTax([{ description: `Job work charges (${job.natureOfJob || 'processing'}) - ${job.number}`, hsnCode: job.sac || '9988', quantity: billable, unitPrice: job.serviceRate, gstRate: job.gstRate ?? 18 }], company.stateCode, buyerState);
      const invoiceNumber = await nextDocNumber(Invoice, 'INV', 'invoiceNumber');
      await postJournal({ description: `Job work service invoice ${invoiceNumber} (${job.number})`, reference: invoiceNumber, referenceType: 'INVOICE', createdBy: user.id, lines: [
        { acc: ACC.AR, debit: tax.totalAmount }, { acc: ACC.JOBWORK_INCOME, credit: tax.subTotal }, { acc: ACC.GST_OUTPUT, credit: Math.round((tax.totalCGST + tax.totalSGST + tax.totalIGST) * 100) / 100 },
      ] });
      const date = new Date();
      const invoice = await Invoice.create({
        invoiceNumber, type: 'SALES', customer: customer._id, soNumber: job.number, issuedByRole: user.role, date, dueDate: new Date(date.getTime() + 30 * 86400000),
        items: tax.items.map(i => ({ description: i.description, hsnCode: i.hsnCode, quantity: i.quantity, unitPrice: i.unitPrice, taxableValue: i.taxableValue, cgstRate: i.cgstRate, cgstAmount: i.cgstAmount, sgstRate: i.sgstRate, sgstAmount: i.sgstAmount, igstRate: i.igstRate, igstAmount: i.igstAmount, totalAmount: i.totalAmount })),
        subTotal: tax.subTotal, totalCGST: tax.totalCGST, totalSGST: tax.totalSGST, totalIGST: tax.totalIGST, totalAmount: tax.totalAmount, status: 'ISSUED', placeOfSupply: buyerState, hsnSummary: tax.hsnSummary,
        parties: {
          seller: { gstin: company.gstin, name: company.legalName, address1: company.address1, address2: company.address2, city: company.city, pincode: company.pincode, stateCode: company.stateCode },
          buyer: { gstin: customer.gstin, name: customer.name, address1: customer.billingAddress, city: customer.city || '', pincode: customer.pincode || '', stateCode: buyerState },
        },
      });
      job.invoicedQty = r4(job.invoicedQty + billable);
      job.invoiceNumbers.push(invoiceNumber);
      await job.save();
      return NextResponse.json({ job, invoice });
    }

    return NextResponse.json({ error: 'Invalid action for this job work type.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: /locked/.test(err.message) ? 422 : 500 });
  }
}
