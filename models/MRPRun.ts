import mongoose, { Schema, Document } from 'mongoose';

export interface IDemandInput {
  product: mongoose.Types.ObjectId;
  quantity: number;
  requiredDate: Date;
  source?: string; // E.g., "Sales Order SO-001"
}

export interface IPlannedOrder {
  product: mongoose.Types.ObjectId;
  quantity: number;
  orderType: 'PURCHASE' | 'WORK_ORDER';
  plannedStartDate: Date;
  plannedReleaseDate: Date;
}

export interface IMRPRun extends Document {
  runDate: Date;
  generatedBy: mongoose.Types.ObjectId;
  demandInputs: IDemandInput[];
  plannedOrders: IPlannedOrder[];
  status: 'DRAFT' | 'APPROVED' | 'EXECUTED';
  matrix?: any[];
  salesOrder?: mongoose.Types.ObjectId;   // set when the run was made for one customer order
  sourceType?: 'GENERAL' | 'SO_DRIVEN';
  indentsCreated?: boolean;
  workOrdersCreated?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DemandInputSchema = new Schema<IDemandInput>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 0 },
  requiredDate: { type: Date, required: true },
  source: { type: String },
});

const PlannedOrderSchema = new Schema<IPlannedOrder>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 0 },
  orderType: { type: String, enum: ['PURCHASE', 'WORK_ORDER'], required: true },
  plannedStartDate: { type: Date, required: true },
  plannedReleaseDate: { type: Date, required: true },
});

const MRPRunSchema = new Schema<IMRPRun>(
  {
    runDate: { type: Date, default: Date.now },
    generatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    demandInputs: [DemandInputSchema],
    plannedOrders: [PlannedOrderSchema],
    matrix: { type: [Schema.Types.Mixed], default: undefined },
    salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder', index: true },
    sourceType: { type: String, enum: ['GENERAL', 'SO_DRIVEN'], default: 'GENERAL' },
    indentsCreated: { type: Boolean, default: false },
    workOrdersCreated: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['DRAFT', 'APPROVED', 'EXECUTED'],
      default: 'DRAFT',
    },
  },
  { timestamps: true }
);

export default mongoose.models.MRPRun || mongoose.model<IMRPRun>('MRPRun', MRPRunSchema);
