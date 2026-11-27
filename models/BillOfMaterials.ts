import mongoose, { Schema, Document } from 'mongoose';

// A bill of materials says what goes into `baseQuantity` of the product (1 pcs, 100 kg, 200 L...).
// Component quantities are for that base quantity, in the unit chosen on the line; `unitFactor` turns them into the
// component's stock unit. Lifecycle: DRAFT (editable) -> PENDING_APPROVAL (if the approval matrix has a rule) -> ACTIVE.
// Other outputs are what else a batch gives besides the product: SCRAP (recoverable waste, goes to the SCRAP store)
// and BY_PRODUCT (useful, saleable output, goes to stock after QC); quantities per base quantity like components.
// The ACTIVE BOM with isDefault is the one work orders and MRP use; activating a new version makes the previous one OBSOLETE.

export interface IBOMComponent {
  product: mongoose.Types.ObjectId;
  quantity: number;          // per base quantity, in `unit`
  unit: string;              // the item's stock unit, or its purchase unit
  unitFactor: number;        // stock units in one `unit` (1 for the stock unit)
  wastagePercentage: number;
}

export type OutputKind = 'SCRAP' | 'BY_PRODUCT';

export interface IBOMOutput {
  product: mongoose.Types.ObjectId;
  kind: OutputKind;
  quantity: number;          // expected per base quantity, in `unit`
  unit: string;
  unitFactor: number;
}

export interface IRoutingStep {
  stepNumber: number;
  description: string;
  machineType?: string; // e.g. "MIXER", "OVEN"
  estimatedTimeMinutes: number;
}

export type BomStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'OBSOLETE';

export interface IBillOfMaterials extends Document {
  product: mongoose.Types.ObjectId;
  version: string;
  baseQuantity: number;
  components: IBOMComponent[];
  outputs: IBOMOutput[];
  routingSteps: IRoutingStep[];
  status: BomStatus;
  isDefault: boolean;
  notes?: string;
  copiedFrom?: mongoose.Types.ObjectId;
  createdBy?: string;
  submittedBy?: string;
  activatedBy?: string;
  activatedAt?: Date;
  obsoletedAt?: Date;
  rejection?: { by?: string; role?: string; remarks?: string; at?: Date };
  createdAt: Date;
  updatedAt: Date;
}

const BOMComponentSchema = new Schema<IBOMComponent>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true },
  unitFactor: { type: Number, default: 1, min: 0.000001 },
  wastagePercentage: { type: Number, default: 0, min: 0, max: 100 },
});

const BOMOutputSchema = new Schema<IBOMOutput>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  kind: { type: String, enum: ['SCRAP', 'BY_PRODUCT'], required: true },
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true },
  unitFactor: { type: Number, default: 1, min: 0.000001 },
});

const RoutingStepSchema = new Schema<IRoutingStep>({
  stepNumber: { type: Number, required: true },
  description: { type: String, required: true },
  machineType: { type: String },
  estimatedTimeMinutes: { type: Number, required: true, min: 0 },
});

const BillOfMaterialsSchema = new Schema<IBillOfMaterials>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    version: { type: String, required: true },
    baseQuantity: { type: Number, default: 1, min: 0.000001 },
    components: [BOMComponentSchema],
    outputs: [BOMOutputSchema],
    routingSteps: [RoutingStepSchema],
    status: {
      type: String,
      enum: ['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'OBSOLETE'],
      default: 'DRAFT',
    },
    isDefault: { type: Boolean, default: false },
    notes: String,
    copiedFrom: { type: Schema.Types.ObjectId, ref: 'BillOfMaterials' },
    createdBy: String,
    submittedBy: String,
    activatedBy: String,
    activatedAt: Date,
    obsoletedAt: Date,
    rejection: { by: String, role: String, remarks: String, at: Date },
  },
  { timestamps: true }
);

// one default BOM per product, and version labels do not repeat for a product
BillOfMaterialsSchema.index({ product: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });
BillOfMaterialsSchema.index({ product: 1, version: 1 }, { unique: true });

export default mongoose.models.BillOfMaterials || mongoose.model<IBillOfMaterials>('BillOfMaterials', BillOfMaterialsSchema);
