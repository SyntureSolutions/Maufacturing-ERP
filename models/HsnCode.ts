import mongoose, { Schema, Document } from 'mongoose';

// HSN (goods) and SAC (services) codes with their tariff description and GST rate, loaded in bulk from the
// GST portal's HSN/SAC list or a rate sheet (see lib/hsnImport.ts). Items pick their code from here.
export interface IHsnCode extends Document {
  code: string; // 2–8 digits; SAC codes start with 99
  kind: 'HSN' | 'SAC';
  description: string;
  gstRate?: number; // percent; not every source file carries rates
  isActive: boolean;
  source?: string; // file it last came from
  createdAt: Date;
  updatedAt: Date;
}

const HsnCodeSchema = new Schema<IHsnCode>(
  {
    code: { type: String, required: true, unique: true, trim: true, match: /^\d{2,8}$/ },
    kind: { type: String, enum: ['HSN', 'SAC'], required: true },
    description: { type: String, default: '', trim: true },
    gstRate: { type: Number, min: 0, max: 40 },
    isActive: { type: Boolean, default: true },
    source: { type: String },
  },
  { timestamps: true }
);

HsnCodeSchema.index({ description: 'text' });

export default mongoose.models.HsnCode || mongoose.model<IHsnCode>('HsnCode', HsnCodeSchema);
