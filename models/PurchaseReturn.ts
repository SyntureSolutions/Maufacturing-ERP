import mongoose, { Schema, Document } from 'mongoose';

// Return-to-Vendor challan raised when GRN inspection rejects goods for return
export interface IPurchaseReturn extends Document {
  number: string; // RTV challan number
  grn: mongoose.Types.ObjectId;
  grnNumber: string;
  supplier: mongoose.Types.ObjectId;
  items: { product: mongoose.Types.ObjectId; quantity: number; unitPrice: number; reason?: string }[];
  baseAmount: number;
  gstPercent: number;
  gstAmount: number;
  totalAmount: number;
  debitNote?: mongoose.Types.ObjectId;
  debitNoteNumber?: string;
  status: 'RAISED' | 'DISPATCHED';
  afterBilling?: boolean;           // part of it had already been billed
  bill?: mongoose.Types.ObjectId;   // the vendor bill credited
  billNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseReturnSchema = new Schema<IPurchaseReturn>(
  {
    number: { type: String, required: true, unique: true },
    grn: { type: Schema.Types.ObjectId, ref: 'GRN', required: true },
    grnNumber: String,
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    items: [{ product: { type: Schema.Types.ObjectId, ref: 'Product' }, quantity: Number, unitPrice: Number, reason: String }],
    baseAmount: Number,
    gstPercent: Number,
    gstAmount: Number,
    totalAmount: Number,
    debitNote: { type: Schema.Types.ObjectId, ref: 'Voucher' },
    debitNoteNumber: String,
    status: { type: String, enum: ['RAISED', 'DISPATCHED'], default: 'RAISED' },
    afterBilling: Boolean,
    bill: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    billNumber: String,
  },
  { timestamps: true }
);

export default mongoose.models.PurchaseReturn || mongoose.model<IPurchaseReturn>('PurchaseReturn', PurchaseReturnSchema);
