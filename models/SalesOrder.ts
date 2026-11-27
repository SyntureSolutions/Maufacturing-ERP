import mongoose, { Schema, Document } from 'mongoose';
import { lineNumbersHook } from '@/lib/lineNumbers';

export interface ISalesOrder extends Document {
  soNumber: string;
  customer?: mongoose.Types.ObjectId;
  customerName?: string;
  quotationRef?: string;
  quotation?: mongoose.Types.ObjectId; // the quotation that was won
  poNumber?: string;
  items: {
    lineNo?: number; // 10, 20, 30...
    requiredDeliveryDate?: Date; // the customer's date for this line, if it differs; the order's deliveryDate is the earliest such date
    _id?: mongoose.Types.ObjectId;
    product: mongoose.Types.ObjectId;
    quantity: number;
    unitPrice: number;          // net rate
    listPrice?: number;         // rate before the line discount
    discountPercent?: number;
    totalPrice: number;
    dispatchedQty?: number; // covered by delivery challans so far
    invoicedQty?: number;   // covered by tax invoices so far
  }[];
  taxes?: {
    taxType: string;
    amount: number;
  }[];
  discounts?: number;
  charges?: { label: string; amount: number }[];
  totalAmount: number; // lines plus charges, before GST
  paymentTerms?: string;
  priceLocked?: boolean;
  approvalPending?: boolean;
  lockedAt?: Date;
  priceOverrides?: { by: string; reason: string; at: Date; changes: string[] }[];
  orderType?: 'DOMESTIC' | 'EXPORT';
  currency?: string;
  exchangeRate?: number;
  incoterm?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  country?: string;
  terms?: string;
  deliveryDate?: Date;
  status: 'DRAFT' | 'APPROVED' | 'IN_FULFILLMENT' | 'FULFILLED' | 'CANCELLED' | 'ON_HOLD';
  hold?: { fromStatus: string; reason: string; by: string; role: string; at: Date }; // set while ON_HOLD; release returns to fromStatus
  holdHistory?: { action: 'HOLD' | 'RELEASE'; reason?: string; by: string; role: string; at: Date }[];
  mspOverride?: { by: string; role: string; reason: string; at: Date; lines: number[] }; // approved below minimum selling price
  creditCheckPassed?: boolean;
  proformaNumber?: string;
  proformaIssuedAt?: Date;
  taxInvoiceStatus?: 'UNINVOICED' | 'REQUESTED' | 'PARTIAL' | 'INVOICED';
  taxInvoiceNumber?: string;
  taxInvoiceId?: mongoose.Types.ObjectId;
  allocatedBatches?: {
    batch: mongoose.Types.ObjectId;
    product: mongoose.Types.ObjectId;
    quantity: number;
  }[];
  invoices?: mongoose.Types.ObjectId[];
  allocationShortfall?: { product: mongoose.Types.ObjectId; quantity: number }[]; // what could not be reserved at approval
  createdAt: Date;
  updatedAt: Date;
}

const SalesOrderSchema = new Schema<ISalesOrder>(
  {
    soNumber: { type: String, required: true, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    customerName: { type: String },
    quotationRef: { type: String },
    quotation: { type: Schema.Types.ObjectId, ref: 'Quotation' },
    poNumber: { type: String },
    items: [
      {
        lineNo: { type: Number, min: 1 },
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        quantity: { type: Number, required: true },
        requiredDeliveryDate: { type: Date },
        unitPrice: { type: Number, required: true },
        listPrice: { type: Number, min: 0 },
        discountPercent: { type: Number, min: 0, max: 99.99 },
        totalPrice: { type: Number, required: true },
        dispatchedQty: { type: Number, default: 0, min: 0 },
        invoicedQty: { type: Number, default: 0, min: 0 },
      },
    ],
    taxes: [
      {
        taxType: { type: String },
        amount: { type: Number },
      },
    ],
    discounts: { type: Number, default: 0 },
    charges: [{ label: { type: String, required: true }, amount: { type: Number, required: true, min: 0 }, _id: false }], // freight, packing & forwarding... before GST
    totalAmount: { type: Number, required: true },
    paymentTerms: { type: String },
    priceLocked: { type: Boolean, default: false },
    approvalPending: { type: Boolean, default: false },
    lockedAt: { type: Date },
    priceOverrides: [{ by: String, reason: String, at: Date, changes: [String], _id: false }],
    orderType: { type: String, enum: ['DOMESTIC', 'EXPORT'], default: 'DOMESTIC' },
    currency: { type: String, default: 'INR' },
    exchangeRate: { type: Number },
    incoterm: { type: String },
    portOfLoading: { type: String },
    portOfDischarge: { type: String },
    country: { type: String },
    terms: { type: String },
    deliveryDate: { type: Date },
    status: {
      type: String,
      enum: ['DRAFT', 'APPROVED', 'IN_FULFILLMENT', 'FULFILLED', 'CANCELLED', 'ON_HOLD'],
      default: 'DRAFT',
    },
    hold: { fromStatus: String, reason: String, by: String, role: String, at: Date },
    holdHistory: [{ action: { type: String, enum: ['HOLD', 'RELEASE'] }, reason: String, by: String, role: String, at: Date, _id: false }],
    mspOverride: { by: String, role: String, reason: String, at: Date, lines: [Number] },
    creditCheckPassed: { type: Boolean, default: false },
    proformaNumber: { type: String },
    proformaIssuedAt: { type: Date },
    taxInvoiceStatus: {
      type: String,
      enum: ['UNINVOICED', 'REQUESTED', 'PARTIAL', 'INVOICED'],
      default: 'UNINVOICED',
    },
    taxInvoiceNumber: { type: String },
    taxInvoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    allocatedBatches: [
      {
        batch: { type: Schema.Types.ObjectId, ref: 'Batch' },
        product: { type: Schema.Types.ObjectId, ref: 'Product' },
        quantity: { type: Number },
      },
    ],
    invoices: [{ type: Schema.Types.ObjectId, ref: 'Invoice' }],
    allocationShortfall: [{ product: { type: Schema.Types.ObjectId, ref: 'Product' }, quantity: Number, _id: false }],
  },
  { timestamps: true }
);

SalesOrderSchema.pre('validate', function () {
  lineNumbersHook.call(this);
  const dates = (this.items || []).map((i: any) => i.requiredDeliveryDate).filter(Boolean).map((d: Date) => new Date(d).getTime());
  // The order is due when its first dated line is due. A line with no date of its own is due with the order (see lineDueDate).
  if (dates.length) this.deliveryDate = new Date(Math.min(...dates));
});

export default mongoose.models.SalesOrder || mongoose.model<ISalesOrder>('SalesOrder', SalesOrderSchema);
