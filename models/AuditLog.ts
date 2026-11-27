import mongoose, { Schema, Document } from 'mongoose';

export type AuditActionType = 'CREATE' | 'EDIT' | 'APPROVE' | 'DELETE' | 'OVERRIDE' | 'REJECT' | 'LOGIN';

export interface IAuditLog extends Document {
  user?: mongoose.Types.ObjectId;
  userId?: string;
  userName: string;
  userRole: string;
  action: AuditActionType;
  resource: string; // e.g., 'WorkOrder', 'PurchaseOrder', 'SalesOrder', 'Invoice', 'QualityCheck'
  resourceId?: string;
  resourceName?: string;
  details: string; // Summary or JSON changes
  reason?: string; // Required for OVERRIDE or REJECT
  ipAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    userId: { type: String },
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    action: { 
      type: String, 
      enum: ['CREATE', 'EDIT', 'APPROVE', 'DELETE', 'OVERRIDE', 'REJECT', 'LOGIN'],
      required: true 
    },
    resource: { type: String, required: true },
    resourceId: { type: String },
    resourceName: { type: String },
    details: { type: String, required: true },
    reason: { type: String },
    ipAddress: { type: String },
  },
  { timestamps: true }
);

// Indexes for fast querying by Super Admin
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ resource: 1 });
AuditLogSchema.index({ userRole: 1 });

export default mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
