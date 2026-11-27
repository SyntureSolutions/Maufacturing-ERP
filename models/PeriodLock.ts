import mongoose, { Schema, Document } from 'mongoose';

export interface IPeriodLock extends Document {
  kind: 'ACCOUNTING' | 'INVENTORY';
  lockedUpTo: Date; // transactions dated on or before this are frozen
  updatedBy?: string;
  updatedAt: Date;
}

const PeriodLockSchema = new Schema<IPeriodLock>(
  {
    kind: { type: String, enum: ['ACCOUNTING', 'INVENTORY'], required: true, unique: true },
    lockedUpTo: { type: Date, required: true },
    updatedBy: String,
  },
  { timestamps: true }
);

export default mongoose.models.PeriodLock || mongoose.model<IPeriodLock>('PeriodLock', PeriodLockSchema);
