import mongoose, { Schema, Document } from 'mongoose';

export interface IMilestone extends Document {
  project: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  dueDate: Date;
  completedDate?: Date;
  status: 'PENDING' | 'COMPLETED';
  budget: number;
  createdAt: Date;
  updatedAt: Date;
}

const MilestoneSchema = new Schema<IMilestone>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    name: { type: String, required: true },
    description: { type: String },
    dueDate: { type: Date, required: true },
    completedDate: { type: Date },
    status: { type: String, enum: ['PENDING', 'COMPLETED'], default: 'PENDING' },
    budget: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.Milestone || mongoose.model<IMilestone>('Milestone', MilestoneSchema);
