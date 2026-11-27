import mongoose, { Schema, Document } from 'mongoose';

export interface ISalesProjection extends Document {
  product: mongoose.Types.ObjectId;
  month: string; // YYYY-MM
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

const SalesProjectionSchema = new Schema<ISalesProjection>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    quantity: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);
SalesProjectionSchema.index({ product: 1, month: 1 }, { unique: true });

export default mongoose.models.SalesProjection || mongoose.model<ISalesProjection>('SalesProjection', SalesProjectionSchema);
