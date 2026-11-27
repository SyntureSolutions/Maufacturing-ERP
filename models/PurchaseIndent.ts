import mongoose, { Schema, Document } from 'mongoose';
import { lineNumbersHook } from '@/lib/lineNumbers';

export interface IIndentItem {
  lineNo?: number; // 10, 20, 30...
  product: mongoose.Types.ObjectId;
  quantity: number;
  uom?: string;
  requiredBy?: Date;
  preferredSupplier?: mongoose.Types.ObjectId;
}

export type IndentStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RFQ_CREATED';

export interface IPurchaseIndent extends Document {
  number: string;
  source: 'MRP' | 'MRN_SHORTFALL' | 'MANUAL';
  mrpRun?: mongoose.Types.ObjectId;
  salesOrder?: mongoose.Types.ObjectId;
  category?: string;
  items: IIndentItem[];
  status: IndentStatus;
  remarks?: string;
  rfq?: mongoose.Types.ObjectId;
  requestedBy?: string;
  approvedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseIndentSchema = new Schema<IPurchaseIndent>(
  {
    number: { type: String, required: true, unique: true },
    source: { type: String, enum: ['MRP', 'MRN_SHORTFALL', 'MANUAL'], default: 'MANUAL' },
    mrpRun: { type: Schema.Types.ObjectId, ref: 'MRPRun' },
    salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder', index: true }, // customer order this indent serves
    category: { type: String },
    items: [{
      lineNo: { type: Number, min: 1 },
      product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity: { type: Number, required: true, min: 0.0001 },
      uom: String,
      requiredBy: Date,
      preferredSupplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    }],
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'RFQ_CREATED'], default: 'PENDING' },
    remarks: String,
    rfq: { type: Schema.Types.ObjectId, ref: 'RFQ' },
    requestedBy: String,
    approvedBy: String,
  },
  { timestamps: true }
);

PurchaseIndentSchema.pre('validate', lineNumbersHook);

export default mongoose.models.PurchaseIndent || mongoose.model<IPurchaseIndent>('PurchaseIndent', PurchaseIndentSchema);
