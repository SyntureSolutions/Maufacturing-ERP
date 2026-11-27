import mongoose, { Schema, Document } from 'mongoose';

export interface IWorkOrderStage {
  seq: number;
  name: string;
  inQty: number; // units released into this stage so far
  good: number;
  scrap: number;
  rework: number; // reported rework (still held at the stage until reprocessed)
}

export interface IStageLog {
  seq: number;
  stageName: string;
  input: number;
  good: number;
  scrap: number;
  rework: number;
  operator: string;
  notes?: string;
  at: Date;
}

export interface IWorkOrder extends Document {
  woNumber: string;
  product: mongoose.Types.ObjectId;
  bom: mongoose.Types.ObjectId;
  quantity: number;
  demandType: 'MTO' | 'MTS';
  salesOrderRef?: string;
  salesOrder?: mongoose.Types.ObjectId; // the customer order this work serves (make-to-order)
  plannedStartDate?: Date;
  plannedEndDate?: Date;
  actualStartDate?: Date;
  actualEndDate?: Date;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
  assignedMachine?: mongoose.Types.ObjectId;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  parentWorkOrder?: mongoose.Types.ObjectId; // For sub-assemblies
  qcStatus?: 'PENDING' | 'PASSED' | 'FAILED' | 'QUARANTINED';
  qcGatePassed?: boolean;
  qcNotes?: string;
  qualityChecks?: mongoose.Types.ObjectId[];
  mrpRun?: mongoose.Types.ObjectId;
  sfgIssuedOut?: { lot: mongoose.Types.ObjectId; batchCode: string; toWorkOrder: string; quantity: number; atStage: number; at: Date; by?: string }[];
  sfgReceived?: { lot: mongoose.Types.ObjectId; batchCode: string; fromWorkOrder: string; quantity: number; atStage: number; at: Date; by?: string }[];
  stages?: IWorkOrderStage[];
  stageLogs?: IStageLog[];
  fgReceivedQty?: number;
  materialCost?: number;    // cost of material issued to this work order
  costTransferred?: number; // part of it already moved on to finished goods or scrap
  outputLock?: boolean;
  // scrap and by-products the BOM says this work gives: expected from the BOM, actual as recorded when the work is done
  otherOutputs?: { product: mongoose.Types.ObjectId; kind: 'SCRAP' | 'BY_PRODUCT'; expectedQty: number; actualQty: number; uom?: string; batch?: mongoose.Types.ObjectId; batchNumber?: string }[];
  otherOutputsRecordedAt?: Date;
  otherOutputsRecordedBy?: string;
  otherOutputsNotes?: string;
  fgApprovedQty?: number;
  fgScrapQty?: number;
  fgQc?: { status: 'PENDING' | 'PASSED' | 'PARTIAL' | 'FAILED'; inspector?: string; signature?: string; certificateNo?: string; checks: { name: string; standard?: string; actual?: string; result: 'PASS' | 'FAIL' }[]; at?: Date };
  createdAt: Date;
  updatedAt: Date;
}

const WorkOrderSchema = new Schema<IWorkOrder>(
  {
    woNumber: { type: String, required: true, unique: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    bom: { type: Schema.Types.ObjectId, ref: 'BillOfMaterials', required: true },
    quantity: { type: Number, required: true, min: 0.000001 },
    demandType: { type: String, enum: ['MTO', 'MTS'], default: 'MTS', required: true },
    salesOrderRef: { type: String, trim: true },
    salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder', index: true },
    plannedStartDate: { type: Date },
    plannedEndDate: { type: Date },
    actualStartDate: { type: Date },
    actualEndDate: { type: Date },
    status: {
      type: String,
      enum: ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED'],
      default: 'PLANNED',
    },
    assignedMachine: { type: Schema.Types.ObjectId, ref: 'Machine' },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
    },
    parentWorkOrder: { type: Schema.Types.ObjectId, ref: 'WorkOrder' },
    qcStatus: {
      type: String,
      enum: ['PENDING', 'PASSED', 'FAILED', 'QUARANTINED'],
      default: 'PENDING'
    },
    qcGatePassed: { type: Boolean, default: false },
    qcNotes: { type: String },
    qualityChecks: [{ type: Schema.Types.ObjectId, ref: 'QualityCheck' }],
    mrpRun: { type: Schema.Types.ObjectId, ref: 'MRPRun' },
    sfgIssuedOut: [{ lot: { type: Schema.Types.ObjectId, ref: 'SFGStock' }, batchCode: String, toWorkOrder: String, quantity: Number, atStage: Number, at: { type: Date, default: Date.now }, by: String }],
    sfgReceived: [{ lot: { type: Schema.Types.ObjectId, ref: 'SFGStock' }, batchCode: String, fromWorkOrder: String, quantity: Number, atStage: Number, at: { type: Date, default: Date.now }, by: String }],
    stages: [{ seq: Number, name: String, inQty: { type: Number, default: 0 }, good: { type: Number, default: 0 }, scrap: { type: Number, default: 0 }, rework: { type: Number, default: 0 } }],
    stageLogs: [{ seq: Number, stageName: String, input: Number, good: Number, scrap: Number, rework: Number, operator: String, notes: String, at: { type: Date, default: Date.now } }],
    fgReceivedQty: { type: Number, default: 0 },
    materialCost: { type: Number, default: 0 },
    costTransferred: { type: Number, default: 0 },
    outputLock: { type: Boolean, default: false },
    otherOutputs: [{ product: { type: Schema.Types.ObjectId, ref: 'Product' }, kind: { type: String, enum: ['SCRAP', 'BY_PRODUCT'] }, expectedQty: Number, actualQty: Number, uom: String, batch: { type: Schema.Types.ObjectId, ref: 'Batch' }, batchNumber: String }],
    otherOutputsRecordedAt: Date,
    otherOutputsRecordedBy: String,
    otherOutputsNotes: String,
    fgApprovedQty: { type: Number, default: 0 },
    fgScrapQty: { type: Number, default: 0 },
    fgQc: {
      status: { type: String, enum: ['PENDING', 'PASSED', 'PARTIAL', 'FAILED'], default: 'PENDING' },
      inspector: String, signature: String, certificateNo: String,
      checks: [{ name: String, standard: String, actual: String, result: { type: String, enum: ['PASS', 'FAIL'] } }],
      at: Date,
    },
  },
  { timestamps: true }
);

export default mongoose.models.WorkOrder || mongoose.model<IWorkOrder>('WorkOrder', WorkOrderSchema);
