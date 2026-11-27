import mongoose, { Schema, Document } from 'mongoose';

// A pick list tells the warehouse which batches to pick for a sales order, and records what was actually picked.
// A delivery challan can only go out for goods that have been picked (see lib/picking.ts).
export interface IPickLine {
  _id: mongoose.Types.ObjectId;
  lineNo: number; // 10, 20, 30...
  product: mongoose.Types.ObjectId;
  batch: mongoose.Types.ObjectId;
  batchNumber: string;
  location: string;
  quantity: number;       // planned
  pickedQty: number;      // confirmed by the picker
  shortReason?: string;   // why less than planned was picked
  dispatchedQty: number;  // taken by delivery challans so far
}

export interface IPickList extends Document {
  number: string;
  salesOrder: mongoose.Types.ObjectId;
  soNumber: string;
  customerName?: string;
  status: 'OPEN' | 'PICKED' | 'CANCELLED';
  lines: IPickLine[];
  createdByName?: string;
  pickedByName?: string;
  pickedAt?: Date;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PickListSchema = new Schema<IPickList>(
  {
    number: { type: String, required: true, unique: true },
    salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true, index: true },
    soNumber: { type: String, required: true },
    customerName: String,
    status: { type: String, enum: ['OPEN', 'PICKED', 'CANCELLED'], default: 'OPEN', index: true },
    lines: [{
      lineNo: { type: Number, required: true },
      product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
      batch: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
      batchNumber: String,
      location: String,
      quantity: { type: Number, required: true, min: 0.0001 },
      pickedQty: { type: Number, default: 0, min: 0 },
      shortReason: String,
      dispatchedQty: { type: Number, default: 0, min: 0 },
    }],
    createdByName: String,
    pickedByName: String,
    pickedAt: Date,
    cancelReason: String,
  },
  { timestamps: true }
);

export default mongoose.models.PickList || mongoose.model<IPickList>('PickList', PickListSchema);
