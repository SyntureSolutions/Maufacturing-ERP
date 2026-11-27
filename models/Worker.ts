import mongoose, { Schema, Document } from 'mongoose';

export interface IWorker extends Document {
  name: string;
  employeeId: string;
  department: string;
  skills: string[];
  shift: string;
  dailyRate: number;
  overtimeRate: number;
  status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
  createdAt: Date;
  updatedAt: Date;
}

const WorkerSchema = new Schema<IWorker>(
  {
    name: { type: String, required: true },
    employeeId: { type: String, required: true, unique: true },
    department: { type: String, required: true },
    skills: [{ type: String }],
    shift: { type: String, required: true },
    dailyRate: { type: Number, required: true },
    overtimeRate: { type: Number, required: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ON_LEAVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

export default mongoose.models.Worker || mongoose.model<IWorker>('Worker', WorkerSchema);
