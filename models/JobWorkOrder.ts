import mongoose, { Schema, Document } from 'mongoose';

// Outward: we send our material to a subcontractor (challan A-series, ITC-04 reportable).
// Inward: we process a customer's material (custody register, return challan B-series, service invoice).
export interface IJobWorkItem {
  product?: mongoose.Types.ObjectId;
  description: string;
  hsnCode?: string;
  quantity: number;
  uom?: string;
  value: number; // taxable value on the challan
  consumed: number;
  returned: number;
  scrap: number;
  allocations?: { batch: mongoose.Types.ObjectId; quantity: number; price: number }[];
}

export interface IJobWorkOrder extends Document {
  kind: 'OUTWARD' | 'INWARD';
  number: string;
  party: mongoose.Types.ObjectId; // Supplier (outward) or Customer (inward)
  partyName: string;
  partyGstin?: string;
  date: Date;
  goodsType: 'INPUT' | 'CAPITAL';
  natureOfJob: string;
  items: IJobWorkItem[];
  outputProduct?: mongoose.Types.ObjectId;
  expectedOutputQty?: number;
  outputReceivedQty: number;
  dueDate?: Date; // ITC-04 return deadline
  vehicleNo?: string;
  // outward: the purchase order issued to the job worker
  poNumber?: string;
  poIssuedAt?: Date;
  processingCharge?: number; // agreed charge per unit of output
  poGstRate?: number;
  poTerms?: string;
  // inward: the customer's order and the sales order prepared from it
  customerPoNumber?: string;
  salesOrder?: mongoose.Types.ObjectId;
  receipts: { challanNo?: string; at: Date; outputQty: number; note?: string; items: { index: number; consumed: number; returned: number; scrap: number }[] }[];
  // inward-only
  serviceRate?: number;
  sac?: string;
  gstRate?: number;
  processedQty: number;
  returns: { challanNo: string; quantity: number; vehicleNo?: string; at: Date }[];
  invoicedQty: number;
  invoiceNumbers: string[];
  status: 'OPEN' | 'PARTIAL' | 'CLOSED';
  closeNote?: string;
  approvalRef?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const JobWorkOrderSchema = new Schema<IJobWorkOrder>(
  {
    kind: { type: String, enum: ['OUTWARD', 'INWARD'], required: true },
    number: { type: String, required: true, unique: true },
    party: { type: Schema.Types.ObjectId, required: true },
    partyName: { type: String, required: true },
    partyGstin: String,
    date: { type: Date, default: Date.now },
    goodsType: { type: String, enum: ['INPUT', 'CAPITAL'], default: 'INPUT' },
    natureOfJob: { type: String, default: '' },
    items: [{
      product: { type: Schema.Types.ObjectId, ref: 'Product' },
      description: { type: String, required: true },
      hsnCode: String,
      quantity: { type: Number, required: true, min: 0.0001 },
      uom: String,
      value: { type: Number, default: 0 },
      consumed: { type: Number, default: 0 },
      returned: { type: Number, default: 0 },
      scrap: { type: Number, default: 0 },
      allocations: [{ batch: { type: Schema.Types.ObjectId, ref: 'Batch' }, quantity: Number, price: Number }],
    }],
    outputProduct: { type: Schema.Types.ObjectId, ref: 'Product' },
    expectedOutputQty: Number,
    outputReceivedQty: { type: Number, default: 0 },
    dueDate: Date,
    vehicleNo: String,
    poNumber: { type: String, unique: true, sparse: true },
    poIssuedAt: Date,
    processingCharge: Number,
    poGstRate: Number,
    poTerms: String,
    customerPoNumber: String,
    salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
    receipts: [{ challanNo: String, at: { type: Date, default: Date.now }, outputQty: Number, note: String, items: [{ index: Number, consumed: Number, returned: Number, scrap: Number }] }],
    serviceRate: Number,
    sac: { type: String, default: '9988' },
    gstRate: { type: Number, default: 18 },
    processedQty: { type: Number, default: 0 },
    returns: [{ challanNo: String, quantity: Number, vehicleNo: String, at: { type: Date, default: Date.now } }],
    invoicedQty: { type: Number, default: 0 },
    invoiceNumbers: [String],
    status: { type: String, enum: ['OPEN', 'PARTIAL', 'CLOSED'], default: 'OPEN' },
    closeNote: String,
    approvalRef: { type: String, index: true }, // the approval request this challan was issued for
    createdBy: String,
  },
  { timestamps: true }
);

export default mongoose.models.JobWorkOrder || mongoose.model<IJobWorkOrder>('JobWorkOrder', JobWorkOrderSchema);
