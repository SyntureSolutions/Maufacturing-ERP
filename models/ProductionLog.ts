import mongoose, { Schema, Document } from 'mongoose';

export interface IMaterialInput {
  product: mongoose.Types.ObjectId;
  batch: mongoose.Types.ObjectId;
  quantityConsumed: number;
}

export interface IProductionLog extends Document {
  workOrder: mongoose.Types.ObjectId;
  machine?: mongoose.Types.ObjectId;
  operator?: mongoose.Types.ObjectId;
  inputMaterials: IMaterialInput[];
  outputQuantity: number;
  wasteQuantity: number;
  startTime: Date;
  endTime: Date;
  shift?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MaterialInputSchema = new Schema<IMaterialInput>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  batch: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
  quantityConsumed: { type: Number, required: true, min: 0 },
});

const ProductionLogSchema = new Schema<IProductionLog>(
  {
    workOrder: { type: Schema.Types.ObjectId, ref: 'WorkOrder', required: true },
    machine: { type: Schema.Types.ObjectId, ref: 'Machine' },
    operator: { type: Schema.Types.ObjectId, ref: 'User' },
    inputMaterials: [MaterialInputSchema],
    outputQuantity: { type: Number, required: true, min: 0 },
    wasteQuantity: { type: Number, default: 0, min: 0 },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    shift: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.ProductionLog || mongoose.model<IProductionLog>('ProductionLog', ProductionLogSchema);
