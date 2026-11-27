import mongoose, { Schema, Document } from 'mongoose';

export interface IQualityParameter {
  name: string;
  standard: string;
  actual: string;
  result: 'PASS' | 'FAIL';
}

export interface IQualityCheck extends Document {
  checkNumber: string;
  workOrder?: mongoose.Types.ObjectId;
  batch?: mongoose.Types.ObjectId;
  type: 'INCOMING' | 'IN_PROCESS' | 'FINAL';
  parameters: IQualityParameter[];
  inspector: mongoose.Types.ObjectId;
  status: 'PENDING' | 'PASSED' | 'FAILED';
  assignedDate: Date;
  completedDate?: Date;
  checkedAt: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const QualityParameterSchema = new Schema<IQualityParameter>({
  name: { type: String, required: true },
  standard: { type: String, required: true },
  actual: { type: String, required: true },
  result: { type: String, enum: ['PASS', 'FAIL'], required: true },
});

const QualityCheckSchema = new Schema<IQualityCheck>(
  {
    checkNumber: { type: String, required: true, unique: true },
    workOrder: { type: Schema.Types.ObjectId, ref: 'WorkOrder' },
    batch: { type: Schema.Types.ObjectId, ref: 'Batch' },
    type: { type: String, enum: ['INCOMING', 'IN_PROCESS', 'FINAL'], required: true },
    parameters: [QualityParameterSchema],
    inspector: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['PENDING', 'PASSED', 'FAILED'], default: 'PENDING' },
    assignedDate: { type: Date, default: Date.now },
    completedDate: { type: Date },
    checkedAt: { type: Date, default: Date.now },
    notes: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.QualityCheck || mongoose.model<IQualityCheck>('QualityCheck', QualityCheckSchema);
