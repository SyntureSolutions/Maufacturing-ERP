import mongoose from 'mongoose';
import { NOTE_REASONS } from '@/lib/gstNote';
import Product from '@/models/Product';
import Supplier from '@/models/Supplier';
import Customer from '@/models/Customer';
import PurchaseIndent from '@/models/PurchaseIndent';
import RFQ from '@/models/RFQ';
import PurchaseReturn from '@/models/PurchaseReturn';
import PickList from '@/models/PickList';
import JobWorkOrder from '@/models/JobWorkOrder';
import MaterialRequisition from '@/models/MaterialRequisition';
import WorkOrder from '@/models/WorkOrder';
import StockTransferOrder from '@/models/StockTransferOrder';
import ProformaInvoice from '@/models/ProformaInvoice';
import Invoice from '@/models/Invoice';
import Voucher from '@/models/Voucher';
import DeliveryChallan from '@/models/DeliveryChallan';
import PurchaseOrder from '@/models/PurchaseOrder';
import Quotation from '@/models/Quotation';
import GRN from '@/models/GRN';
import '@/models/Batch';
import CompanySettings from '@/models/CompanySettings';
import SalesOrder from '@/models/SalesOrder';
import { amountInWords, computeTax, stateCodeOf } from '@/lib/gst';
import { addressLines, day, num, placeLabel, qty, rs, words, type PrintSpec } from '@/lib/printLayout';
import { orderView } from '@/lib/purchaseUnits';

// The documents printed through /api/print/<type>/<id>: who may print each, and how a record becomes a page.
// Documents with a PDF of their own (quotation, sales order, PO, GRN, invoice, delivery challan, BOM, job card) keep it.

const ANY_OFFICE = ['ADMIN', 'MANAGER', 'STAFF', 'VIEWER'];
const BUY = [...ANY_OFFICE, 'SUPPLY_CHAIN_MANAGER', 'FINANCE_MANAGER'];
const SELL = [...ANY_OFFICE, 'SALES', 'SUPPLY_CHAIN_MANAGER', 'FINANCE_MANAGER'];
const MAKE = [...ANY_OFFICE, 'PRODUCTION_MANAGER', 'SUPPLY_CHAIN_MANAGER', 'QUALITY_INSPECTOR'];
const MONEY = ['ADMIN', 'MANAGER', 'FINANCE_MANAGER', 'VIEWER'];

const THREE_COPIES = (first: string) => [`Original for ${first}`, 'Duplicate for Transporter', 'Triplicate for Consignor'];

async function find(model: mongoose.Model<any>, id: string, numberField: string) {
  const q = mongoose.isValidObjectId(id) ? { _id: id } : { [numberField]: id };
  return model.findOne(q).lean<any>();
}
async function names(ids: unknown[]) {
  const list = ids.filter(i => mongoose.isValidObjectId(i));
  const ps: any[] = list.length ? await Product.find({ _id: { $in: list } }).select('name sku uom hsnCode').lean() : [];
  return (id: unknown) => ps.find(p => String(p._id) === String(id)) || {};
}
const party = async (model: mongoose.Model<any>, id: unknown) => (mongoose.isValidObjectId(id) ? model.findById(id).lean<any>() : null);
/** A customer's delivery address: the first one on record, else the billing address */
const shipTo = (cust: any) => (cust?.shippingAddresses?.[0] ? [cust.shippingAddresses[0]] : ['Same as billing address']);

const gstTotals = (t: any, extra: [string, string, boolean?][] = []): [string, string, boolean?][] => [
  // freight, packing and the like are shown on their own, then the taxable value they are part of
  ...((t.charges || []).length ? [['Goods value', rs(t.goodsTotal)] as [string, string], ...t.charges.map((c: any) => [c.label, rs(c.amount)] as [string, string])] : []),
  ['Taxable value', rs(t.subTotal)],
  ...(t.totalCGST ? [['CGST', rs(t.totalCGST)] as [string, string]] : []),
  ...(t.totalSGST ? [['SGST', rs(t.totalSGST)] as [string, string]] : []),
  ...(t.totalIGST ? [['IGST', rs(t.totalIGST)] as [string, string]] : []),
  ...(t.tcs || []).map((x: any) => [`TCS u/s 206C(1) @ ${x.rate}%`, rs(x.amount)] as [string, string]),
  ['Total', rs(t.totalAmount), true],
  ...extra,
];

export interface PrintType { label: string; roles: string[]; load: (id: string, q: URLSearchParams, ctx?: { origin?: string; ackLink?: string }) => Promise<PrintSpec | null> }

