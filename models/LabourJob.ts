import mongoose, { Schema, Document } from 'mongoose';

export interface IJobWorker {
  worker: mongoose.Types.ObjectId;
  hoursWorked: number;
  rate: number;
}

export interface ILabourJob extends Document {
  jobNumber: string;
  workOrder?: mongoose.Types.ObjectId;
  workers: IJobWorker[];
  shift: string;
  date: Date;
  productivityNotes?: string;
  totalCost: number;
  createdAt: Date;
  updatedAt: Date;
}

const JobWorkerSchema = new Schema<IJobWorker>({
  worker: { type: Schema.Types.ObjectId, ref: 'Worker', required: true },
  hoursWorked: { type: Number, required: true },
  rate: { type: Number, required: true },
});

const LabourJobSchema = new Schema<ILabourJob>(
  {
    jobNumber: { type: String, required: true, unique: true },
    workOrder: { type: Schema.Types.ObjectId, ref: 'WorkOrder' },
    workers: [JobWorkerSchema],
    shift: { type: String, required: true },
    date: { type: Date, required: true },
    productivityNotes: { type: String },
    totalCost: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.LabourJob || mongoose.model<ILabourJob>('LabourJob', LabourJobSchema);
