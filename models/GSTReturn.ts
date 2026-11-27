import mongoose, { Schema, Document } from 'mongoose';

export interface IGSTReturn extends Document {
  returnPeriod: string; // e.g., '2026-08'
  formType: 'GSTR-1' | 'GSTR-2B' | 'GSTR-3B';
  totalSales: number;
  totalPurchases: number;
  taxLiabilityCGST: number;
  taxLiabilitySGST: number;
  taxLiabilityIGST: number;
  itcAvailableCGST: number;
  itcAvailableSGST: number;
  itcAvailableIGST: number;
  netTaxPayable: number;
  status: 'PREPARED' | 'FILED' | 'ERROR';
  arn?: string; // Acknowledgement Reference Number
  filedDate?: Date;
  filedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const GSTReturnSchema = new Schema<IGSTReturn>(
  {
    returnPeriod: { type: String, required: true },
    formType: { type: String, enum: ['GSTR-1', 'GSTR-2B', 'GSTR-3B'], required: true },
    totalSales: { type: Number, default: 0 },
    totalPurchases: { type: Number, default: 0 },
    taxLiabilityCGST: { type: Number, default: 0 },
    taxLiabilitySGST: { type: Number, default: 0 },
    taxLiabilityIGST: { type: Number, default: 0 },
    itcAvailableCGST: { type: Number, default: 0 },
    itcAvailableSGST: { type: Number, default: 0 },
    itcAvailableIGST: { type: Number, default: 0 },
    netTaxPayable: { type: Number, default: 0 },
    status: { type: String, enum: ['PREPARED', 'FILED', 'ERROR'], default: 'PREPARED' },
    arn: { type: String },
    filedDate: { type: Date },
    filedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Ensure only one form type per period
GSTReturnSchema.index({ returnPeriod: 1, formType: 1 }, { unique: true });

export default mongoose.models.GSTReturn || mongoose.model<IGSTReturn>('GSTReturn', GSTReturnSchema);
