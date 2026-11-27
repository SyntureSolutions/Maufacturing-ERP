import mongoose, { Schema, Document } from 'mongoose';

export interface IExportDocument extends Document {
  documentNumber: string;
  invoice: mongoose.Types.ObjectId;
  type: 'COMMERCIAL_INVOICE' | 'PACKING_LIST' | 'CERTIFICATE_OF_ORIGIN' | 'BILL_OF_LADING' | 'AIRWAY_BILL' | 'SHIPPING_BILL';
  countryOfOrigin: string;
  countryOfDestination: string;
  portOfLoading: string;
  portOfDischarge: string;
  currency: string; // E.g., USD, EUR (Though user wants INR, exports often have FCY tracking, but we'll stick to INR equivalent)
  exchangeRate: number;
  totalValueINR: number;
  status: 'DRAFT' | 'ISSUED' | 'SUBMITTED_CUSTOMS' | 'CLEARED' | 'REJECTED';
  fileUrl?: string; // S3 or local path
  createdAt: Date;
  updatedAt: Date;
}

const ExportDocumentSchema = new Schema<IExportDocument>(
  {
    documentNumber: { type: String, required: true, unique: true },
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    type: {
      type: String,
      enum: ['COMMERCIAL_INVOICE', 'PACKING_LIST', 'CERTIFICATE_OF_ORIGIN', 'BILL_OF_LADING', 'AIRWAY_BILL', 'SHIPPING_BILL'],
      required: true,
    },
    countryOfOrigin: { type: String, default: 'India' },
    countryOfDestination: { type: String, required: true },
    portOfLoading: { type: String, required: true },
    portOfDischarge: { type: String, required: true },
    currency: { type: String, default: 'INR' },
    exchangeRate: { type: Number, default: 1 },
    totalValueINR: { type: Number, required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'ISSUED', 'SUBMITTED_CUSTOMS', 'CLEARED', 'REJECTED'],
      default: 'DRAFT',
    },
    fileUrl: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.ExportDocument || mongoose.model<IExportDocument>('ExportDocument', ExportDocumentSchema);
