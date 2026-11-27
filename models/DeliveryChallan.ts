import mongoose, { Schema, Document } from 'mongoose';

// Delivery challan under CGST Rule 55
export interface IDeliveryChallan extends Document {
  number: string;
  salesOrder: mongoose.Types.ObjectId;
  soNumber: string;
  customer: mongoose.Types.ObjectId;
  customerName: string;
  date: Date;
  reason: 'SUPPLY' | 'JOB_WORK' | 'SALE_ON_APPROVAL' | 'OTHER';
  placeOfSupply: string;
  items: any[];
  totalTaxable: number;
  transporterName: string;
  vehicleNo: string;
  lrNo: string;
  parties: any;
  status: 'ISSUED' | 'INVOICED' | 'CANCELLED';
  invoiceNumber?: string;
  stockMovements?: { batch: mongoose.Types.ObjectId; qty: number; reserved: boolean; product: mongoose.Types.ObjectId }[]; // what left stock, so a cancellation can put it back
  stockShortfall?: { product: mongoose.Types.ObjectId; qty: number }[]; // dispatched but not found in stock
  pickClaims?: { pickList: mongoose.Types.ObjectId; line: mongoose.Types.ObjectId; qty: number }[]; // picked goods this challan used, given back if it is cancelled
  cogsValue?: number;                 // cost of the goods dispatched, booked as cost of goods sold
  cogsJournal?: mongoose.Types.ObjectId;
  cancelReason?: string;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DeliveryChallanSchema = new Schema<IDeliveryChallan>(
  {
    number: { type: String, required: true, unique: true },
    salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true },
    soNumber: String,
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: String,
    date: { type: Date, default: Date.now },
    reason: { type: String, enum: ['SUPPLY', 'JOB_WORK', 'SALE_ON_APPROVAL', 'OTHER'], default: 'SUPPLY' },
    placeOfSupply: String,
    items: [Schema.Types.Mixed],
    totalTaxable: Number,
    transporterName: { type: String, required: true },
    vehicleNo: { type: String, required: true },
    lrNo: { type: String, required: true },
    parties: Schema.Types.Mixed,
    status: { type: String, enum: ['ISSUED', 'INVOICED', 'CANCELLED'], default: 'ISSUED' },
    invoiceNumber: String,
    stockMovements: [{ batch: { type: Schema.Types.ObjectId, ref: 'Batch' }, qty: Number, reserved: Boolean, product: { type: Schema.Types.ObjectId, ref: 'Product' }, _id: false }],
    stockShortfall: [{ product: { type: Schema.Types.ObjectId, ref: 'Product' }, qty: Number, _id: false }],
    pickClaims: [{ pickList: { type: Schema.Types.ObjectId, ref: 'PickList' }, line: Schema.Types.ObjectId, qty: Number, _id: false }],
    cogsValue: Number,
    cogsJournal: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
    cancelReason: String,
    cancelledAt: Date,
  },
  { timestamps: true }
);

export default mongoose.models.DeliveryChallan || mongoose.model<IDeliveryChallan>('DeliveryChallan', DeliveryChallanSchema);
