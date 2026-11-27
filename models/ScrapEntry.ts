import mongoose, { Schema, Document } from 'mongoose';

export interface IScrapEntry extends Document {
  store: 'SFG_SCRAP' | 'SFG_REJECT' | 'FG_SCRAP' | 'RM_SCRAP';
  workOrder?: mongoose.Types.ObjectId;
  woNumber?: string;
  stageName?: string;
  product: mongoose.Types.ObjectId;
  quantity: number;
  reason?: string;
  operator?: string;
  createdAt: Date;
}

const ScrapEntrySchema = new Schema<IScrapEntry>(
  {
    store: { type: String, enum: ['SFG_SCRAP', 'SFG_REJECT', 'FG_SCRAP', 'RM_SCRAP'], required: true },
    workOrder: { type: Schema.Types.ObjectId, ref: 'WorkOrder' },
    woNumber: String,
    stageName: String,
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 0 },
    reason: String,
    operator: String,
  },
  { timestamps: true }
);

export default mongoose.models.ScrapEntry || mongoose.model<IScrapEntry>('ScrapEntry', ScrapEntrySchema);
