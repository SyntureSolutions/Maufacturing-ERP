import mongoose, { Schema, Document } from 'mongoose';
import { APPROVAL_MODULES, type ApprovalModule } from '@/lib/approvalModules';

export { APPROVAL_MODULES };
export type { ApprovalModule };

// Rule: for a module, documents at or above `minAmount` need each role in `levels` to approve, in order
export interface IApprovalRule extends Document {
  module: ApprovalModule;
  minAmount: number;
  levels: string[];
  updatedBy?: string;
}

export interface IApprovalRequest extends Document {
  module: ApprovalModule;
  refId: string;
  refNumber: string;
  summary?: string;
  amount: number;
  levels: { role: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; actedBy?: string; actedAt?: Date; remarks?: string }[];
  currentLevel: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: string;
  requestedById?: string;
  requestedByRole?: string;
  payload?: any;      // for documents that do not exist yet (vouchers, outward job work): what to create once approved
  resultRef?: string; // number of the document created on approval
  locked?: boolean;   // set while a decision is being processed, so a document cannot be created twice
  createdAt: Date;
}

const ApprovalRuleSchema = new Schema<IApprovalRule>(
  {
    module: { type: String, enum: APPROVAL_MODULES, required: true },
    minAmount: { type: Number, required: true, min: 0 },
    levels: [{ type: String, required: true }],
    updatedBy: String,
  },
  { timestamps: true }
);

const ApprovalRequestSchema = new Schema<IApprovalRequest>(
  {
    module: { type: String, enum: APPROVAL_MODULES, required: true },
    refId: { type: String, required: true, index: true },
    refNumber: { type: String, required: true },
    summary: String,
    amount: { type: Number, required: true },
    levels: [{ role: String, status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' }, actedBy: String, actedAt: Date, remarks: String }],
    currentLevel: { type: Number, default: 0 },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    requestedBy: { type: String, required: true },
    requestedById: String,
    requestedByRole: String,
    payload: Schema.Types.Mixed,
    resultRef: String,
    locked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// At most one pending request per document: simultaneous clicks cannot raise two
ApprovalRequestSchema.index({ module: 1, refId: 1 }, { unique: true, partialFilterExpression: { status: 'PENDING' } });

export const ApprovalRule = mongoose.models.ApprovalRule || mongoose.model<IApprovalRule>('ApprovalRule', ApprovalRuleSchema);
export const ApprovalRequest = mongoose.models.ApprovalRequest || mongoose.model<IApprovalRequest>('ApprovalRequest', ApprovalRequestSchema);
