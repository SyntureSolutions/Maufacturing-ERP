import mongoose, { Schema, Document } from 'mongoose';

export interface IMachine extends Document {
  name: string;
  code: string;
  type: string;
  location?: string;
  status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'BREAKDOWN';
  capacity?: number; // E.g., units per hour
  maintenanceSchedule?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MachineSchema = new Schema<IMachine>(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    location: { type: String },
    status: {
      type: String,
      enum: ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'BREAKDOWN'],
      default: 'AVAILABLE',
    },
    capacity: { type: Number },
    maintenanceSchedule: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.models.Machine || mongoose.model<IMachine>('Machine', MachineSchema);
