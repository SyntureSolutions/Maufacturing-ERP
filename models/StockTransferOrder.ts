import mongoose, { Schema, Document } from 'mongoose';

export interface ITransferItem {
  batchId?: mongoose.Types.ObjectId;
  batchNumber: string;
  productName: string;
  productSku?: string;
  requestedQuantity: number;
  dispatchedQuantity: number;
  receivedQuantity?: number;
  shortageQuantity?: number;
  unitCost: number;
}

export interface IStockTransferOrder extends Document {
  transferNumber: string;
  fromWarehouse: string;
  toWarehouse: string;
  status: 'DRAFT' | 'DISPATCHED' | 'RECEIVED' | 'CANCELLED';
  items: ITransferItem[];
  carrier: string;
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  ewayBillNumber?: string;
  dispatchDate?: Date;
  deliveryDate?: Date;
  notes?: string;
  createdByName: string;
  receivedByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TransferItemSchema = new Schema<ITransferItem>(
  {
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch' },
    batchNumber: { type: String, required: true },
    productName: { type: String, required: true },
    productSku: { type: String },
    requestedQuantity: { type: Number, required: true },
    dispatchedQuantity: { type: Number, required: true },
    receivedQuantity: { type: Number },
    shortageQuantity: { type: Number, default: 0 },
    unitCost: { type: Number, default: 0 }
  },
  { _id: false }
);

const StockTransferOrderSchema = new Schema<IStockTransferOrder>(
  {
    transferNumber: { type: String, required: true, unique: true },
    fromWarehouse: { type: String, required: true },
    toWarehouse: { type: String, required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'DISPATCHED', 'RECEIVED', 'CANCELLED'],
      default: 'DRAFT'
    },
    items: [TransferItemSchema],
    carrier: { type: String, default: 'Internal Logistics Fleet' },
    vehicleNumber: { type: String },
    driverName: { type: String },
    driverPhone: { type: String },
    ewayBillNumber: { type: String },
    dispatchDate: { type: Date },
    deliveryDate: { type: Date },
    notes: { type: String },
    createdByName: { type: String, default: 'Supply Chain Manager' },
    receivedByName: { type: String }
  },
  { timestamps: true }
);

StockTransferOrderSchema.index({ transferNumber: 1 });
StockTransferOrderSchema.index({ status: 1 });

export default mongoose.models.StockTransferOrder || mongoose.model<IStockTransferOrder>('StockTransferOrder', StockTransferOrderSchema);
