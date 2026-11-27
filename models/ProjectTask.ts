import mongoose, { Schema, Document } from 'mongoose';

export interface IProjectTask extends Document {
  project: mongoose.Types.ObjectId;
  milestone?: mongoose.Types.ObjectId;
  name: string;
  assignedTo?: mongoose.Types.ObjectId;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  startDate?: Date;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectTaskSchema = new Schema<IProjectTask>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    milestone: { type: Schema.Types.ObjectId, ref: 'Milestone' },
    name: { type: String, required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
    status: { type: String, enum: ['TODO', 'IN_PROGRESS', 'DONE'], default: 'TODO' },
    startDate: { type: Date },
    dueDate: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.models.ProjectTask || mongoose.model<IProjectTask>('ProjectTask', ProjectTaskSchema);
