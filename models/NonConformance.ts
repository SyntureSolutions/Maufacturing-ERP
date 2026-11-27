import mongoose, { Schema, Document } from 'mongoose';

export interface INonConformance extends Document {
  ncrNumber: string;
  qualityCheck: mongoose.Types.ObjectId;
  batch?: mongoose.Types.ObjectId;
  type: 'MATERIAL' | 'PROCESS' | 'PRODUCT';
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  correctiveAction?: string;
  dispositionDecision?: 'REWORK' | 'SCRAP' | 'USE_AS_IS' | 'RETURN';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: Date;
  updatedAt: Date;
}

const NonConformanceSchema = new Schema<INonConformance>(
  {
    ncrNumber: { type: String, required: true, unique: true },
    qualityCheck: { type: Schema.Types.ObjectId, ref: 'QualityCheck', required: true },
    batch: { type: Schema.Types.ObjectId, ref: 'Batch' },
    type: { type: String, enum: ['MATERIAL', 'PROCESS', 'PRODUCT'], required: true },
    severity: { type: String, enum: ['CRITICAL', 'MAJOR', 'MINOR'], required: true },
    correctiveAction: { type: String },
    dispositionDecision: { type: String, enum: ['REWORK', 'SCRAP', 'USE_AS_IS', 'RETURN'] },
    status: { type: String, enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'], default: 'OPEN' },
  },
  { timestamps: true }
);

export default mongoose.models.NonConformance || mongoose.model<INonConformance>('NonConformance', NonConformanceSchema);
