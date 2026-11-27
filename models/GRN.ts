import mongoose, { Schema, Document } from 'mongoose';

export interface IGRNItem {
  product: mongoose.Types.ObjectId;
  orderedQty: number;
  receivedQty: number;
  unitPrice: number;
  expiryDate: Date;
  supplierBatchNo?: string;
  manufacturingDate?: Date;
  batch?: mongoose.Types.ObjectId;
  inspection: 'PENDING' | 'ACCEPTED' | 'PARTIAL' | 'REJECTED';
  acceptedQty: number;
  scrapQty: number;
  returnQty: number;
  tests: { name: string; standard?: string; actual?: string; result: 'PASS' | 'FAIL' }[];
  putAway?: { warehouse: string; zone: string; rack: string; bin: string; at: Date }; // warehouse = StorageLocation code
}

export interface IGRN extends Document {
  number: string;
  po: mongoose.Types.ObjectId;
  poNumber: string;
  supplier: mongoose.Types.ObjectId;
  gateEntryNo: string;
  vendorChallanNo: string;
  vehicleNo: string;
  checklist: { quantityVerified: boolean; packingIntact: boolean; documentsVerified: boolean };
  items: IGRNItem[];
  status: 'QUARANTINE' | 'QC_DONE' | 'PUT_AWAY';
  inspectedBy?: string;
  inspectedAt?: Date;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const GRNSchema = new Schema<IGRN>(
  {
    number: { type: String, required: true, unique: true },
    po: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    poNumber: { type: String, required: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    gateEntryNo: { type: String, required: true, trim: true },
    vendorChallanNo: { type: String, required: true, trim: true },
    vehicleNo: { type: String, required: true, trim: true },
    checklist: {
      quantityVerified: { type: Boolean, default: false },
      packingIntact: { type: Boolean, default: false },
      documentsVerified: { type: Boolean, default: false },
    },
    items: [{
      product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
      orderedQty: Number,
      receivedQty: { type: Number, required: true, min: 0.0001 },
      unitPrice: { type: Number, required: true, min: 0 },
      expiryDate: Date, // every stocked line has one (checked on receipt); a non-stock line has none
      supplierBatchNo: String,   // the supplier's lot / batch number, as on their label
      manufacturingDate: Date,   // as on the supplier's label
      nonStock: { type: Boolean, default: false }, // consumables / services: received and paid for, but never held as stock
      batch: { type: Schema.Types.ObjectId, ref: 'Batch' },
      inspection: { type: String, enum: ['PENDING', 'ACCEPTED', 'PARTIAL', 'REJECTED'], default: 'PENDING' },
      acceptedQty: { type: Number, default: 0 },
      scrapQty: { type: Number, default: 0 },
      returnQty: { type: Number, default: 0 },
      tests: [{ name: String, standard: String, actual: String, result: { type: String, enum: ['PASS', 'FAIL'] } }],
      putAway: { warehouse: String, zone: String, rack: String, bin: String, at: Date },
    }],
    status: { type: String, enum: ['QUARANTINE', 'QC_DONE', 'PUT_AWAY'], default: 'QUARANTINE' },
    inspectedBy: String,
    inspectedAt: Date,
    createdBy: String,
  },
  { timestamps: true }
);

export default mongoose.models.GRN || mongoose.model<IGRN>('GRN', GRNSchema);
