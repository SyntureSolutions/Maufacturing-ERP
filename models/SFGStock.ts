import mongoose, { Schema, Document } from 'mongoose';

// Semi-finished goods lot held in the intermediate store between WIP stages
export interface ISFGStock extends Document {
  batchCode: string;
  workOrder: mongoose.Types.ObjectId;
  woNumber: string;
  product: mongoose.Types.ObjectId;
  stageSeq: number;
  stageName: string;
  inputQty: number; // units processed to make this lot
  quantity: number; // lot quantity produced
  remainingQty: number; // still in the SFG store
  conversionRatio: number; // good / input
  qcStatus?: 'PENDING' | 'APPROVED' | 'REJECTED'; // lots made by stage output wait for QC; older lots count as approved
  qcRejectedQty?: number;
  qcBy?: string;
  qcSignature?: string;
  qcReason?: string;
  qcAt?: Date;
  reissues: { workOrder: mongoose.Types.ObjectId; woNumber: string; quantity: number; at: Date; by?: string }[];
  createdAt: Date;
}

const SFGStockSchema = new Schema<ISFGStock>(
  {
    batchCode: { type: String, required: true, unique: true },
    workOrder: { type: Schema.Types.ObjectId, ref: 'WorkOrder', required: true },
    woNumber: String,
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    stageSeq: Number,
    stageName: String,
    inputQty: Number,
    quantity: Number,
    remainingQty: Number,
    conversionRatio: Number,
    qcStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'APPROVED' },
    qcRejectedQty: { type: Number, default: 0 },
    qcBy: String,
    qcSignature: String,
    qcReason: String,
    qcAt: Date,
    reissues: [{ workOrder: { type: Schema.Types.ObjectId, ref: 'WorkOrder' }, woNumber: String, quantity: Number, at: { type: Date, default: Date.now }, by: String }],
  },
  { timestamps: true }
);

export default mongoose.models.SFGStock || mongoose.model<ISFGStock>('SFGStock', SFGStockSchema);
