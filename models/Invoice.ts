import mongoose, { Schema, Document } from 'mongoose';

export interface IInvoice extends Document {
  invoiceNumber: string;
  type: 'SALES' | 'PURCHASE';
  customer?: mongoose.Types.ObjectId;
  supplier?: mongoose.Types.ObjectId;
  order?: mongoose.Types.ObjectId; // Ref to Order or PurchaseOrder
  salesOrder?: mongoose.Types.ObjectId;
  soNumber?: string;
  quotationRef?: string;
  proformaRef?: string;
  issuedByRole?: string;
  date: Date;
  dueDate: Date;
  items: {
    product?: mongoose.Types.ObjectId;
    description?: string;
    hsnCode?: string;
    quantity: number;
    returnedQty?: number; // vendor bills: units sent back and credited
    unitPrice: number;
    taxableValue: number;
    cgstRate?: number;
    cgstAmount?: number;
    sgstRate?: number;
    sgstAmount?: number;
    igstRate?: number;
    igstAmount?: number;
    totalAmount: number;
  }[];
  charges?: { label: string; amount: number }[];
  goodsTotal?: number;
  tcs?: { goods: string; rate: number; base: number; amount: number }[];
  tcsAmount?: number;
  subTotal: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  totalAmount: number;
  amountPaid: number;
  status: 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  
  // Compliance / E-Invoicing (India specific)
  irn?: string; // Invoice Reference Number
  ackNo?: string;
  ackDate?: Date;
  ewayBillNumber?: string;
  ewayBillValidUpto?: Date;
  placeOfSupply?: string;
  reverseCharge: boolean;
  creditedAmount?: number;
  vendorBillNumber?: string;
  poNumber?: string;
  appliedVouchers?: string[];
  dcRef?: string;
  grnRefs?: string[]; // goods receipts (by number) a vendor bill covers
  deliveryChallan?: mongoose.Types.ObjectId; // challan this tax invoice was raised from
  parties?: any;
  hsnSummary?: any[];
  einvoiceStatus?: 'NOT_GENERATED' | 'JSON_GENERATED' | 'REGISTERED';
  irnHash?: string;
  signedQr?: string;
  ewayStatus?: 'NOT_GENERATED' | 'JSON_GENERATED' | 'GENERATED';
  ewayValidUpto?: Date;
  transport?: { mode?: string; distanceKm?: number; transporterName?: string; transporterId?: string; docNo?: string; vehicleNo?: string };
  
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    type: { type: String, enum: ['SALES', 'PURCHASE'], required: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    order: { type: Schema.Types.ObjectId },
    salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
    soNumber: { type: String },
    quotationRef: { type: String },
    proformaRef: { type: String },
    issuedByRole: { type: String },
    date: { type: Date, required: true, default: Date.now },
    dueDate: { type: Date, required: true },
    items: [
      {
        product: { type: Schema.Types.ObjectId, ref: 'Product' }, // absent on service invoices (job work)
        description: { type: String },
        hsnCode: { type: String },
        quantity: { type: Number, required: true },
        returnedQty: { type: Number, default: 0 },
        unitPrice: { type: Number, required: true },
        listPrice: { type: Number },
        discountPercent: { type: Number },
        chargeShare: { type: Number }, // this line's part of the charges, inside its taxable value
        taxableValue: { type: Number, required: true },
        cgstRate: { type: Number, default: 0 },
        cgstAmount: { type: Number, default: 0 },
        sgstRate: { type: Number, default: 0 },
        sgstAmount: { type: Number, default: 0 },
        igstRate: { type: Number, default: 0 },
        igstAmount: { type: Number, default: 0 },
        totalAmount: { type: Number, required: true },
      },
    ],
    charges: [{ label: { type: String, required: true }, amount: { type: Number, required: true, min: 0 }, _id: false }], // freight, packing & forwarding... before GST
    goodsTotal: { type: Number },
    tcs: [{ goods: String, rate: Number, base: Number, amount: Number, _id: false }], // TCS u/s 206C(1), in totalAmount
    tcsAmount: { type: Number, default: 0 },
    subTotal: { type: Number, required: true },
    totalCGST: { type: Number, default: 0 },
    totalSGST: { type: Number, default: 0 },
    totalIGST: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    status: { type: String, enum: ['DRAFT', 'ISSUED', 'PARTIAL', 'PAID', 'CANCELLED'], default: 'DRAFT' },
    
    // E-Invoicing & E-Way Bill
    irn: { type: String },
    ackNo: { type: String },
    ackDate: { type: Date },
    ewayBillNumber: { type: String },
    ewayBillValidUpto: { type: Date },
    placeOfSupply: { type: String },
    reverseCharge: { type: Boolean, default: false },
    creditedAmount: { type: Number, default: 0 },
    vendorBillNumber: String, // the number printed on the supplier's own bill (purchase side)
    poNumber: String,
    appliedVouchers: [String], // vouchers already settled against this invoice (makes settlement idempotent)
    dcRef: String,
    grnRefs: [String],
    deliveryChallan: { type: Schema.Types.ObjectId, ref: 'DeliveryChallan', index: true },
    parties: Schema.Types.Mixed,
    hsnSummary: [Schema.Types.Mixed],
    einvoiceStatus: { type: String, enum: ['NOT_GENERATED', 'JSON_GENERATED', 'REGISTERED'], default: 'NOT_GENERATED' },
    irnHash: String,
    signedQr: String,
    ewayStatus: { type: String, enum: ['NOT_GENERATED', 'JSON_GENERATED', 'GENERATED'], default: 'NOT_GENERATED' },
    ewayValidUpto: Date,
    transport: { mode: String, distanceKm: Number, transporterName: String, transporterId: String, docNo: String, vehicleNo: String },
  },
  { timestamps: true }
);

// the same supplier cannot bill us twice under one bill number
InvoiceSchema.index({ supplier: 1, vendorBillNumber: 1 }, { unique: true, partialFilterExpression: { vendorBillNumber: { $type: 'string' } } });

export default mongoose.models.Invoice || mongoose.model<IInvoice>('Invoice', InvoiceSchema);
