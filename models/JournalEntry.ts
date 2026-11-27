import mongoose, { Schema, Document } from 'mongoose';

export interface IJournalEntry extends Document {
  entryNumber: string;
  date: Date;
  reference?: string; // Invoice ID, PO ID, etc.
  referenceType?: string; // 'INVOICE', 'PAYMENT', 'MANUAL'
  description: string;
  lines: {
    account: mongoose.Types.ObjectId;
    debit: number;
    credit: number;
    notes?: string;
  }[];
  totalDebit: number;
  totalCredit: number;
  status: 'DRAFT' | 'POSTED' | 'VOIDED';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const JournalEntrySchema = new Schema<IJournalEntry>(
  {
    entryNumber: { type: String, required: true, unique: true },
    date: { type: Date, required: true, default: Date.now },
    reference: { type: String },
    referenceType: { type: String },
    description: { type: String, required: true },
    lines: [
      {
        account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
        debit: { type: Number, required: true, default: 0 },
        credit: { type: Number, required: true, default: 0 },
        notes: { type: String },
      },
    ],
    totalDebit: { type: Number, required: true },
    totalCredit: { type: Number, required: true },
    status: { type: String, enum: ['DRAFT', 'POSTED', 'VOIDED'], default: 'POSTED' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export default mongoose.models.JournalEntry || mongoose.model<IJournalEntry>('JournalEntry', JournalEntrySchema);
