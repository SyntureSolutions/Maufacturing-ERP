import mongoose, { Schema, Document } from 'mongoose';

export interface IProformaInvoice extends Document {
  number: string;
  salesOrder: mongoose.Types.ObjectId;
  soNumber: string;
  customer: mongoose.Types.ObjectId;
  customerName: string;
  date: Date;
  placeOfSupply: string;
  items: any[];
  hsnSummary: any[];
  charges?: { label: string; amount: number }[];
  goodsTotal?: number;
  tcs?: any[];
  tcsAmount?: number;
  subTotal: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  totalAmount: number;
  advanceRequested: number;
  bank: any;
  terms?: string;
  parties: any;
  status: 'ISSUED' | 'CONVERTED' | 'CANCELLED';
  invoice?: mongoose.Types.ObjectId;
  invoiceNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProformaInvoiceSchema = new Schema<IProformaInvoice>(
  {
    number: { type: String, required: true, unique: true },
    salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true },
    soNumber: String,
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: String,
    date: { type: Date, default: Date.now },
    placeOfSupply: { type: String, required: true },
    items: [Schema.Types.Mixed],
    hsnSummary: [Schema.Types.Mixed],
    charges: [Schema.Types.Mixed],
    goodsTotal: Number,
    tcs: [Schema.Types.Mixed],
    tcsAmount: Number,
    subTotal: Number,
    totalCGST: Number,
    totalSGST: Number,
    totalIGST: Number,
    totalAmount: Number,
    advanceRequested: { type: Number, default: 0 },
    bank: Schema.Types.Mixed,
    terms: String,
    parties: Schema.Types.Mixed,
    status: { type: String, enum: ['ISSUED', 'CONVERTED', 'CANCELLED'], default: 'ISSUED' },
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    invoiceNumber: String,
  },
  { timestamps: true }
);

export default mongoose.models.ProformaInvoice || mongoose.model<IProformaInvoice>('ProformaInvoice', ProformaInvoiceSchema);
