import mongoose from 'mongoose';
import Enquiry from '@/models/Enquiry';
import Quotation from '@/models/Quotation';
import SalesOrder from '@/models/SalesOrder';
import WorkOrder from '@/models/WorkOrder';
import DeliveryChallan from '@/models/DeliveryChallan';
import Invoice from '@/models/Invoice';
import PurchaseIndent from '@/models/PurchaseIndent';
import RFQ from '@/models/RFQ';
import PurchaseOrder from '@/models/PurchaseOrder';
import GRN from '@/models/GRN';
import MRPRun from '@/models/MRPRun';
import Voucher from '@/models/Voucher';
import BillOfEntry from '@/models/BillOfEntry';
import { HttpError } from '@/lib/httpError';

export const LINEAGE_TYPES = ['ENQUIRY', 'QUOTATION', 'SALES_ORDER', 'WORK_ORDER', 'DELIVERY_CHALLAN', 'INVOICE', 'RECEIPT', 'MRP_RUN', 'PURCHASE_INDENT', 'RFQ', 'PURCHASE_ORDER', 'GRN', 'VENDOR_BILL', 'PAYMENT', 'BILL_OF_ENTRY'] as const;
export type LineageType = (typeof LINEAGE_TYPES)[number];

/** Nodes that show money posted to the books; only finance-view roles see them */
export const MONEY_TYPES: LineageType[] = ['INVOICE', 'RECEIPT', 'VENDOR_BILL', 'PAYMENT', 'BILL_OF_ENTRY'];

export interface LineageNode { key: string; type: LineageType; id: string; number: string; status?: string; date?: string; amount?: number; page: string }
export interface Lineage { root: string; nodes: LineageNode[]; edges: { from: string; to: string }[]; truncated: boolean }

const MODELS: Record<LineageType, any> = {
  ENQUIRY: Enquiry, QUOTATION: Quotation, SALES_ORDER: SalesOrder, WORK_ORDER: WorkOrder, DELIVERY_CHALLAN: DeliveryChallan, INVOICE: Invoice, RECEIPT: Voucher,
  MRP_RUN: MRPRun, PURCHASE_INDENT: PurchaseIndent, RFQ, PURCHASE_ORDER: PurchaseOrder, GRN, VENDOR_BILL: Invoice, PAYMENT: Voucher, BILL_OF_ENTRY: BillOfEntry,
};
const NUMBER_FIELD: Record<LineageType, string> = {
  ENQUIRY: 'enquiryNumber', QUOTATION: 'quoteNumber', SALES_ORDER: 'soNumber', WORK_ORDER: 'woNumber', DELIVERY_CHALLAN: 'number', INVOICE: 'invoiceNumber', RECEIPT: 'number',
  MRP_RUN: '_id', PURCHASE_INDENT: 'number', RFQ: 'number', PURCHASE_ORDER: 'poNumber', GRN: 'number', VENDOR_BILL: 'invoiceNumber', PAYMENT: 'number', BILL_OF_ENTRY: 'number',
};
const STATUS_FIELD: Partial<Record<LineageType, string>> = { QUOTATION: 'stage' };
// a page ending in ?id= is a document screen and opens the document itself
const PAGE: Record<LineageType, string> = {
  ENQUIRY: '/dashboard/sales', QUOTATION: '/dashboard/transactions/quotation?id=', SALES_ORDER: '/dashboard/transactions/sales-order?id=', WORK_ORDER: '/dashboard/production', DELIVERY_CHALLAN: '/dashboard/dispatch',
  INVOICE: '/dashboard/dispatch', RECEIPT: '/dashboard/vouchers', MRP_RUN: '/dashboard/mrp', PURCHASE_INDENT: '/dashboard/procurement', RFQ: '/dashboard/procurement',
  PURCHASE_ORDER: '/dashboard/transactions/purchase-order?id=', GRN: '/dashboard/transactions/grn?id=', VENDOR_BILL: '/dashboard/vendor-bills', PAYMENT: '/dashboard/vouchers', BILL_OF_ENTRY: '/dashboard/bill-of-entry',
};
const AMOUNT_FIELD: Partial<Record<LineageType, string>> = { SALES_ORDER: 'totalAmount', QUOTATION: 'totalAmount', PURCHASE_ORDER: 'totalAmount', INVOICE: 'totalAmount', VENDOR_BILL: 'totalAmount', RECEIPT: 'amount', PAYMENT: 'amount', BILL_OF_ENTRY: 'totalPaid' };

