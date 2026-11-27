import mongoose, { Schema, Document } from 'mongoose';

// Files attached to any transaction (drawings, test certificates, vendor invoices, contracts)
export interface IAttachment extends Document {
  entityType: string; // e.g. GRN, PURCHASE_ORDER, INVOICE, JOBWORK, VOUCHER
  entityId: string;
  filename: string;
  mimeType: string;
  size: number;
  category?: string;
  data: Buffer;
  uploadedBy: string;
  createdAt: Date;
}

const AttachmentSchema = new Schema<IAttachment>(
  {
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    category: String,
    data: { type: Buffer, required: true, select: false },
    uploadedBy: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.models.Attachment || mongoose.model<IAttachment>('Attachment', AttachmentSchema);
