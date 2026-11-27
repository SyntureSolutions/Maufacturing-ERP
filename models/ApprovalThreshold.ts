import mongoose, { Schema, Document } from 'mongoose';

export interface IApprovalThreshold extends Document {
  // Purchase Order Tiering
  poSupplyChainLimit: number;      // Default: 50,000 (POs under this can be approved by Supply Chain / Floor Mgr)
  poFinanceLimit: number;          // Default: 500,000 (POs between SupplyChainLimit and FinanceLimit require Finance Mgr; above requires Super Admin)
  
  // Sales Discount Tiering
  discountSalesLimitPercent: number;    // Default: 10% (Sales can approve under this)
  discountFinanceLimitPercent: number;  // Default: 25% (Finance can approve up to this; above requires Super Admin)
  discountAmountLimit: number;          // Default: 50,000 INR discount ceiling
  
  // Inventory Scrap & Bad Debt Write-offs
  writeOffFloorLimit: number;      // Default: 15,000 (Floor / Quality can write off under this)
  writeOffFinanceLimit: number;    // Default: 100,000 (Finance can approve up to this; above requires Super Admin)

  lastUpdatedBy: string;
  lastUpdatedRole: string;
  createdAt: Date;
  updatedAt: Date;
}

const ApprovalThresholdSchema = new Schema<IApprovalThreshold>(
  {
    poSupplyChainLimit: { type: Number, required: true, default: 50000 },
    poFinanceLimit: { type: Number, required: true, default: 500000 },
    discountSalesLimitPercent: { type: Number, required: true, default: 10 },
    discountFinanceLimitPercent: { type: Number, required: true, default: 25 },
    discountAmountLimit: { type: Number, required: true, default: 50000 },
    writeOffFloorLimit: { type: Number, required: true, default: 15000 },
    writeOffFinanceLimit: { type: Number, required: true, default: 100000 },
    lastUpdatedBy: { type: String, default: 'System Initializer' },
    lastUpdatedRole: { type: String, default: 'ADMIN' },
  },
  { timestamps: true }
);

export default mongoose.models.ApprovalThreshold || mongoose.model<IApprovalThreshold>('ApprovalThreshold', ApprovalThresholdSchema);
