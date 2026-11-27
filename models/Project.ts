import mongoose, { Schema, Document } from 'mongoose';

export interface IProject extends Document {
  projectNumber: string;
  name: string;
  description?: string;
  customer?: mongoose.Types.ObjectId;
  manager: mongoose.Types.ObjectId;
  team: mongoose.Types.ObjectId[];
  budget: number;
  actualCost: number;
  startDate: Date;
  endDate?: Date;
  status: 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
  workOrders: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    projectNumber: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    manager: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    team: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    budget: { type: Number, default: 0 },
    actualCost: { type: Number, default: 0 },
    startDate: { type: Date, required: true, default: Date.now },
    endDate: { type: Date },
    status: {
      type: String,
      enum: ['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
      default: 'PLANNING',
    },
    workOrders: [{ type: Schema.Types.ObjectId, ref: 'WorkOrder' }],
  },
  { timestamps: true }
);

export default mongoose.models.Project || mongoose.model<IProject>('Project', ProjectSchema);
