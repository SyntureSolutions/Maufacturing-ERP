import mongoose, { Schema, Document } from 'mongoose';

export interface IMaterialRequisition extends Document {
  number: string;
  workOrder: mongoose.Types.ObjectId;
  items: { product: mongoose.Types.ObjectId; requiredQty: number; reservedQty: number; issuedQty: number; uom?: string; holds?: { batch: mongoose.Types.ObjectId; quantity: number; issued: number }[] }[];
  issueLock?: boolean;
  status: 'DRAFT' | 'RESERVED' | 'PARTIALLY_ISSUED' | 'ISSUED' | 'CANCELLED';
  shortfall: boolean;
  remarks?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MaterialRequisitionSchema = new Schema<IMaterialRequisition>(
  {
    number: { type: String, required: true, unique: true },
    workOrder: { type: Schema.Types.ObjectId, ref: 'WorkOrder', required: true },
    items: [{
      product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
      requiredQty: { type: Number, required: true, min: 0 },
      reservedQty: { type: Number, default: 0, min: 0 },
      issuedQty: { type: Number, default: 0, min: 0 },
      uom: String,
      // which batches hold this line's reservation, and how much of each has been handed over
      holds: [{ _id: false, batch: { type: Schema.Types.ObjectId, ref: 'Batch', required: true }, quantity: { type: Number, required: true, min: 0 }, issued: { type: Number, default: 0, min: 0 } }],
    }],
    issueLock: { type: Boolean, default: false },
    status: { type: String, enum: ['DRAFT', 'RESERVED', 'PARTIALLY_ISSUED', 'ISSUED', 'CANCELLED'], default: 'DRAFT' },
    shortfall: { type: Boolean, default: false },
    remarks: String,
    createdBy: String,
  },
  { timestamps: true }
);

export default mongoose.models.MaterialRequisition || mongoose.model<IMaterialRequisition>('MaterialRequisition', MaterialRequisitionSchema);