export const PRINT_TYPES: Record<string, PrintType> = {
  'purchase-requisition': {
    label: 'Purchase requisition', roles: BUY,
    async load(id) {
      const d = await find(PurchaseIndent, id, 'number'); if (!d) return null;
      const p = await names(d.items.map((i: any) => i.product));
      const sups: any[] = await Supplier.find({ _id: { $in: d.items.map((i: any) => i.preferredSupplier).filter(Boolean) } }).select('name').lean();
      const so: any = d.salesOrder ? await SalesOrder.findById(d.salesOrder).select('soNumber customerName').lean() : null;
      return {
        title: 'PURCHASE REQUISITION', numberLabel: 'Indent No.', number: d.number,
        meta: [['Date', day(d.createdAt)], ['Status', words(d.status)], ['Raised from', words(d.source)], ['Category', d.category], ['For order', so ? `${so.soNumber} ${so.customerName || ''}` : ''], ['Requested by', d.requestedBy], ['Approved by', d.approvedBy]],
        columns: [{ key: 'n', label: '#', width: 4, align: 'center' }, { key: 'item', label: 'Item', width: 36 }, { key: 'qty', label: 'Quantity', width: 12, align: 'right', sum: 'qty' }, { key: 'uom', label: 'Unit', width: 7 }, { key: 'by', label: 'Required by', width: 13 }, { key: 'sup', label: 'Preferred supplier', width: 24 }],
        rows: d.items.map((i: any, n: number) => ({ n: i.lineNo || n + 1, item: `${p(i.product).name || 'Item'}${p(i.product).sku ? ` (${p(i.product).sku})` : ''}`, qty: qty(i.quantity), uom: i.uom || p(i.product).uom, by: day(i.requiredBy), sup: sups.find(s => String(s._id) === String(i.preferredSupplier))?.name || '' })),
        notes: [{ label: 'Remarks', text: d.remarks }],
        signatures: ['Requested by', 'Checked by (Stores)', 'Approved by'],
      };
    },
  },

  rfq: {
    label: 'Request for quotation', roles: BUY,
    async load(id, q) {
      const d = await find(RFQ, id, 'number'); if (!d) return null;
      const p = await names(d.items.map((i: any) => i.product));
      // ?supplier=<id> prints the copy for one supplier; otherwise the supplier box lists everyone it went to
      const sups: any[] = await Supplier.find({ _id: { $in: d.suppliers || [] } }).lean();
      const one = sups.find(s => String(s._id) === q.get('supplier'));
      return {
        title: 'REQUEST FOR QUOTATION', numberLabel: 'RFQ No.', number: d.number,
        meta: [['Date', day(d.createdAt)], ['Quote by', day(d.dueDate)], ['Status', words(d.status)]],
        parties: [one ? { label: 'To', name: one.name, lines: addressLines(one) } : { label: 'Sent to', lines: sups.map(s => s.name) }],
        columns: [{ key: 'n', label: '#', width: 4, align: 'center' }, { key: 'item', label: 'Item', width: 34 }, { key: 'hsn', label: 'HSN', width: 9 }, { key: 'qty', label: 'Quantity', width: 11, align: 'right', sum: 'qty' }, { key: 'uom', label: 'Unit', width: 7 }, { key: 'by', label: 'Required by', width: 12 }, { key: 'rate', label: 'Your rate', width: 12 }, { key: 'lead', label: 'Lead time', width: 11 }],
        rows: d.items.map((i: any, n: number) => ({ n: i.lineNo || n + 1, item: `${p(i.product).name || 'Item'}${p(i.product).sku ? ` (${p(i.product).sku})` : ''}`, hsn: p(i.product).hsnCode, qty: qty(i.quantity), uom: i.uom || p(i.product).uom, by: day(i.requiredBy), rate: '', lead: '' })),
        notes: [{ label: 'Please quote', text: 'Unit rate before GST, GST %, freight, payment terms and lead time for each item. Quote valid for at least 30 days.' }],
        signatures: ['Purchase', 'Authorised signatory'],
      };
    },
  },

  'purchase-return': {
    label: 'Purchase return', roles: BUY,
    async load(id) {
      const d = await find(PurchaseReturn, id, 'number'); if (!d) return null;
      const p = await names(d.items.map((i: any) => i.product));
      const s = await party(Supplier, d.supplier);
      return {
        title: 'PURCHASE RETURN / DEBIT NOTE', numberLabel: 'Return No.', number: d.number, copies: THREE_COPIES('Supplier'),
        meta: [['Date', day(d.createdAt)], ['Against GRN', d.grnNumber], ['Debit note', d.debitNoteNumber], ['Bill', d.billNumber], ['Status', words(d.status)]],
        parties: [{ label: 'Returned to', name: s?.name, lines: addressLines(s || {}) }],
        columns: [{ key: 'n', label: '#', width: 4, align: 'center' }, { key: 'item', label: 'Item', width: 32 }, { key: 'reason', label: 'Reason', width: 24 }, { key: 'qty', label: 'Qty', width: 10, align: 'right', sum: 'qty' }, { key: 'rate', label: 'Rate', width: 13, align: 'right' }, { key: 'amt', label: 'Amount', width: 15, align: 'right', sum: 'money' }],
        rows: d.items.map((i: any, n: number) => ({ n: n + 1, item: p(i.product).name || 'Item', reason: i.reason, qty: qty(i.quantity), rate: num(i.unitPrice), amt: num(i.quantity * i.unitPrice) })),
        totals: [['Value of goods', rs(d.baseAmount)], [`GST${d.gstPercent ? ` @ ${d.gstPercent}%` : ''}`, rs(d.gstAmount)], ['Total', rs(d.totalAmount), true]],
        notes: [{ label: 'Amount in words', text: amountInWords(d.totalAmount || 0) }],
        signatures: ['Prepared by', 'Received by (supplier)', 'Authorised signatory'],
      };
    },
  },

  'pick-list': {
    label: 'Pick list', roles: SELL,
    async load(id) {
      const d = await find(PickList, id, 'number'); if (!d) return null;
      const p = await names(d.lines.map((i: any) => i.product));
      return {
        title: 'PICK LIST', numberLabel: 'Pick List No.', number: d.number,
        meta: [['Date', day(d.createdAt)], ['Sales order', d.soNumber], ['Customer', d.customerName], ['Status', words(d.status)], ['Made by', d.createdByName], ['Picked by', d.pickedByName], ['Picked on', day(d.pickedAt)]],
        columns: [{ key: 'n', label: '#', width: 4, align: 'center' }, { key: 'loc', label: 'Location', width: 13 }, { key: 'item', label: 'Item', width: 33 }, { key: 'batch', label: 'Batch', width: 15 }, { key: 'qty', label: 'To pick', width: 10, align: 'right', sum: 'qty' }, { key: 'picked', label: 'Picked', width: 10, align: 'right' }, { key: 'note', label: 'Short / note', width: 15 }],
        rows: d.lines.map((i: any, n: number) => ({ n: i.lineNo || n + 1, loc: i.location, item: `${p(i.product).name || 'Item'}${p(i.product).sku ? ` (${p(i.product).sku})` : ''}`, batch: i.batchNumber, qty: qty(i.quantity), picked: d.status === 'OPEN' ? '' : qty(i.pickedQty), note: i.shortReason })),
        signatures: ['Picked by', 'Checked by', 'Packed by'],
      };
    },
  },

  'material-requisition': {
    label: 'Material requisition', roles: MAKE,
    async load(id) {
      const d = await find(MaterialRequisition, id, 'number'); if (!d) return null;
      const p = await names(d.items.map((i: any) => i.product));
      const wo: any = await WorkOrder.findById(d.workOrder).select('woNumber quantity product').lean();
      const fg = wo ? (await names([wo.product]))(wo.product) : {};
      return {
        title: 'MATERIAL REQUISITION', numberLabel: 'Requisition No.', number: d.number,
        meta: [['Date', day(d.createdAt)], ['Work order', wo?.woNumber], ['To make', fg.name ? `${qty(wo.quantity)} x ${fg.name}` : ''], ['Status', words(d.status)], ['Raised by', d.createdBy]],
        columns: [{ key: 'n', label: '#', width: 4, align: 'center' }, { key: 'item', label: 'Item', width: 38 }, { key: 'uom', label: 'Unit', width: 8 }, { key: 'req', label: 'Required', width: 12, align: 'right' }, { key: 'res', label: 'Reserved', width: 12, align: 'right' }, { key: 'iss', label: 'Issued', width: 12, align: 'right' }, { key: 'sign', label: 'Store sign', width: 14 }],
        rows: d.items.map((i: any, n: number) => ({ n: n + 1, item: `${p(i.product).name || 'Item'}${p(i.product).sku ? ` (${p(i.product).sku})` : ''}`, uom: i.uom || p(i.product).uom, req: qty(i.requiredQty), res: qty(i.reservedQty), iss: qty(i.issuedQty), sign: '' })),
        notes: [{ label: 'Remarks', text: [d.shortfall ? 'Material short: some lines could not be fully reserved.' : '', d.remarks].filter(Boolean).join('\n') }],
        signatures: ['Requested by (Production)', 'Issued by (Stores)', 'Received by'],
      };
    },
  },

  'stock-transfer': {
    label: 'Stock transfer', roles: [...MAKE, 'FINANCE_MANAGER'],
    async load(id) {
      const d = await find(StockTransferOrder, id, 'transferNumber'); if (!d) return null;
      return {
        title: 'STOCK TRANSFER NOTE', numberLabel: 'Transfer No.', number: d.transferNumber, copies: ['Original for Receiving Store', 'Duplicate for Transporter', 'Triplicate for Sending Store'],
        meta: [['Date', day(d.createdAt)], ['Type', words(d.type)], ['Status', words(d.status)], ['Dispatched', day(d.dispatchDate)], ['Received', day(d.deliveryDate)], ['E-way bill', d.ewayBillNumber]],
        parties: [{ label: 'From', name: d.fromWarehouse }, { label: 'To', name: d.toWarehouse, lines: [[d.carrier, d.vehicleNumber && `Vehicle ${d.vehicleNumber}`].filter(Boolean).join('  |  '), [d.driverName, d.driverPhone].filter(Boolean).join(' ')] }],
        columns: [{ key: 'n', label: '#', width: 4, align: 'center' }, { key: 'item', label: 'Item', width: 30 }, { key: 'batch', label: 'Batch', width: 14 }, { key: 'req', label: 'Requested', width: 11, align: 'right' }, { key: 'sent', label: 'Sent', width: 10, align: 'right' }, { key: 'recd', label: 'Received', width: 11, align: 'right' }, { key: 'val', label: 'Value', width: 14, align: 'right' }],
        rows: (d.items || []).map((i: any, n: number) => ({ n: n + 1, item: `${i.productName || 'Item'}${i.productSku ? ` (${i.productSku})` : ''}`, batch: i.batchNumber, req: qty(i.requestedQuantity), sent: qty(i.dispatchedQuantity), recd: d.status === 'RECEIVED' ? qty(i.receivedQuantity) : '', val: num((i.dispatchedQuantity || i.requestedQuantity || 0) * (i.unitCost || 0)) })),
        notes: [{ label: 'Notes', text: d.notes }],
        signatures: [`Sent by ${d.createdByName || ''}`.trim(), 'Transporter', `Received by ${d.receivedByName || ''}`.trim()],
      };
    },
  },

  'jobwork-challan': {
    label: 'Job work challan', roles: [...MAKE, 'FINANCE_MANAGER'],
    async load(id) {
      const d = await find(JobWorkOrder, id, 'number'); if (!d) return null;
      const p = await names(d.items.map((i: any) => i.product));
      const s = d.kind === 'OUTWARD' ? await party(Supplier, d.party) : await party(Customer, d.party);
      return {
        title: d.kind === 'OUTWARD' ? 'JOB WORK CHALLAN (RULE 45)' : 'JOB WORK - MATERIAL RECEIVED', number: d.number, copies: d.kind === 'OUTWARD' ? THREE_COPIES('Job Worker') : undefined,
        meta: [['Date', day(d.date)], ['Nature of job', d.natureOfJob], ['Goods', words(d.goodsType)], ['Return due by', day(d.dueDate)], ['Vehicle', d.vehicleNo], ['Customer PO', d.customerPoNumber]],
        parties: [{ label: d.kind === 'OUTWARD' ? 'Job worker' : 'Customer (owner of goods)', name: d.partyName || s?.name, lines: addressLines({ ...(s || {}), gstin: d.partyGstin || s?.gstin }) }],
        columns: [{ key: 'n', label: '#', width: 4, align: 'center' }, { key: 'item', label: 'Description of goods', width: 40 }, { key: 'hsn', label: 'HSN', width: 10 }, { key: 'qty', label: 'Quantity', width: 12, align: 'right', sum: 'qty' }, { key: 'uom', label: 'Unit', width: 8 }, { key: 'val', label: 'Value', width: 14, align: 'right' }],
        rows: d.items.map((i: any, n: number) => ({ n: n + 1, item: i.description || p(i.product).name || 'Goods', hsn: i.hsnCode || p(i.product).hsnCode, qty: qty(i.quantity), uom: i.uom || p(i.product).uom, val: num(i.value) })),
        totals: [['Value of goods (not a sale)', rs(d.items.reduce((t: number, i: any) => t + (i.value || 0), 0)), true]],
        notes: [{ label: 'Declaration', text: d.kind === 'OUTWARD' ? 'Goods sent for job work under Section 143 of the CGST Act, to be returned within the prescribed period. Not a sale.' : 'Customer-owned material received for job work. Not a purchase.' }],
        signatures: ['Prepared by', 'Received by', 'Authorised signatory'],
      };
    },
  },

  'jobwork-po': {
    label: 'Job work order', roles: [...MAKE, 'FINANCE_MANAGER'],
    async load(id) {
      const d = await find(JobWorkOrder, id, 'number'); if (!d || !d.poNumber) return null;
      const s = await party(Supplier, d.party);
      const q = d.expectedOutputQty || d.items.reduce((t: number, i: any) => t + i.quantity, 0);
      const base = Math.round(q * (d.processingCharge || 0) * 100) / 100, tax = Math.round(base * (d.poGstRate || 0)) / 100;
      return {
        title: 'PURCHASE ORDER - JOB WORK', numberLabel: 'PO No.', number: d.poNumber,
        meta: [['Date', day(d.poIssuedAt)], ['Issue challan', d.number], ['Return due by', day(d.dueDate)]],
        parties: [{ label: 'Job worker', name: d.partyName || s?.name, lines: addressLines(s || {}) }],
        columns: [{ key: 'item', label: 'Service', width: 46 }, { key: 'sac', label: 'SAC', width: 9 }, { key: 'qty', label: 'Quantity', width: 12, align: 'right', sum: 'qty' }, { key: 'rate', label: 'Rate', width: 14, align: 'right' }, { key: 'amt', label: 'Amount', width: 16, align: 'right', sum: 'money' }],
        rows: [{ item: `${d.natureOfJob || 'Job work'} (material sent on challan ${d.number})`, sac: '9988', qty: qty(q), rate: num(d.processingCharge), amt: num(base) }],
        totals: [['Processing charges', rs(base)], [`GST @ ${d.poGstRate || 0}%`, rs(tax)], ['Total', rs(base + tax), true]],
        notes: [{ label: 'Terms', text: d.poTerms || 'Processing charges as agreed. Material remains our property and is to be returned in the quantities recorded on the challan.' }],
        signatures: ['Prepared by', 'Authorised signatory'],
      };
    },
  },

  'jobwork-return': {
    label: 'Job work return challan', roles: [...MAKE, 'FINANCE_MANAGER'],
    async load(id, q) {
      const d = await find(JobWorkOrder, id, 'number'); if (!d) return null;
      const r = (d.returns || []).find((x: any) => x.challanNo === q.get('challan')) || (d.returns || []).at(-1);
      if (!r) return null;
      const c = await party(Customer, d.party);
      return {
        title: 'RETURN CHALLAN - JOB WORK', numberLabel: 'Challan No.', number: r.challanNo || `${d.number}-R`, copies: THREE_COPIES('Consignee'),
        meta: [['Date', day(r.at)], ['Job order', d.number], ['Vehicle', r.vehicleNo]],
        parties: [{ label: 'Consignee (owner of goods)', name: d.partyName || c?.name, lines: addressLines(c || {}) }],
        columns: [{ key: 'item', label: 'Description of goods', width: 60 }, { key: 'sac', label: 'HSN / SAC', width: 14 }, { key: 'qty', label: 'Quantity', width: 16, align: 'right', sum: 'qty' }],
        rows: [{ item: `${d.natureOfJob || 'Processed goods'} (job ${d.number})`, sac: d.sac, qty: qty(r.quantity) }],
        notes: [{ label: 'Declaration', text: 'Customer-owned material returned after job work. No sale.' }],
        signatures: ['Prepared by', 'Received by', 'Authorised signatory'],
      };
    },
  },

  proforma: {
    label: 'Proforma invoice', roles: SELL,
    async load(id) {
      const d = await find(ProformaInvoice, id, 'number'); if (!d) return null;
      const b = d.parties?.buyer || {};
      const bank = d.bank || {};
      const anyDisc = (d.items || []).some((i: any) => i.discountPercent);
      return {
        title: 'PROFORMA INVOICE', numberLabel: 'Proforma No.', number: d.number, seller: d.parties?.seller,
        meta: [['Date', day(d.date || d.createdAt)], ['Sales order', d.soNumber], ['Place of supply', placeLabel(d.placeOfSupply)], ['Status', words(d.status)], ['Invoice', d.invoiceNumber]],
        parties: [{ label: 'Bill to', name: b.name || d.customerName, lines: addressLines(b) }],
        columns: [{ key: 'n', label: '#', width: 4, align: 'center' }, { key: 'item', label: 'Description', width: anyDisc ? 28 : 34 }, { key: 'hsn', label: 'HSN', width: 9 }, { key: 'qty', label: 'Qty', width: 9, align: 'right', sum: 'qty' }, { key: 'rate', label: 'Rate', width: 12, align: 'right' }, ...(anyDisc ? [{ key: 'disc', label: 'Disc %', width: 6, align: 'right' as const }] : []), { key: 'tv', label: 'Taxable', width: 13, align: 'right', sum: 'money' }, { key: 'gst', label: 'GST %', width: 7, align: 'right' }, { key: 'amt', label: 'Amount', width: 13, align: 'right', sum: 'money' }],
        rows: (d.items || []).map((i: any, n: number) => ({ n: n + 1, item: i.description, hsn: i.hsnCode, qty: qty(i.quantity), rate: num(i.listPrice ?? i.unitPrice), disc: i.discountPercent ? `${Math.round(i.discountPercent * 100) / 100}%` : '', tv: num(i.taxableValue), gst: `${(i.igstRate || 0) + (i.cgstRate || 0) + (i.sgstRate || 0)}%`, amt: num(i.totalAmount) })),
        totals: gstTotals(d, d.advanceRequested ? [['Advance requested', rs(d.advanceRequested)]] : []),
        notes: [{ label: 'Amount in words', text: amountInWords(d.totalAmount || 0) }, { label: 'Bank details', text: [bank.name, bank.accountNo && `A/c ${bank.accountNo}`, bank.ifsc && `IFSC ${bank.ifsc}`, bank.branch].filter(Boolean).join('  |  ') }, { label: 'Terms', text: d.terms }],
        signatures: ['Authorised signatory'],
      };
    },
  },

  voucher: {
    label: 'Voucher', roles: MONEY,
    async load(id) {
      const d = await find(Voucher, id, 'number'); if (!d) return null;
      const lines = d.lines || [];
      const dr = lines.reduce((t: number, l: any) => t + (l.debit || 0), 0), cr = lines.reduce((t: number, l: any) => t + (l.credit || 0), 0);
      const ins = d.instrument || {};
      return {
        title: `${words(d.type).toUpperCase()} VOUCHER`.replace('NOTE VOUCHER', 'NOTE'), number: d.number,
        meta: [['Date', day(d.date)], ['Party', d.partyName], ['Reference', [d.refDoc?.number || (typeof d.refDoc === 'string' ? d.refDoc : ''), (d.refDoc?.date || d.noteDetails?.originalDate) && `dated ${day(d.refDoc?.date || d.noteDetails?.originalDate)}`].filter(Boolean).join(' ')],
          ...(d.noteDetails?.reason ? [['Reason', NOTE_REASONS[d.noteDetails.reason as keyof typeof NOTE_REASONS] || words(d.noteDetails.reason)] as [string, string]] : []),
          ...(d.noteDetails?.partyNoteNo ? [[d.type === 'CREDIT_NOTE' ? "Customer's debit note" : "Supplier's credit note", `${d.noteDetails.partyNoteNo}${d.noteDetails.partyNoteDate ? ` dated ${day(d.noteDetails.partyNoteDate)}` : ''}`] as [string, string]] : []),
          ...(d.noteDetails?.itcDate ? [['ITC reversed on', day(d.noteDetails.itcDate)] as [string, string]] : []),
          ['Mode', [words(ins.mode), ins.chequeNo && `Cheque ${ins.chequeNo}`, ins.utr && `UTR ${ins.utr}`, ins.bank].filter(Boolean).join(' ')], ['Cost centre', d.costCenter], ['Status', words(d.status)]],
        columns: [{ key: 'code', label: 'Account', width: 16 }, { key: 'name', label: 'Account name', width: 48 }, { key: 'dr', label: 'Debit', width: 18, align: 'right' }, { key: 'cr', label: 'Credit', width: 18, align: 'right' }],
        rows: lines.map((l: any) => ({ code: l.accountCode, name: l.accountName, dr: l.debit ? num(l.debit) : '', cr: l.credit ? num(l.credit) : '' })),
        emptyText: 'No ledger lines.',
        totals: [['Total debit', rs(dr)], ['Total credit', rs(cr)], ['Amount', rs(d.amount), true]],
        notes: [{ label: 'Amount in words', text: amountInWords(d.amount || 0) }, { label: 'Narration', text: d.narration }, ...(d.noteDetails?.rateDiff ? [{ label: 'Rate difference', text: `${qty(d.noteDetails.rateDiff.quantity)} at billed rate ${num(d.noteDetails.rateDiff.billedRate)} against actual rate ${num(d.noteDetails.rateDiff.actualRate)} = ${rs(d.taxableAmount)}` }] : []), { label: 'Tax', text: d.gstAmount || d.tdsAmount ? [d.taxableAmount && `Taxable ${rs(d.taxableAmount)}`, d.gstAmount && `GST ${d.gstPercent || ''}% ${rs(d.gstAmount)}`, d.tdsAmount && `TDS ${rs(d.tdsAmount)}`].filter(Boolean).join('  |  ') : '' }],
        signatures: [`Prepared by ${d.createdBy || ''}`.trim(), 'Checked by', 'Authorised signatory', d.partyType === 'OTHER' ? 'Receiver' : 'Party'],
      };
    },
  },
  'vendor-bill': {
    label: 'Vendor bill', roles: [...MONEY, 'SUPPLY_CHAIN_MANAGER', 'STAFF'],
    async load(id) {
      const d = await find(Invoice, id, 'invoiceNumber'); if (!d || d.type !== 'PURCHASE') return null;
      const s = await party(Supplier, d.supplier);
      const p = await names(d.items.map((i: any) => i.product));
      const paid = d.amountPaid || 0, credited = d.creditedAmount || 0;
      return {
        title: 'PURCHASE BILL VOUCHER', numberLabel: 'Bill No.', number: d.invoiceNumber,
        meta: [['Booked on', day(d.createdAt)], ['Supplier bill no.', d.vendorBillNumber], ['Bill date', day(d.date)], ['Due date', day(d.dueDate)], ['PO', d.poNumber], ['GRN', (d.grnRefs || []).join(', ')], ['Reverse charge', d.reverseCharge ? 'Yes' : ''], ['Status', words(d.status)]],
        parties: [{ label: 'Supplier', name: s?.name, lines: addressLines(s || {}) }],
        columns: [{ key: 'n', label: '#', width: 4, align: 'center' }, { key: 'item', label: 'Description', width: 33 }, { key: 'hsn', label: 'HSN', width: 9 }, { key: 'qty', label: 'Qty', width: 9, align: 'right', sum: 'qty' }, { key: 'rate', label: 'Rate', width: 12, align: 'right' }, { key: 'tv', label: 'Taxable', width: 13, align: 'right', sum: 'money' }, { key: 'gst', label: 'GST %', width: 7, align: 'right' }, { key: 'amt', label: 'Amount', width: 13, align: 'right', sum: 'money' }],
        rows: d.items.map((i: any, n: number) => ({ n: n + 1, item: `${i.description || p(i.product).name || 'Item'}${i.returnedQty ? ` (returned ${qty(i.returnedQty)})` : ''}`, hsn: i.hsnCode || p(i.product).hsnCode, qty: qty(i.quantity), rate: num(i.unitPrice), tv: num(i.taxableValue), gst: `${(i.igstRate || 0) + (i.cgstRate || 0) + (i.sgstRate || 0)}%`, amt: num(i.totalAmount) })),
        totals: gstTotals(d, [...(credited ? [['Debit notes', `- ${rs(credited)}`] as [string, string]] : []), ['Paid', rs(paid)], ['Balance payable', rs((d.totalAmount || 0) - credited - paid), true]]),
        notes: [{ label: 'Amount in words', text: amountInWords(d.totalAmount || 0) }],
        signatures: ['Booked by (Accounts)', 'Checked by', 'Approved for payment'],
      };
    },
  },
  invoice: {
    label: 'Invoice', roles: [...SELL, 'FINANCE_MANAGER'],
    async load(id, q) {
      const d = await find(Invoice, id, 'invoiceNumber'); if (!d) return null;
      if (d.type === 'PURCHASE') return PRINT_TYPES['vendor-bill'].load(id, q);
      const cust: any = d.customer ? await party(Customer, d.customer) : null;
      const b = d.parties?.buyer || cust || {};
      const company: any = await CompanySettings.findOne({ key: 'company' }).select('bank invoiceTerms').lean();
      const bank = company?.bank || {};
      const tax = (i: any) => (i.cgstAmount || 0) + (i.sgstAmount || 0) + (i.igstAmount || 0);
      const all = q.get('copies') === 'all';
      const anyDisc = (d.items || []).some((i: any) => i.discountPercent);
      return {
        title: 'TAX INVOICE', numberLabel: 'Invoice No.', number: d.invoiceNumber, seller: d.parties?.seller,
        copies: all ? ['Original for Recipient', 'Duplicate for Transporter', 'Triplicate for Supplier'] : ['Original for Recipient'],
        meta: [['Invoice date', day(d.date || d.createdAt)], ['Due date', day(d.dueDate)], ['Sales order', d.soNumber], ['Delivery challan', d.dcRef], ['Proforma', d.proformaRef], ['Place of supply', placeLabel(d.placeOfSupply)], ['Reverse charge', d.reverseCharge ? 'Yes' : 'No']],
        einvoice: { lines: [['IRN', d.irn], ['Ack no. / date', d.ackNo ? `${d.ackNo}  ${day(d.ackDate)}` : ''], ['E-way bill', d.ewayBillNumber ? `${d.ewayBillNumber}${d.ewayBillValidUpto || d.ewayValidUpto ? `  valid to ${day(d.ewayBillValidUpto || d.ewayValidUpto)}` : ''}` : ''], ['Transport', [d.transport?.transporterName, d.transport?.vehicleNo, d.transport?.lrNo && `LR ${d.transport.lrNo}`].filter(Boolean).join('  |  ')]], qr: d.signedQr },
        parties: [{ label: 'Bill to', name: b.name || d.customerName, lines: addressLines(b) }, { label: 'Ship to', name: b.name || d.customerName, lines: shipTo(cust) }],
        columns: [{ key: 'n', label: '#', width: 4, align: 'center' }, { key: 'item', label: 'Description', width: anyDisc ? 23 : 29 }, { key: 'hsn', label: 'HSN', width: 9 }, { key: 'qty', label: 'Qty', width: 8, align: 'right', sum: 'qty' }, { key: 'rate', label: 'Rate', width: 11, align: 'right' }, ...(anyDisc ? [{ key: 'disc', label: 'Disc %', width: 6, align: 'right' as const }] : []), { key: 'tv', label: 'Taxable', width: 12, align: 'right', sum: 'money' }, { key: 'gst', label: 'GST %', width: 7, align: 'right' }, { key: 'tax', label: 'GST', width: 9, align: 'right', sum: 'money' }, { key: 'amt', label: 'Amount', width: 12, align: 'right', sum: 'money' }],
        rows: (d.items || []).map((i: any, n: number) => ({ n: n + 1, item: i.description || i.product?.name || 'Item', hsn: i.hsnCode, qty: qty(i.quantity), rate: num(i.listPrice ?? i.unitPrice), disc: i.discountPercent ? `${Math.round(i.discountPercent * 100) / 100}%` : '', tv: num(i.taxableValue), gst: `${(i.igstRate || 0) + (i.cgstRate || 0) + (i.sgstRate || 0)}%`, tax: num(tax(i)), amt: num(i.totalAmount) })),
        totals: gstTotals(d, d.creditedAmount ? [['Credit notes', `- ${rs(d.creditedAmount)}`]] : []),
        tables: [{ title: 'HSN / SAC summary', columns: [{ key: 'hsn', label: 'HSN / SAC', width: 20 }, { key: 'tv', label: 'Taxable value', width: 20, align: 'right', sum: 'money' }, { key: 'c', label: 'CGST', width: 15, align: 'right' }, { key: 's', label: 'SGST', width: 15, align: 'right' }, { key: 'i', label: 'IGST', width: 15, align: 'right' }, { key: 't', label: 'Total tax', width: 15, align: 'right' }],
          rows: (d.hsnSummary || []).map((h: any) => ({ hsn: h.hsnCode, tv: num(h.taxableValue), c: num(h.cgst), s: num(h.sgst), i: num(h.igst), t: num(h.totalTax) })) }],
        notes: [{ label: 'Amount in words', text: amountInWords(d.totalAmount || 0) }, { label: 'Bank details', text: [bank.name, bank.accountNo && `A/c ${bank.accountNo}`, bank.ifsc && `IFSC ${bank.ifsc}`, bank.branch].filter(Boolean).join('  |  ') }, { label: 'Terms', text: company?.invoiceTerms }],
        signatures: ["Receiver's signature", 'Authorised signatory'],
      };
    },
  },

  'delivery-challan': {
    label: 'Delivery challan', roles: SELL,
    async load(id, q) {
      const d = await find(DeliveryChallan, id, 'number'); if (!d) return null;
      // challan lines keep no unit of their own: it is the item's stock unit
      const pids = (d.items || []).map((i: any) => i.product).filter((p: any) => p && mongoose.isValidObjectId(String(p)));
      const unitOf = new Map((await Product.find({ _id: { $in: pids } }).select('uom').lean() as any[]).map(p => [String(p._id), p.uom]));
      const b = d.parties?.buyer || (await party(Customer, d.customer)) || {};
      const copies = ['Original for Consignee', 'Duplicate for Transporter', 'Triplicate for Consignor'];
      const one = q.get('copy');
      return {
        title: 'DELIVERY CHALLAN', numberLabel: 'Challan No.', number: d.number, seller: d.parties?.seller, copies: one && copies.includes(one) ? [one] : copies,
        meta: [['Date', day(d.date || d.createdAt)], ['Sales order', d.soNumber], ['Reason', words(d.reason)], ['Place of supply', placeLabel(d.placeOfSupply)], ['Invoice', d.invoiceNumber], ['Status', words(d.status)]],
        parties: [{ label: 'Consignee', name: b.name || d.customerName, lines: addressLines(b) }, { label: 'Transport', name: d.transporterName, lines: [d.vehicleNo && `Vehicle: ${d.vehicleNo}`, d.lrNo && `LR / bilty: ${d.lrNo}`] }],
        columns: [{ key: 'n', label: '#', width: 4, align: 'center' }, { key: 'item', label: 'Description of goods', width: 44 }, { key: 'hsn', label: 'HSN', width: 11 }, { key: 'qty', label: 'Quantity', width: 12, align: 'right', sum: 'qty' }, { key: 'uom', label: 'Unit', width: 9 }, { key: 'val', label: 'Value', width: 16, align: 'right', sum: 'money' }],
        rows: (d.items || []).map((i: any, n: number) => ({ n: n + 1, item: i.description || 'Goods', hsn: i.hsnCode, qty: qty(i.quantity), uom: i.uom || unitOf.get(String(i.product)) || '', val: num(i.taxableValue) })),
        totals: [['Value of goods', rs(d.totalTaxable ?? (d.items || []).reduce((t: number, i: any) => t + (i.taxableValue || 0), 0)), true]],
        notes: [{ label: 'Declaration', text: 'Not a tax invoice. Issued under Rule 55 of the CGST Rules, 2017.' }],
        signatures: ['Prepared by', 'Transporter', "Receiver's signature and stamp"],
      };
    },
  },
  'qc-certificate': {
    label: 'QC certificate', roles: MAKE,
    async load(id) {
      const wo = await find(WorkOrder, id, 'woNumber'); if (!wo?.fgQc?.certificateNo) return null;
      const fg = (await names([wo.product]))(wo.product);
      const so: any = wo.salesOrder ? await SalesOrder.findById(wo.salesOrder).select('soNumber customerName').lean() : null;
      const qc = wo.fgQc;
      return {
        title: 'QUALITY CERTIFICATE', numberLabel: 'Certificate No.', number: qc.certificateNo,
        meta: [['Date', day(qc.at)], ['Work order', wo.woNumber], ['For order', so ? `${so.soNumber} ${so.customerName || ''}` : 'Make to stock'], ['Result', words(qc.status)]],
        parties: [{ label: 'Product', name: `${fg.name || 'Item'}${fg.sku ? ` (${fg.sku})` : ''}`, lines: [`Received ${qty(wo.fgReceivedQty || 0)}  |  Approved ${qty(wo.fgApprovedQty || 0)}  |  Rejected ${qty(wo.fgScrapQty || 0)} ${fg.uom || ''}`] }],
        columns: [{ key: 'n', label: '#', width: 5, align: 'center' }, { key: 'name', label: 'Check', width: 35 }, { key: 'std', label: 'Standard', width: 25 }, { key: 'act', label: 'Actual', width: 22 }, { key: 'res', label: 'Result', width: 13, align: 'center' }],
        rows: (qc.checks || []).map((c: any, n: number) => ({ n: n + 1, name: c.name, std: c.standard, act: c.actual, res: c.result })),
        emptyText: 'No individual checks were recorded.',
        signatures: [`Inspected by ${qc.inspector || ''}`.trim(), 'Quality head'],
      };
    },
  },

  'purchase-order': {
    label: 'Purchase order', roles: ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER', 'FINANCE_MANAGER'],
    async load(id, _q, ctx) {
      const d: any = await PurchaseOrder.findOne(mongoose.isValidObjectId(id) ? { _id: id } : { poNumber: id }).populate('supplier').populate('items.product', 'name sku uom hsnCode gstRate').lean();
      if (!d) return null;
      const company: any = await CompanySettings.findOne({ key: 'company' }).lean();
      const s = d.supplier || {};
      // GST the way the PO screen works it out: supplier's state to ours
      const t = computeTax(d.items.map((i: any) => ({ description: i.product?.name || '', hsnCode: i.product?.hsnCode || '', quantity: i.quantity, unitPrice: i.unitPrice, gstRate: Number(i.product?.gstRate ?? 0) })), stateCodeOf(s.gstin), company?.stateCode || stateCodeOf(company?.gstin), d.charges || []);
      const anyDisc = d.items.some((i: any) => i.discountPercent);
      const ack = ctx?.ackLink || (d.dispatch?.ackToken && ctx?.origin ? `${ctx.origin}/vendor-ack/${d.dispatch.ackToken}` : '');
      return {
        title: 'PURCHASE ORDER', numberLabel: 'PO No.', number: d.poNumber,
        meta: [['PO date', day(d.orderDate || d.createdAt)], ['Expected delivery', day(d.expectedDeliveryDate)], ['Payment terms', s.paymentTerms], ['Status', words(d.status)], ['Approved by', d.approvedBy?.name]],
        parties: [{ label: 'Supplier', name: s.name, lines: addressLines(s) }, { label: 'Deliver to', name: company?.legalName, lines: addressLines(company || {}).slice(0, 2) }],
        columns: [{ key: 'n', label: '#', width: 4, align: 'center' }, { key: 'item', label: 'Item', width: 28 }, { key: 'hsn', label: 'HSN', width: 8 }, { key: 'qty', label: 'Qty', width: 9, align: 'right', sum: 'qty' }, { key: 'by', label: 'Deliver by', width: 11 }, { key: 'rate', label: 'Rate', width: 11, align: 'right' }, ...(anyDisc ? [{ key: 'disc', label: 'Disc %', width: 6, align: 'right' as const }] : []), { key: 'tv', label: 'Amount', width: 14, align: 'right', sum: 'money' }, { key: 'gst', label: 'GST %', width: 7, align: 'right' }],
        rows: d.items.map((i: any, n: number) => ({ n: i.lineNo || n + 1, item: `${i.product?.name || 'Item'}${i.product?.sku ? ` (${i.product.sku})` : ''}`, hsn: i.product?.hsnCode, qty: `${qty(orderView(i, i.product?.uom).qty)} ${orderView(i, i.product?.uom).unit}`.trim() + (i.orderFactor ? ` (= ${qty(i.quantity)} ${i.product?.uom || ''})` : ''), by: day(i.deliveryDate || d.expectedDeliveryDate), rate: num((i.listPrice ?? i.unitPrice) * (i.orderFactor || 1)), disc: i.discountPercent ? `${i.discountPercent}%` : '', tv: num(t.items[n].goodsValue), gst: `${t.items[n].gstRate}%`, amt: num(t.items[n].totalAmount) })),
        totals: gstTotals(t),
        notes: [{ label: 'Amount in words', text: amountInWords(t.totalAmount) }, { label: 'Notes', text: d.notes },
          { label: 'Instructions to the supplier', text: `Please quote PO No. ${d.poNumber} on your invoice, delivery challan and packing list. Goods are accepted subject to our inward inspection.` },
          { label: 'Please acknowledge this order', text: ack }],
        signatures: ['Prepared by', `Approved by ${d.approvedBy?.name || ''}`.trim(), 'Authorised signatory'],
      };
    },
  },

  'sales-order': {
    label: 'Sales order', roles: SELL,
    async load(id) {
      const d: any = await SalesOrder.findOne(mongoose.isValidObjectId(id) ? { _id: id } : { soNumber: id }).populate('customer').populate('items.product', 'name sku uom hsnCode gstRate').lean();
      if (!d) return null;
      const company: any = await CompanySettings.findOne({ key: 'company' }).lean();
      const c = d.customer && typeof d.customer === 'object' ? d.customer : {};
      const isExport = d.orderType === 'EXPORT';
      const pos = c.stateCode || stateCodeOf(c.gstin);
      // GST the way the sales order screen works it out (exports carry none)
      const t = computeTax(d.items.map((i: any) => ({ description: i.product?.name || '', hsnCode: i.product?.hsnCode || '', quantity: i.quantity, unitPrice: i.unitPrice, gstRate: isExport ? 0 : Number(i.product?.gstRate ?? 0) })), company?.stateCode || stateCodeOf(company?.gstin), pos, d.charges || []);
      const anyDisc = d.items.some((i: any) => i.discountPercent);
      return {
        title: 'SALES ORDER', numberLabel: 'SO No.', number: d.soNumber,
        meta: [['Order date', day(d.createdAt)], ['Customer PO', d.poNumber], ['Quotation', d.quotationRef], ['Delivery by', day(d.deliveryDate)], ['Payment terms', d.paymentTerms], ['Place of supply', isExport ? 'Export' : placeLabel(pos)], ['Status', words(d.status)]],
        parties: [{ label: 'Customer', name: d.customerName || c.name, lines: addressLines(c) }, ...(isExport ? [exportBox(d)] : [])],
        columns: [{ key: 'n', label: '#', width: 4, align: 'center' }, { key: 'item', label: 'Item', width: anyDisc ? 22 : 28 }, { key: 'hsn', label: 'HSN', width: 8 }, { key: 'qty', label: 'Qty', width: 9, align: 'right', sum: 'qty' }, { key: 'by', label: 'Deliver by', width: 11 }, { key: 'rate', label: 'Rate', width: 11, align: 'right' }, ...(anyDisc ? [{ key: 'disc', label: 'Disc %', width: 6, align: 'right' as const }] : []), { key: 'tv', label: 'Value', width: 12, align: 'right', sum: 'money' }, { key: 'gst', label: 'GST %', width: 6, align: 'right' }, { key: 'amt', label: 'Amount', width: 12, align: 'right', sum: 'money' }],
        rows: d.items.map((i: any, n: number) => ({ n: i.lineNo || n + 1, item: `${i.product?.name || 'Item'}${i.product?.sku ? ` (${i.product.sku})` : ''}`, hsn: i.product?.hsnCode, qty: `${qty(i.quantity)} ${i.product?.uom || ''}`.trim(), by: day(i.requiredDeliveryDate || d.deliveryDate), rate: num(i.listPrice ?? i.unitPrice), disc: i.discountPercent ? `${Math.round(i.discountPercent * 100) / 100}%` : '', tv: num(t.items[n].goodsValue), gst: `${t.items[n].gstRate}%`, amt: num(t.items[n].totalAmount) })),
        totals: isExport ? [...(t.charges.length ? [['Goods value', rs(t.goodsTotal)] as [string, string], ...t.charges.map((c: any) => [c.label, rs(c.amount)] as [string, string])] : []), ['Order value', rs(t.subTotal)], ['GST', 'Not charged (export)'], ['Total', rs(t.subTotal), true]] : gstTotals(t),
        notes: [{ label: 'Amount in words', text: amountInWords(t.totalAmount) }, { label: 'Terms', text: d.terms }],
        signatures: ['Prepared by', 'Authorised signatory', 'Customer acceptance'],
      };
    },
  },

  quotation: {
    label: 'Quotation', roles: ['ADMIN', 'MANAGER', 'SALES', 'FINANCE_MANAGER', 'VIEWER', 'STAFF'],
    async load(id) {
      const d: any = await Quotation.findOne(mongoose.isValidObjectId(id) ? { _id: id } : { quoteNumber: id }).populate('customer').populate('items.product', 'name sku uom hsnCode gstRate').lean();
      if (!d) return null;
      const c = d.customer && typeof d.customer === 'object' ? d.customer : {};
      const isExport = d.orderType === 'EXPORT';
      const tax = d.taxSummary; // GST as worked out and saved on the quotation
      const rate = (i: any) => (isExport ? 0 : i.product?.gstRate);
      const anyDisc = d.items.some((i: any) => i.discountPercent);
      const charges: any[] = d.charges || [];
      const revision = (d.revision || 1) > 1 ? ` Rev-${String(d.revision).padStart(2, '0')}` : '';
      return {
        title: 'QUOTATION', numberLabel: 'Quotation No.', number: d.quoteNumber + revision,
        meta: [['Date', day(d.updatedAt || d.createdAt)], ['Valid until', day(d.validUntil)], ['Enquiry', d.enquiryRef], ['Payment terms', d.paymentTerms], ['Place of supply', isExport ? 'Export' : placeLabel(d.placeOfSupply)]],
        parties: [{ label: 'To', name: d.customerName || c.name, lines: addressLines(c) }, ...(isExport ? [exportBox(d)] : [])],
        columns: [{ key: 'n', label: '#', width: 4, align: 'center' }, { key: 'item', label: 'Item', width: anyDisc ? 34 : 40 }, { key: 'hsn', label: 'HSN', width: 9 }, { key: 'qty', label: 'Qty', width: 10, align: 'right', sum: 'qty' }, { key: 'rate', label: 'Rate', width: 13, align: 'right' }, ...(anyDisc ? [{ key: 'disc', label: 'Disc %', width: 6, align: 'right' as const }] : []), { key: 'gst', label: 'GST %', width: 8, align: 'right' }, { key: 'amt', label: 'Amount', width: 16, align: 'right', sum: 'money' }],
        rows: d.items.map((i: any, n: number) => ({ n: n + 1, item: `${i.productName || i.product?.name || 'Item'}${i.product?.sku ? ` (${i.product.sku})` : ''}`, hsn: i.product?.hsnCode, qty: `${qty(i.quantity)} ${i.product?.uom || ''}`.trim(), rate: num(i.listPrice ?? i.unitPrice), disc: i.discountPercent ? `${Math.round(i.discountPercent * 100) / 100}%` : '', gst: rate(i) === undefined ? '' : `${rate(i)}%`, amt: num(i.totalPrice ?? i.quantity * i.unitPrice) })),
        totals: tax ? gstTotals({ goodsTotal: tax.goodsTotal ?? d.totalAmount, charges, subTotal: tax.subTotal, totalCGST: tax.totalCGST, totalSGST: tax.totalSGST, totalIGST: tax.totalIGST, totalAmount: tax.grandTotal })
          : [...(charges.length ? [['Goods value', rs(d.totalAmount - charges.reduce((s, c) => s + c.amount, 0))] as [string, string], ...charges.map(c => [c.label, rs(c.amount)] as [string, string])] : []), ['Quoted value', rs(d.totalAmount)], ['GST', isExport ? 'Not charged (export)' : 'Extra as applicable'], ['Total', rs(d.totalAmount), true]],
        notes: [{ label: 'Amount in words', text: amountInWords(tax?.grandTotal ?? d.totalAmount ?? 0) }, { label: 'Terms and conditions', text: d.terms }],
        signatures: ['For the company: authorised signatory', 'Accepted by the customer'],
      };
    },
  },

  grn: {
    label: 'GRN', roles: ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER', 'QUALITY_INSPECTOR', 'FINANCE_MANAGER', 'VIEWER', 'STAFF'],
    async load(id) {
      const d: any = await GRN.findOne(mongoose.isValidObjectId(id) ? { _id: id } : { number: id }).populate('supplier').populate('items.product', 'name sku uom hsnCode gstRate').populate('items.batch', 'batchNumber').lean();
      if (!d) return null;
      const s = d.supplier || {};
      const ck = d.checklist || {};
      const pa = (p: any) => (p ? [p.warehouse, p.zone, p.rack, p.bin].filter(Boolean).join('/') : '');
      const company: any = await CompanySettings.findOne({ key: 'company' }).select('stateCode gstin').lean();
      // value of what was received, GST from the supplier's state to ours, the same way the PO works it out
      const t = computeTax(d.items.map((i: any) => ({ description: i.product?.name || '', hsnCode: i.product?.hsnCode || '', quantity: i.receivedQty, unitPrice: i.unitPrice || 0, gstRate: Number(i.product?.gstRate ?? 0) })), stateCodeOf(s.gstin), company?.stateCode || stateCodeOf(company?.gstin));
      const yes = (b: boolean) => (b ? 'Yes' : 'No');
      return {
        title: 'GOODS RECEIPT NOTE', numberLabel: 'GRN No.', number: d.number,
        meta: [['Received on', day(d.createdAt)], ['Purchase order', d.poNumber], ['Gate entry', d.gateEntryNo], ['Vendor challan', d.vendorChallanNo], ['Vehicle', d.vehicleNo], ['Status', words(d.status)], ['Inspected by', d.inspectedBy]],
        parties: [{ label: 'Supplier', name: s.name, lines: addressLines(s) }],
        columns: [{ key: 'n', label: '#', width: 4, align: 'center' }, { key: 'item', label: 'Item', width: 27 }, { key: 'batch', label: 'Batch / expiry', width: 13 }, { key: 'ord', label: 'Ordered', width: 8, align: 'right' }, { key: 'rec', label: 'Received', width: 9, align: 'right', sum: 'qty' }, { key: 'acc', label: 'Accepted', width: 9, align: 'right', sum: 'qty' }, { key: 'rej', label: 'Rejected', width: 8, align: 'right', sum: 'qty' }, { key: 'rate', label: 'Rate', width: 9, align: 'right' }, { key: 'amt', label: 'Amount', width: 11, align: 'right', sum: 'money' }],
        rows: d.items.map((i: any, n: number) => ({
          n: n + 1,
          item: [`${i.product?.name || 'Item'}${i.product?.sku ? ` (${i.product.sku})` : ''}`, i.nonStock ? 'not stocked (expensed)' : pa(i.putAway) && `stored at ${pa(i.putAway)}`, i.inspection !== 'PENDING' && `QC: ${words(i.inspection)}`].filter(Boolean).join(' - '),
          batch: [i.batch?.batchNumber, i.supplierBatchNo && `lot ${i.supplierBatchNo}`, i.manufacturingDate && `mfg ${day(i.manufacturingDate)}`, i.expiryDate && `exp ${day(i.expiryDate)}`].filter(Boolean).join(' '),
          ord: qty(i.orderedQty), rec: `${qty(i.receivedQty)} ${i.product?.uom || ''}`.trim(), acc: i.inspection === 'PENDING' ? '' : `${qty(i.acceptedQty)} ${i.product?.uom || ''}`.trim(),
          rej: i.inspection === 'PENDING' ? '' : `${qty((i.scrapQty || 0) + (i.returnQty || 0))} ${i.product?.uom || ''}`.trim(), rate: num(i.unitPrice), amt: num(t.items[n].taxableValue),
        })),
        totals: gstTotals(t),
        notes: [{ label: 'Amount in words', text: amountInWords(t.totalAmount) }, { label: 'Checks at the gate', text: `Quantity verified: ${yes(ck.quantityVerified)}   |   Packing intact: ${yes(ck.packingIntact)}   |   Documents verified: ${yes(ck.documentsVerified)}` }],
        signatures: [`Received by ${d.createdBy || ''}`.trim(), `QC inspector ${d.inspectedBy || ''}`.trim(), 'Stores in-charge'],
      };
    },
  },
};

