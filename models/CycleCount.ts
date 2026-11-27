import mongoose, { Schema, Document } from 'mongoose';

export interface ICycleCountItem {
  batch: mongoose.Types.ObjectId;
  batchNumber: string;
  productName: string;
  productSku?: string;
  location: string;
  systemQuantity: number;
  countedQuantity?: number;
  variance?: number; // countedQuantity - systemQuantity
  unitCost: number;
  varianceValue?: number; // variance * unitCost
  notes?: string;
}

export interface ICycleCount extends Document {
  countNumber: string;
  warehouse: string;
  scheduledDate: Date;
  countedAt?: Date;
  status: 'PLANNED' | 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'POSTED' | 'CANCELLED';
  items: ICycleCountItem[];
  totalVarianceQuantity: number;
  totalVarianceValue: number;
  assignedCounter: string;
  approvedBy?: string;
  rejectionReason?: string;
  postedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CycleCountItemSchema = new Schema<ICycleCountItem>(
  {
    batch: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
    batchNumber: { type: String, required: true },
    productName: { type: String, required: true },
    productSku: { type: String },
    location: { type: String, default: 'Main Warehouse' },
    systemQuantity: { type: Number, required: true },
    countedQuantity: { type: Number },
    variance: { type: Number, default: 0 },
    unitCost: { type: Number, default: 0 },
    varianceValue: { type: Number, default: 0 },
    notes: { type: String }
  },
  { _id: false }
);

const CycleCountSchema = new Schema<ICycleCount>(
  {
    countNumber: { type: String, required: true, unique: true },
    warehouse: { type: String, required: true, default: 'All Locations' },
    scheduledDate: { type: Date, default: Date.now },
    countedAt: { type: Date },
    status: {
      type: String,
      enum: ['PLANNED', 'IN_PROGRESS', 'PENDING_APPROVAL', 'POSTED', 'CANCELLED'],
      default: 'PLANNED'
    },
    items: [CycleCountItemSchema],
    totalVarianceQuantity: { type: Number, default: 0 },
    totalVarianceValue: { type: Number, default: 0 },
    assignedCounter: { type: String, default: 'Warehouse Auditor' },
    approvedBy: { type: String },
    rejectionReason: { type: String },
    postedAt: { type: Date }
  },
  { timestamps: true }
);

CycleCountSchema.index({ countNumber: 1 });
CycleCountSchema.index({ status: 1 });

export default mongoose.models.CycleCount || mongoose.model<ICycleCount>('CycleCount', CycleCountSchema);
