import mongoose, { Schema, Document } from 'mongoose';

export interface IStandardParameter {
  name: string;
  unit: string;
  minValue: number;
  maxValue: number;
  method?: string;
}

export interface IQualityStandard extends Document {
  product: mongoose.Types.ObjectId;
  parameters: IStandardParameter[];
  version: string;
  status: 'ACTIVE' | 'OBSOLETE';
  createdAt: Date;
  updatedAt: Date;
}

const StandardParameterSchema = new Schema<IStandardParameter>({
  name: { type: String, required: true },
  unit: { type: String, required: true },
  minValue: { type: Number, required: true },
  maxValue: { type: Number, required: true },
  method: { type: String },
});

const QualityStandardSchema = new Schema<IQualityStandard>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    parameters: [StandardParameterSchema],
    version: { type: String, required: true },
    status: { type: String, enum: ['ACTIVE', 'OBSOLETE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

export default mongoose.models.QualityStandard || mongoose.model<IQualityStandard>('QualityStandard', QualityStandardSchema);