/** The export terms of a sales order or quotation, as a box beside the customer */
function exportBox(d: any) {
  return { label: 'Export', lines: [[d.incoterm, d.portOfLoading && `from ${d.portOfLoading}`, d.portOfDischarge && `to ${d.portOfDischarge}`].filter(Boolean).join(' '), [d.country, d.currency, d.exchangeRate && `@ ${d.exchangeRate}`].filter(Boolean).join(' ')] };
}

/** Bill of materials as found by the BOM route (by BOM id or product id) */
export function bomSpec(bom: any, product: any): PrintSpec {
  return {
    title: 'BILL OF MATERIALS', numberLabel: 'Item / Version', number: `${product?.sku || product?.name || 'BOM'} v${bom.version || 1}`,
    meta: [['Product', product?.name], ['Item code', product?.sku], ['Version', `${bom.version}${bom.isDefault ? ' (default)' : ''}`], ['Makes', `${qty(bom.baseQuantity || 1)} ${product?.uom || ''}`.trim()], ['Status', words(bom.status)], ['Approved / active', [bom.activatedBy, day(bom.activatedAt)].filter(Boolean).join(', ')], ['Updated', day(bom.updatedAt || bom.createdAt)]],
    columns: [{ key: 'n', label: '#', width: 5, align: 'center' }, { key: 'item', label: 'Component', width: 40 }, { key: 'sku', label: 'Code', width: 15 }, { key: 'qty', label: `Qty for ${qty(bom.baseQuantity || 1)} ${product?.uom || ''}`.trim(), width: 14, align: 'right' }, { key: 'uom', label: 'Unit', width: 10 }, { key: 'w', label: 'Wastage', width: 10, align: 'right' }],
    rows: (bom.components || []).map((c: any, n: number) => ({ n: n + 1, item: c.product?.name || 'Component', sku: c.product?.sku, qty: qty(c.quantity), uom: c.unit || c.product?.uom, w: c.wastagePercentage ? `${c.wastagePercentage}%` : '' })),
    emptyText: 'No components on this bill of materials.',
    tables: [...((bom.outputs || []).length ? [{
      title: 'Scrap and by-products (expected)', columns: [{ key: 'item', label: 'Item', width: 45 }, { key: 'sku', label: 'Code', width: 15 }, { key: 'k', label: 'Type', width: 14 }, { key: 'qty', label: 'Expected', width: 14, align: 'right' as const }, { key: 'uom', label: 'Unit', width: 12 }],
      rows: bom.outputs.map((o: any) => ({ item: o.product?.name || 'Item', sku: o.product?.sku, k: o.kind === 'SCRAP' ? 'Scrap' : 'By-product', qty: qty(o.quantity), uom: o.unit })),
    }] : []), {
      title: 'Routing', columns: [{ key: 's', label: 'Step', width: 8, align: 'center' }, { key: 'd', label: 'Operation', width: 52 }, { key: 'm', label: 'Machine', width: 25 }, { key: 't', label: 'Minutes', width: 15, align: 'right' }],
      rows: (bom.routingSteps || []).map((r: any) => ({ s: r.stepNumber, d: r.description, m: r.machineType, t: qty(r.estimatedTimeMinutes) })),
    }],
    signatures: ['Prepared by (Engineering)', 'Checked by', 'Approved by'],
  };
}

