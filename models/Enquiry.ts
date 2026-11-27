import mongoose, { Schema, Document } from 'mongoose';

export interface IEnquiryItem {
  product?: mongoose.Types.ObjectId;
  productName: string;
  estimatedQuantity: number;
}

export interface IEnquiry extends Document {
  enquiryNumber: string;
  customerName: string;
  email?: string;
  phone?: string;
  source: 'WEBSITE' | 'EMAIL' | 'PHONE' | 'TRADE_SHOW' | 'DIRECT';
  items: IEnquiryItem[];
  notes?: string;
  region: 'DOMESTIC' | 'EXPORT';
  country?: string;
  followUps: { _id?: any; dueAt: Date; mode: 'CALL' | 'SMS' | 'EMAIL'; notes?: string; status: 'PENDING' | 'DONE' | 'CANCELLED'; doneAt?: Date; outcome?: string; createdBy?: string; alertedAt?: Date }[];
  status: 'NEW' | 'QUALIFIED' | 'REJECTED';
  convertedQuotationRef?: string;
  cancelReason?: string;
  cancelledBy?: string;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EnquirySchema = new Schema<IEnquiry>(
  {
    enquiryNumber: { type: String, required: true, unique: true },
    customerName: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    source: {
      type: String,
      enum: ['WEBSITE', 'EMAIL', 'PHONE', 'TRADE_SHOW', 'DIRECT'],
      default: 'WEBSITE',
    },
    items: [
      {
        product: { type: Schema.Types.ObjectId, ref: 'Product' },
        productName: { type: String, required: true },
        estimatedQuantity: { type: Number, required: true, default: 1 },
      },
    ],
    notes: { type: String },
    region: { type: String, enum: ['DOMESTIC', 'EXPORT'], default: 'DOMESTIC' },
    country: { type: String },
    followUps: [{
      dueAt: { type: Date, required: true },
      mode: { type: String, enum: ['CALL', 'SMS', 'EMAIL'], default: 'CALL' },
      notes: String,
      status: { type: String, enum: ['PENDING', 'DONE', 'CANCELLED'], default: 'PENDING' },
      doneAt: Date, outcome: String, createdBy: String, alertedAt: Date,
    }],
    status: {
      type: String,
      enum: ['NEW', 'QUALIFIED', 'REJECTED'],
      default: 'NEW',
    },
    convertedQuotationRef: { type: String },
    cancelReason: { type: String },
    cancelledBy: { type: String },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.models.Enquiry || mongoose.model<IEnquiry>('Enquiry', EnquirySchema);