type Ref = { type: LineageType; doc: any };
const ref = (type: LineageType, docs: any[]): Ref[] => docs.map(doc => ({ type, doc }));
const keyOf = (r: Ref) => `${r.type}:${r.doc._id}`;
/** Finds documents matching any of the conditions; with no conditions it finds nothing (an empty $or would match everything) */
/** Finds documents by id; with no id it finds nothing (a filter on an undefined value can match everything) */
const byId = async (Model: any, id: any, extra: any = {}) => (id ? Model.find({ _id: id, ...extra }).lean() : []);
const anyOf = async (Model: any, conds: any[], extra: any = {}) => (conds.length ? Model.find({ $or: conds, ...extra }).lean() : []);

/** Documents one step up the chain (what this document came from) */
async function parentsOf(n: Ref): Promise<Ref[]> {
  const d = n.doc;
  switch (n.type) {
    case 'QUOTATION': return ref('ENQUIRY', await anyOf(Enquiry, [...(d.enquiry ? [{ _id: d.enquiry }] : []), ...(d.enquiryRef ? [{ enquiryNumber: d.enquiryRef }] : [])]));
    case 'SALES_ORDER': return ref('QUOTATION', await anyOf(Quotation, [...(d.quotation ? [{ _id: d.quotation }] : []), ...(d.quotationRef ? [{ quoteNumber: d.quotationRef }] : [])]));
    case 'WORK_ORDER': {
      if (d.parentWorkOrder) return ref('WORK_ORDER', await byId(WorkOrder, d.parentWorkOrder));
      return ref('SALES_ORDER', await anyOf(SalesOrder, [...(d.salesOrder ? [{ _id: d.salesOrder }] : []), ...(d.salesOrderRef ? [{ soNumber: d.salesOrderRef }] : [])]));
    }
    case 'DELIVERY_CHALLAN': return ref('SALES_ORDER', await byId(SalesOrder, d.salesOrder));
    case 'INVOICE': {
      const dcs = await anyOf(DeliveryChallan, [...(d.deliveryChallan ? [{ _id: d.deliveryChallan }] : []), ...(d.dcRef ? [{ number: d.dcRef }] : [])]);
      if (dcs.length) return ref('DELIVERY_CHALLAN', dcs);
      return ref('SALES_ORDER', await anyOf(SalesOrder, [...(d.salesOrder ? [{ _id: d.salesOrder }] : []), ...(d.soNumber ? [{ soNumber: d.soNumber }] : [])]));
    }
    case 'RECEIPT': return d.refDoc?.number ? ref('INVOICE', await Invoice.find({ type: 'SALES', invoiceNumber: d.refDoc.number }).lean()) : [];
    case 'PURCHASE_INDENT': {
      if (d.salesOrder) return ref('SALES_ORDER', await byId(SalesOrder, d.salesOrder));
      return ref('MRP_RUN', await byId(MRPRun, d.mrpRun));
    }
    case 'RFQ': return ref('PURCHASE_INDENT', await PurchaseIndent.find({ _id: { $in: d.indents || [] } }).lean());
    case 'PURCHASE_ORDER': {
      const rfqs = await RFQ.find({ purchaseOrder: d._id }).lean();
      if (rfqs.length) return ref('RFQ', rfqs);
      // a PO raised by hand from requisition lines hangs under those requisitions
      const indentIds = [...new Set((d.items || []).flatMap((i: any) => (i.sources || []).map((s: any) => String(s.indent))))];
      if (indentIds.length) return ref('PURCHASE_INDENT', await PurchaseIndent.find({ _id: { $in: indentIds } }).lean());
      return ref('SALES_ORDER', await byId(SalesOrder, d.salesOrder));
    }
    case 'GRN': return ref('PURCHASE_ORDER', await byId(PurchaseOrder, d.po));
    case 'VENDOR_BILL': return ref('PURCHASE_ORDER', await byId(PurchaseOrder, d.order));
    case 'BILL_OF_ENTRY': return ref('GRN', await byId(GRN, d.grn));
    case 'PAYMENT': return d.refDoc?.number ? ref('VENDOR_BILL', await Invoice.find({ type: 'PURCHASE', invoiceNumber: d.refDoc.number }).lean()) : [];
    default: return [];
  }
}

