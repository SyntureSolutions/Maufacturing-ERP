import mongoose, { Schema, Document } from 'mongoose';

export interface IAccount extends Document {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  category: string; // e.g., 'Current Asset', 'Cost of Goods Sold'
  balance: number;
  currency: string; // Default 'INR'
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AccountSchema = new Schema<IAccount>(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'], required: true },
    category: { type: String, required: true },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.Account || mongoose.model<IAccount>('Account', AccountSchema);
