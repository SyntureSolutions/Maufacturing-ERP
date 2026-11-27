import mongoose, { Schema, Document } from 'mongoose';

export interface IFixedAsset extends Document {
  assetTag: string;
  name: string;
  category: 'MACHINERY' | 'VEHICLE' | 'EQUIPMENT' | 'FURNITURE' | 'BUILDING';
  purchaseDate: Date;
  originalCost: number;
  salvageValue: number;
  usefulLifeYears: number;
  accumulatedDepreciation: number;
  location?: string;
  status: 'ACTIVE' | 'DISPOSED' | 'UNDER_MAINTENANCE';
  createdAt: Date;
  updatedAt: Date;
}

const FixedAssetSchema = new Schema<IFixedAsset>(
  {
    assetTag: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    category: { 
      type: String, 
      enum: ['MACHINERY', 'VEHICLE', 'EQUIPMENT', 'FURNITURE', 'BUILDING'], 
      required: true 
    },
    purchaseDate: { type: Date, required: true, default: Date.now },
    originalCost: { type: Number, required: true },
    salvageValue: { type: Number, required: true, default: 0 },
    usefulLifeYears: { type: Number, required: true, default: 5 },
    accumulatedDepreciation: { type: Number, default: 0 },
    location: { type: String, default: 'Main Assembly Works' },
    status: { type: String, enum: ['ACTIVE', 'DISPOSED', 'UNDER_MAINTENANCE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

export default mongoose.models.FixedAsset || mongoose.model<IFixedAsset>('FixedAsset', FixedAssetSchema);
