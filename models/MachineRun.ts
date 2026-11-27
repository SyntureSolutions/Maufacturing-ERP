import mongoose, { Schema, Document } from 'mongoose';

// One machine, one shift: scheduled time, stops, units made and rejected. OEE is derived from these (see lib/oee.ts).
export interface IMachineRun extends Document {
  machine: mongoose.Types.ObjectId;
  workOrder?: mongoose.Types.ObjectId;
  day: string; // YYYY-MM-DD
  shift: string;
  scheduledMinutes: number;
  downtimes: { category: string; minutes: number; notes?: string }[];
  totalCount: number;
  rejectCount: number;
  idealRatePerHour: number;
  operator?: string;
  notes?: string;
  createdBy?: string;
  createdAt: Date;
}

const MachineRunSchema = new Schema<IMachineRun>(
  {
    machine: { type: Schema.Types.ObjectId, ref: 'Machine', required: true },
    workOrder: { type: Schema.Types.ObjectId, ref: 'WorkOrder' },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    shift: { type: String, required: true, trim: true },
    scheduledMinutes: { type: Number, required: true, min: 1, max: 1440 },
    downtimes: [{ category: { type: String, required: true }, minutes: { type: Number, required: true, min: 0 }, notes: String }],
    totalCount: { type: Number, required: true, min: 0 },
    rejectCount: { type: Number, required: true, min: 0, default: 0 },
    idealRatePerHour: { type: Number, required: true, min: 0.0001 },
    operator: String,
    notes: String,
    createdBy: String,
  },
  { timestamps: true }
);
// A machine can only have one record per shift per day (prevents double entry)
MachineRunSchema.index({ machine: 1, day: 1, shift: 1 }, { unique: true });

export default mongoose.models.MachineRun || mongoose.model<IMachineRun>('MachineRun', MachineRunSchema);
