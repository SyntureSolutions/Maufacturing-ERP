import mongoose, { Schema, Document } from 'mongoose';

export type VoucherType =
  | 'DEBIT_NOTE' | 'CREDIT_NOTE'
  | 'BANK_PAYMENT' | 'BANK_RECEIPT' | 'CASH_PAYMENT' | 'CASH_RECEIPT'
  | 'PETTY_CASH' | 'EXPENSE' | 'JOURNAL' | 'CONTRA';

export interface IVoucher extends Document {
  number: string;
  type: VoucherType;
  date: Date;
  partyType?: 'SUPPLIER' | 'CUSTOMER' | 'OTHER';
  partyId?: mongoose.Types.ObjectId;
  partyName?: string;
  refDoc?: { kind: string; number: string; date?: Date };
  // GST details of a credit / debit note (see lib/gstNote)
  noteDetails?: { reason: string; originalDate?: Date; rateDiff?: { quantity: number; billedRate: number; actualRate: number }; partyNoteNo?: string; partyNoteDate?: Date; itcDate?: Date };
  amount: number; // grand total
  taxableAmount?: number;
  gstPercent?: number;
  gstAmount?: number;
  tdsAmount?: number;
  lines: { accountCode: string; accountName?: string; debit: number; credit: number }[];
  narration?: string;
  instrument?: { mode?: string; chequeNo?: string; utr?: string; bank?: string };
  costCenter?: string;
  category?: string;
  attachmentUrl?: string;
  reconciled?: boolean;
  status: 'POSTED' | 'VOIDED';
  journalEntry?: mongoose.Types.ObjectId;
  idempotencyKey?: string;
  allocations?: { _id?: mongoose.Types.ObjectId; invoice: mongoose.Types.ObjectId; invoiceNumber: string; amount: number; at: Date; by?: string }[]; // parts of an advance applied to bills
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const VoucherSchema = new Schema<IVoucher>(
  {
    number: { type: String, required: true, unique: true },
    type: {
      type: String, required: true,
      enum: ['DEBIT_NOTE', 'CREDIT_NOTE', 'BANK_PAYMENT', 'BANK_RECEIPT', 'CASH_PAYMENT', 'CASH_RECEIPT', 'PETTY_CASH', 'EXPENSE', 'JOURNAL', 'CONTRA'],
    },
    date: { type: Date, default: Date.now },
    partyType: { type: String, enum: ['SUPPLIER', 'CUSTOMER', 'OTHER'] },
    partyId: { type: Schema.Types.ObjectId },
    partyName: String,
    refDoc: { kind: String, number: String, date: Date },
    noteDetails: {
      reason: String, originalDate: Date,
      rateDiff: { quantity: Number, billedRate: Number, actualRate: Number },
      partyNoteNo: String, partyNoteDate: Date, itcDate: Date,
    },
    amount: { type: Number, required: true, min: 0 },
    taxableAmount: Number,
    gstPercent: Number,
    gstAmount: Number,
    tdsAmount: Number,
    lines: [{ accountCode: { type: String, required: true }, accountName: String, debit: { type: Number, default: 0 }, credit: { type: Number, default: 0 } }],
    narration: String,
    instrument: { mode: String, chequeNo: String, utr: String, bank: String },
    costCenter: String,
    category: String,
    attachmentUrl: String,
    reconciled: { type: Boolean, default: false },
    status: { type: String, enum: ['POSTED', 'VOIDED'], default: 'POSTED' },
    journalEntry: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
    idempotencyKey: { type: String }, // set when created from an approval, so a retry can never post it twice
    allocations: [{ invoice: { type: Schema.Types.ObjectId, ref: 'Invoice' }, invoiceNumber: String, amount: Number, at: { type: Date, default: Date.now }, by: String }],
    createdBy: String,
  },
  { timestamps: true }
);
VoucherSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });

export default mongoose.models.Voucher || mongoose.model<IVoucher>('Voucher', VoucherSchema);
