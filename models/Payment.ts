import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment extends Document {
  paymentNumber: string;
  invoice: mongoose.Types.ObjectId;
  customer?: mongoose.Types.ObjectId;
  supplier?: mongoose.Types.ObjectId;
  amount: number;
  date: Date;
  mode: 'BANK_TRANSFER' | 'CHEQUE' | 'CASH' | 'UPI' | 'CREDIT_CARD';
  referenceNumber?: string;
  notes?: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    paymentNumber: { type: String, required: true, unique: true },
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, default: Date.now },
    mode: { type: String, enum: ['BANK_TRANSFER', 'CHEQUE', 'CASH', 'UPI', 'CREDIT_CARD'], required: true },
    referenceNumber: { type: String },
    notes: { type: String },
    status: { type: String, enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'], default: 'COMPLETED' },
  },
  { timestamps: true }
);

export default mongoose.models.Payment || mongoose.model<IPayment>('Payment', PaymentSchema);
