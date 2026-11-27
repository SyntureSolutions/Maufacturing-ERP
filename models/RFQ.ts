import mongoose, { Schema, Document } from 'mongoose';
import { lineNumbersHook } from '@/lib/lineNumbers';

export interface IRFQVendorQuote {
  supplier: mongoose.Types.ObjectId;
  receivedAt?: Date;
  unitPrices: { product: mongoose.Types.ObjectId; unitPrice: number }[];
  freight: number;
  gstPercent: number;
  leadTimeDays?: number;
  paymentTerms?: string;
  remarks?: string;
}

export interface IRFQ extends Document {
  number: string;
  indents: mongoose.Types.ObjectId[];
  // One line per product; `sources` are the indent lines it consolidates, carried onto the awarded PO.
  items: { lineNo?: number; product: mongoose.Types.ObjectId; quantity: number; uom?: string; requiredBy?: Date; sources?: { indent: mongoose.Types.ObjectId; lineNo: number; quantity: number }[] }[];
  suppliers: mongoose.Types.ObjectId[];
  quotes: IRFQVendorQuote[];
  status: 'OPEN' | 'AWARDED' | 'CANCELLED';
  awardedSupplier?: mongoose.Types.ObjectId;
  awardRemarks?: string;
  purchaseOrder?: mongoose.Types.ObjectId;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RFQSchema = new Schema<IRFQ>(
  {
    number: { type: String, required: true, unique: true },
    indents: [{ type: Schema.Types.ObjectId, ref: 'PurchaseIndent' }],
    items: [{
      lineNo: { type: Number, min: 1 },
      product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity: { type: Number, required: true, min: 0.0001 },
      uom: String,
      requiredBy: Date,
      sources: [{ indent: { type: Schema.Types.ObjectId, ref: 'PurchaseIndent' }, lineNo: Number, quantity: Number, _id: false }],
    }],
    suppliers: [{ type: Schema.Types.ObjectId, ref: 'Supplier' }],
    quotes: [{
      supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
      receivedAt: { type: Date, default: Date.now },
      unitPrices: [{ product: { type: Schema.Types.ObjectId, ref: 'Product' }, unitPrice: { type: Number, min: 0 } }],
      freight: { type: Number, default: 0, min: 0 },
      gstPercent: { type: Number, default: 18, min: 0 },
      leadTimeDays: Number,
      paymentTerms: String,
      remarks: String,
    }],
    status: { type: String, enum: ['OPEN', 'AWARDED', 'CANCELLED'], default: 'OPEN' },
    awardedSupplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    awardRemarks: String,
    purchaseOrder: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
    dueDate: Date,
  },
  { timestamps: true }
);

RFQSchema.pre('validate', lineNumbersHook);

export default mongoose.models.RFQ || mongoose.model<IRFQ>('RFQ', RFQSchema);