/** Documents one step down the chain (what this document led to) */
async function childrenOf(n: Ref): Promise<Ref[]> {
  const d = n.doc;
  switch (n.type) {
    case 'ENQUIRY': return ref('QUOTATION', await Quotation.find({ $or: [{ enquiry: d._id }, { enquiryRef: d.enquiryNumber }] }).lean());
    case 'QUOTATION': return ref('SALES_ORDER', await SalesOrder.find({ $or: [{ quotation: d._id }, { quotationRef: d.quoteNumber }] }).lean());
    case 'SALES_ORDER': {
      const out: Ref[] = [];
      out.push(...ref('WORK_ORDER', await WorkOrder.find({ parentWorkOrder: { $exists: false }, $or: [{ salesOrder: d._id }, { salesOrderRef: d.soNumber }] }).lean()));
      out.push(...ref('DELIVERY_CHALLAN', await DeliveryChallan.find({ salesOrder: d._id }).lean()));
      // an invoice raised from a challan hangs under the challan, not directly under the order
      const challanNumbers = (await DeliveryChallan.find({ salesOrder: d._id }).select('number').lean()).map((c: any) => c.number);
      out.push(...ref('INVOICE', await Invoice.find({ type: 'SALES', salesOrder: d._id, deliveryChallan: { $exists: false }, dcRef: { $nin: challanNumbers } }).lean()));
      out.push(...ref('PURCHASE_INDENT', await PurchaseIndent.find({ salesOrder: d._id }).lean()));
      // a PO bought through an RFQ hangs under the RFQ
      const pos: any[] = await PurchaseOrder.find({ salesOrder: d._id }).lean();
      const viaRfq = new Set((await RFQ.find({ purchaseOrder: { $in: pos.map(p => p._id) } }).select('purchaseOrder').lean()).map((r: any) => String(r.purchaseOrder)));
      out.push(...ref('PURCHASE_ORDER', pos.filter(p => !viaRfq.has(String(p._id)))));
      return out;
    }
    case 'WORK_ORDER': return ref('WORK_ORDER', await WorkOrder.find({ parentWorkOrder: d._id }).lean());
    case 'DELIVERY_CHALLAN': return ref('INVOICE', await Invoice.find({ type: 'SALES', $or: [{ deliveryChallan: d._id }, { dcRef: d.number }] }).lean());
    case 'INVOICE': return ref('RECEIPT', await Voucher.find({ status: 'POSTED', type: { $in: ['BANK_RECEIPT', 'CASH_RECEIPT'] }, 'refDoc.kind': 'INVOICE', 'refDoc.number': d.invoiceNumber }).lean());
    case 'MRP_RUN': return ref('PURCHASE_INDENT', await PurchaseIndent.find({ mrpRun: d._id, salesOrder: { $exists: false } }).lean());
    case 'PURCHASE_INDENT': {
      const rfqs: any[] = await anyOf(RFQ, [...(d.rfq ? [{ _id: d.rfq }] : []), { indents: d._id }]);
      // POs that order its lines directly; one created by an RFQ award hangs under the RFQ instead
      const viaRfq = new Set(rfqs.filter(r => r.purchaseOrder).map(r => String(r.purchaseOrder)));
      const pos: any[] = await PurchaseOrder.find({ 'items.sources.indent': d._id }).lean();
      return [...ref('RFQ', rfqs), ...ref('PURCHASE_ORDER', pos.filter(p => !viaRfq.has(String(p._id))))];
    }
    case 'RFQ': return d.purchaseOrder ? ref('PURCHASE_ORDER', await PurchaseOrder.find({ _id: d.purchaseOrder }).lean()) : [];
    case 'PURCHASE_ORDER': return [
      ...ref('GRN', await GRN.find({ po: d._id }).lean()),
      ...ref('VENDOR_BILL', await Invoice.find({ type: 'PURCHASE', status: { $ne: 'CANCELLED' }, order: d._id }).lean()),
    ];
    case 'GRN': return ref('BILL_OF_ENTRY', await BillOfEntry.find({ grn: d._id, status: 'POSTED' }).lean());
    case 'VENDOR_BILL': return ref('PAYMENT', await Voucher.find({ status: 'POSTED', type: { $in: ['BANK_PAYMENT', 'CASH_PAYMENT'] }, 'refDoc.kind': 'INVOICE', 'refDoc.number': d.invoiceNumber }).lean());
    default: return [];
  }
}

