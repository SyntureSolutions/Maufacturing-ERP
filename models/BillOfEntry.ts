import mongoose, { Schema, Document } from 'mongoose';

// Customs Bill of Entry for imported goods: duties are paid at filing, the duty becomes part of the goods' cost, and IGST is claimed as input credit
export interface IBillOfEntry extends Document {
  number: string;              // the customs Bill of Entry number
  date: Date;
  port: string;                // port / ICD of import
  po: mongoose.Types.ObjectId;
  poNumber: string;
  grn: mongoose.Types.ObjectId;
  grnNumber: string;
  supplier: mongoose.Types.ObjectId;
  currency?: string;
  exchangeRate?: number;
  assessableValue: number;     // customs value in INR (information: the goods themselves are payable to the supplier)
  bcd: number;                 // basic customs duty
  sws: number;                 // social welfare surcharge
  igst: number;                // integrated tax on imports
  otherCharges: number;        // clearing agent, port, demurrage ...
  dutyForCost: number;         // bcd + sws + otherCharges: added to the goods' cost
  totalPaid: number;           // everything paid to customs and agents
  mode: 'BANK' | 'CASH';
  paymentRef?: string;         // challan / UTR
  journalEntry?: mongoose.Types.ObjectId;
  costUplift?: { batch: mongoose.Types.ObjectId; perUnit: number }[]; // what was added to each batch's cost per unit
  status: 'POSTED' | 'CANCELLED';
  cancelReason?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BillOfEntrySchema = new Schema<IBillOfEntry>(
  {
    number: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    port: { type: String, required: true, trim: true },
    po: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    poNumber: String,
    grn: { type: Schema.Types.ObjectId, ref: 'GRN', required: true, index: true },
    grnNumber: String,
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    currency: String,
    exchangeRate: Number,
    assessableValue: { type: Number, default: 0, min: 0 },
    bcd: { type: Number, default: 0, min: 0 },
    sws: { type: Number, default: 0, min: 0 },
    igst: { type: Number, default: 0, min: 0 },
    otherCharges: { type: Number, default: 0, min: 0 },
    dutyForCost: { type: Number, default: 0 },
    totalPaid: { type: Number, required: true, min: 0 },
    mode: { type: String, enum: ['BANK', 'CASH'], default: 'BANK' },
    paymentRef: String,
    journalEntry: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
    costUplift: [{ batch: { type: Schema.Types.ObjectId, ref: 'Batch' }, perUnit: Number, _id: false }],
    status: { type: String, enum: ['POSTED', 'CANCELLED'], default: 'POSTED' },
    cancelReason: String,
    createdBy: String,
  },
  { timestamps: true }
);
// one live Bill of Entry per number and port
BillOfEntrySchema.index({ number: 1, port: 1 }, { unique: true, partialFilterExpression: { status: 'POSTED' } });

export default mongoose.models.BillOfEntry || mongoose.model<IBillOfEntry>('BillOfEntry', BillOfEntrySchema);
