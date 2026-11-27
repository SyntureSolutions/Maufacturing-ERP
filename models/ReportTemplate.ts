import mongoose, { Schema, Document } from 'mongoose';

export interface IReportTemplate extends Document {
  name: string;
  type: 'FINANCIAL' | 'PRODUCTION' | 'INVENTORY' | 'SALES' | 'CUSTOM';
  configuration: any; // JSON object defining columns, filters, chart types
  createdBy: mongoose.Types.ObjectId;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReportTemplateSchema = new Schema<IReportTemplate>(
  {
    name: { type: String, required: true, unique: true },
    type: { type: String, enum: ['FINANCIAL', 'PRODUCTION', 'INVENTORY', 'SALES', 'CUSTOM'], required: true },
    configuration: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isPublic: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.ReportTemplate || mongoose.model<IReportTemplate>('ReportTemplate', ReportTemplateSchema);
