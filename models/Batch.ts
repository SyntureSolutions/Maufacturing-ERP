import mongoose, { Schema, Document } from 'mongoose';

export interface IBatch extends Document {
  product: mongoose.Types.ObjectId;
  batchNumber: string; // Unique Identifier (e.g., BN-20260405-001)
  manufacturingDate?: Date;
  supplierBatchNo?: string; // the lot / batch number printed by the supplier, for tracing back to them
  expiryDate: Date;
  initialQuantity: number;
  currentQuantity: number;
  allocatedQuantity: number; // Reserved stock sample
  purchasePrice: number;
  po?: mongoose.Types.ObjectId; // Reference to the PO that brought this batch in
  location?: string; // Warehouse location
  qualityStatus?: 'PENDING_QC' | 'APPROVED' | 'REJECTED' | 'ON_HOLD';
  qualityChecks?: mongoose.Types.ObjectId[];
  store?: string; // QUARANTINE, SFG, FG, SCRAP (system stores) or a StorageLocation code such as W1
  zone?: string;
  rack?: string;
  bin?: string;
  grn?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BatchSchema = new Schema<IBatch>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    batchNumber: { type: String, required: true, unique: true },
    manufacturingDate: { type: Date },
    supplierBatchNo: { type: String, trim: true },
    expiryDate: { type: Date, required: true },
    initialQuantity: { type: Number, required: true, min: 0 },
    currentQuantity: { type: Number, required: true, min: 0 },
    allocatedQuantity: { type: Number, default: 0, min: 0 },
    purchasePrice: { type: Number, required: true, min: 0 },
    po: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' }, // absent for in-house finished goods
    location: { type: String, default: 'Main Warehouse' },
    qualityStatus: {
      type: String,
      enum: ['PENDING_QC', 'APPROVED', 'REJECTED', 'ON_HOLD'],
      default: 'PENDING_QC'
    },
    qualityChecks: [{ type: Schema.Types.ObjectId, ref: 'QualityCheck' }],
    store: { type: String, uppercase: true, trim: true }, // a system store or a StorageLocation code; checked where stock is placed
    zone: String,
    rack: String,
    bin: String,
    grn: { type: Schema.Types.ObjectId, ref: 'GRN' },
  },
  { timestamps: true }
);

// Indexing for FEFO (First Expiry First Out)
BatchSchema.index({ expiryDate: 1, product: 1 });
BatchSchema.index({ supplierBatchNo: 1 }, { sparse: true });

export default mongoose.models.Batch || mongoose.model<IBatch>('Batch', BatchSchema);