/** Shop-floor job card, from the job card the job card route puts together for a work order */
export function jobCardSpec(c: any): PrintSpec {
  const stages = (c.stages || []).map((s: any) => ({ s: s.seq, d: s.name, i: s.inQty ? qty(s.inQty) : '', g: s.good ? qty(s.good) : '', x: s.scrap ? qty(s.scrap) : '', op: '', sign: '' }));
  return {
    title: 'JOB CARD', numberLabel: 'Work Order No.', number: c.woNumber,
    meta: [['Status', words(c.status)], ['Priority', words(c.priority)], ['Demand', c.demandType], ['Planned', [day(c.plannedStartDate), day(c.plannedEndDate)].filter(Boolean).join(' to ')], ['Line / machine', c.machine?.name], ['For order', c.salesOrder ? `${c.salesOrder.soNumber} ${c.salesOrder.customerName || ''}` : 'Make to stock']],
    parties: [{ label: 'To make', name: `${qty(c.quantity)} ${c.product?.uom || ''} x ${c.product?.name || 'Item'}`, lines: [c.product?.sku && `Item code ${c.product.sku}`] }],
    columns: [{ key: 'item', label: 'Material to draw', width: 34 }, { key: 'per', label: 'Per unit', width: 11, align: 'right' }, { key: 'req', label: 'Required', width: 13, align: 'right' }, { key: 'res', label: 'Reserved', width: 11, align: 'right' }, { key: 'iss', label: 'Issued', width: 11, align: 'right' }, { key: 'sign', label: 'Store sign', width: 20 }],
    rows: (c.materials || []).map((m: any) => ({ item: `${m.product}${m.sku ? ` (${m.sku})` : ''}`, per: `${qty(m.perUnit)}${m.wastagePercentage ? ` +${m.wastagePercentage}%` : ''}`, req: `${qty(m.required)} ${m.uom || ''}`.trim(), res: qty(m.reserved), iss: qty(m.issued), sign: '' })),
    emptyText: 'No bill of materials linked to this work order.',
    tables: [...((c.otherOutputs || []).length ? [{
      title: 'Scrap and by-products', columns: [{ key: 'item', label: 'Item', width: 40 }, { key: 'k', label: 'Type', width: 14 }, { key: 'e', label: 'Expected', width: 16, align: 'right' as const }, { key: 'a', label: 'Actual', width: 16, align: 'right' as const }, { key: 'sign', label: 'Sign', width: 14 }],
      rows: c.otherOutputs.map((o: any) => ({ item: `${o.product}${o.sku ? ` (${o.sku})` : ''}`, k: o.kind === 'SCRAP' ? 'Scrap' : 'By-product', e: `${qty(o.expected)} ${o.uom || ''}`.trim(), a: o.actual === null || o.actual === undefined ? '' : `${qty(o.actual)} ${o.uom || ''}`.trim(), sign: '' })),
    }] : []), {
      title: 'Routing and output', columns: [{ key: 's', label: 'Stage', width: 7, align: 'center' }, { key: 'd', label: 'Operation', width: 33 }, { key: 'i', label: 'Input', width: 10, align: 'right' }, { key: 'g', label: 'Good', width: 10, align: 'right' }, { key: 'x', label: 'Scrap', width: 10, align: 'right' }, { key: 'op', label: 'Operator', width: 15 }, { key: 'sign', label: 'Sign', width: 15 }],
      rows: stages,
    }],
    signatures: ['Production supervisor', 'Quality inspector', 'Store keeper'],
  };
}
