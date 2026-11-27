import mongoose, { Schema, Document } from 'mongoose';

// Which suppliers may supply a product, and when (the Source List in the Procurement workbook).
// When a product has entries valid on a date, a purchase order for it on that date must use one of those suppliers,
// and not one that is blocked. A `fixed` supplier is the one planning (MRP) proposes on requisitions.
export interface ISourceList extends Document {
  product: mongoose.Types.ObjectId;
  plant?: string;
  supplier: mongoose.Types.ObjectId;
  purchasingOrg?: string;
  validFrom: Date;
  validTo: Date;
  fixed: boolean;
  blocked: boolean;
  mrpRelevant: boolean;
  notes?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SourceListSchema = new Schema<ISourceList>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    plant: { type: String, trim: true, uppercase: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    purchasingOrg: { type: String, trim: true, uppercase: true },
    validFrom: { type: Date, required: true },
    validTo: {
      type: Date, required: true,
      validate: { validator: function (this: any, v: Date) { return !this?.validFrom || v >= this.validFrom; }, message: 'Valid-to cannot be before valid-from.' },
    },
    fixed: { type: Boolean, default: false },
    blocked: { type: Boolean, default: false },
    mrpRelevant: { type: Boolean, default: true },
    notes: { type: String },
    createdBy: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.SourceList || mongoose.model<ISourceList>('SourceList', SourceListSchema);
