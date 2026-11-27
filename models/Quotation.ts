import mongoose, { Schema, Document } from 'mongoose';

export interface IQuotationItem {
  product?: mongoose.Types.ObjectId;
  productName: string;
  quantity: number;
  unitPrice: number;          // net rate
  listPrice?: number;         // rate before an approved discount
  discountPercent?: number;
  totalPrice: number;
}

export type QuotationStage = 
  | 'ENQUIRY_RECEIVED' 
  | 'QUOTATION_SENT' 
  | 'UNDER_REVIEW' 
  | 'PO_RECEIVED' 
  | 'LOST_DECLINED';

export interface IQuotation extends Document {
  quoteNumber: string;
  enquiryRef?: string;
  enquiry?: mongoose.Types.ObjectId; // the enquiry this quotation came from
  customer?: mongoose.Types.ObjectId;
  customerName: string;
  items: IQuotationItem[];
  charges?: { label: string; amount: number }[];
  totalAmount: number;   // lines plus charges, before GST
  paymentTerms?: string;
  validUntil?: Date;
  stage: QuotationStage;
  creditCheckPassed?: boolean;
  creditCheckNotes?: string;
  lossReason?: string;
  revision: number;
  revisions: { rev: number; items: any[]; charges?: any[]; totalAmount: number; paymentTerms?: string; validUntil?: Date; terms?: string; taxSummary?: any; note?: string; changedBy?: string; at: Date }[];
  terms?: string;
  placeOfSupply?: string;
  taxSummary?: { subTotal: number; totalCGST: number; totalSGST: number; totalIGST: number; grandTotal: number } | null;
  orderType: 'DOMESTIC' | 'EXPORT';
  currency?: string;
  exchangeRate?: number;
  incoterm?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  country?: string;
  lossCategory?: 'COMPETITOR' | 'PRICE' | 'LEAD_TIME' | 'SPEC_MISMATCH' | 'BUDGET_CANCELLED' | 'OTHER';
  poNumber?: string;
  salesOrderRef?: string;
  proformaNumber?: string;
  proformaIssuedAt?: Date;
  // Discount asked for on this quotation and its decision; the latest entry is the current one.
  discountRequests?: { percent: number; amount: number; reason: string; requiredRole: 'SALES' | 'MANAGER' | 'ADMIN'; status: 'PENDING' | 'APPROVED' | 'REJECTED';
    requestedBy: string; requestedById?: string; requestedAt: Date; decidedBy?: string; decidedRole?: string; decidedAt?: Date; remarks?: string; appliedRevision?: number }[];
  createdAt: Date;
  updatedAt: Date;
}

const QuotationSchema = new Schema<IQuotation>(
  {
    quoteNumber: { type: String, required: true, unique: true },
    enquiryRef: { type: String },
    enquiry: { type: Schema.Types.ObjectId, ref: 'Enquiry' },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    customerName: { type: String, required: true },
    items: [
      {
        product: { type: Schema.Types.ObjectId, ref: 'Product' },
        productName: { type: String, required: true },
        quantity: { type: Number, required: true },
        unitPrice: { type: Number, required: true },
        listPrice: { type: Number, min: 0 },
        discountPercent: { type: Number, min: 0, max: 99.99 },
        totalPrice: { type: Number, required: true },
      },
    ],
    charges: [{ label: { type: String, required: true }, amount: { type: Number, required: true, min: 0 }, _id: false }], // freight, packing & forwarding... before GST
    totalAmount: { type: Number, required: true },
    paymentTerms: { type: String, default: 'NET 30' },
    validUntil: { type: Date },
    stage: {
      type: String,
      enum: ['ENQUIRY_RECEIVED', 'QUOTATION_SENT', 'UNDER_REVIEW', 'PO_RECEIVED', 'LOST_DECLINED'],
      default: 'ENQUIRY_RECEIVED',
    },
    creditCheckPassed: { type: Boolean, default: false },
    creditCheckNotes: { type: String },
    lossReason: { type: String },
    revision: { type: Number, default: 1 },
    revisions: [{ rev: Number, items: [Schema.Types.Mixed], charges: [Schema.Types.Mixed], totalAmount: Number, paymentTerms: String, validUntil: Date, terms: String, taxSummary: Schema.Types.Mixed, note: String, changedBy: String, at: { type: Date, default: Date.now } }],
    terms: { type: String },
    placeOfSupply: { type: String },
    taxSummary: { type: Schema.Types.Mixed },
    orderType: { type: String, enum: ['DOMESTIC', 'EXPORT'], default: 'DOMESTIC' },
    currency: { type: String, default: 'INR' },
    exchangeRate: { type: Number },
    incoterm: { type: String },
    portOfLoading: { type: String },
    portOfDischarge: { type: String },
    country: { type: String },
    lossCategory: { type: String, enum: ['COMPETITOR', 'PRICE', 'LEAD_TIME', 'SPEC_MISMATCH', 'BUDGET_CANCELLED', 'OTHER'] },
    poNumber: { type: String },
    salesOrderRef: { type: String },
    proformaNumber: { type: String },
    proformaIssuedAt: { type: Date },
    discountRequests: [{
      percent: { type: Number, required: true, min: 0, max: 100 },
      amount: { type: Number, required: true, min: 0 },
      reason: { type: String, required: true },
      requiredRole: { type: String, enum: ['SALES', 'MANAGER', 'ADMIN'], required: true },
      status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], required: true },
      requestedBy: String, requestedById: String, requestedAt: Date,
      decidedBy: String, decidedRole: String, decidedAt: Date, remarks: String, appliedRevision: Number,
      _id: false,
    }],
  },
  { timestamps: true }
);

export default mongoose.models.Quotation || mongoose.model<IQuotation>('Quotation', QuotationSchema);
