import mongoose, { Schema, Document } from 'mongoose';

// Single-document seller profile used on tax documents, e-invoice and e-way bill JSON
export interface ICompanySettings extends Document {
  key: 'company';
  legalName: string;
  gstin: string;
  pan?: string;
  address1: string;
  address2?: string;
  city: string;
  pincode: string;
  stateCode: string; // 2-digit GST state code
  phone?: string;
  email?: string;
  bank: { name?: string; accountNo?: string; ifsc?: string; branch?: string };
  invoiceTerms?: string;
  usePickLists?: boolean; // goods must be picked on a pick list before a delivery challan; off: the challan takes stock itself
  updatedAt: Date;
}

const CompanySettingsSchema = new Schema<ICompanySettings>(
  {
    key: { type: String, default: 'company', unique: true },
    legalName: { type: String, default: '' },
    gstin: { type: String, default: '' },
    pan: String,
    address1: { type: String, default: '' },
    address2: String,
    city: { type: String, default: '' },
    pincode: { type: String, default: '' },
    stateCode: { type: String, default: '' },
    phone: String,
    email: String,
    bank: { name: String, accountNo: String, ifsc: String, branch: String },
    usePickLists: { type: Boolean, default: true },
    invoiceTerms: { type: String, default: 'Goods once sold will not be taken back. Interest at 18% p.a. on overdue payments.' },
  },
  { timestamps: true }
);

export default mongoose.models.CompanySettings || mongoose.model<ICompanySettings>('CompanySettings', CompanySettingsSchema);