const toNode = (r: Ref, finance: boolean): LineageNode => {
  const d = r.doc, amountField = AMOUNT_FIELD[r.type];
  return {
    key: keyOf(r), type: r.type, id: String(d._id),
    number: r.type === 'MRP_RUN' ? `MRP run ${d.createdAt ? new Date(d.createdAt).toISOString().slice(0, 10) : String(d._id).slice(-6)}` : String(d[NUMBER_FIELD[r.type]] ?? ''),
    status: d[STATUS_FIELD[r.type] || 'status'],
    date: (d.date || d.orderDate || d.createdAt)?.toISOString?.(),
    ...(finance && amountField && typeof d[amountField] === 'number' ? { amount: d[amountField] } : {}),
    page: PAGE[r.type].endsWith('?id=') ? `${PAGE[r.type]}${d._id}` : PAGE[r.type],
  };
};

/** Finds one document by id, or by its document number */
export async function findDocument(type: LineageType, idOrNumber: string): Promise<Ref> {
  if (!LINEAGE_TYPES.includes(type)) throw new HttpError(400, 'Unknown document type.');
  const Model = MODELS[type];
  const extra = type === 'VENDOR_BILL' ? { type: 'PURCHASE' } : type === 'INVOICE' ? { type: 'SALES' } : type === 'RECEIPT' ? { type: { $in: ['BANK_RECEIPT', 'CASH_RECEIPT'] } } : type === 'PAYMENT' ? { type: { $in: ['BANK_PAYMENT', 'CASH_PAYMENT'] } } : {};
  const byId = mongoose.Types.ObjectId.isValid(idOrNumber) ? await Model.findOne({ _id: idOrNumber, ...extra }).lean() : null;
  const doc = byId || (type === 'MRP_RUN' ? null : await Model.findOne({ [NUMBER_FIELD[type]]: idOrNumber, ...extra }).lean());
  if (!doc) throw new HttpError(404, 'Document not found.');
  return { type, doc };
}

/**
 * The connected chain around one document: everything it came from (all the way up) and everything it led to (all the way down).
 * Money documents (invoices, receipts, vendor bills, payments) are left out unless `finance` is true.
 */
export async function buildLineage(start: Ref, finance: boolean, limit = 300): Promise<Lineage> {
  const nodes = new Map<string, Ref>([[keyOf(start), start]]);
  const edges = new Map<string, { from: string; to: string }>();
  let truncated = false;
  const visible = (r: Ref) => finance || !MONEY_TYPES.includes(r.type);

  const walk = async (from: Ref, step: (n: Ref) => Promise<Ref[]>, up: boolean) => {
    const queue = [from], seen = new Set<string>([keyOf(from)]);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const next of await step(cur)) {
        if (!visible(next)) continue;
        const k = keyOf(next);
        edges.set(up ? `${k}>${keyOf(cur)}` : `${keyOf(cur)}>${k}`, up ? { from: k, to: keyOf(cur) } : { from: keyOf(cur), to: k });
        if (seen.has(k)) continue;
        seen.add(k);
        if (nodes.size >= limit) { truncated = true; continue; }
        nodes.set(k, next); queue.push(next);
      }
    }
  };
  await walk(start, parentsOf, true);
  await walk(start, childrenOf, false);

  return { root: keyOf(start), nodes: [...nodes.values()].map(r => toNode(r, finance)), edges: [...edges.values()].filter(e => nodes.has(e.from) && nodes.has(e.to)), truncated };
}
