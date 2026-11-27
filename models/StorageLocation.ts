import mongoose, { Schema, Document } from 'mongoose';

// Put-away storage locations (stores) where usable stock is kept, e.g. W1 Raw Material Store or 1106 Consumables.
// Stock in them counts as usable once QC-approved. The process stores (QUARANTINE, SFG, FG, SCRAP) are fixed by
// the system and cannot be created here.
export const SYSTEM_STORES = ['QUARANTINE', 'SFG', 'FG', 'SCRAP'] as const;

export interface IStorageLocation extends Document {
  code: string;
  name: string;
  plant?: string;
  zones: string[];
  racks: string[];
  bins: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StorageLocationSchema = new Schema<IStorageLocation>(
  {
    code: {
      type: String, required: true, unique: true, trim: true, uppercase: true, match: /^[A-Z0-9_-]{1,12}$/,
      validate: { validator: (v: string) => !(SYSTEM_STORES as readonly string[]).includes(v), message: 'That code is a system store and cannot be used.' },
    },
    name: { type: String, required: true, trim: true },
    plant: { type: String, trim: true, uppercase: true },
    zones: [{ type: String, trim: true, uppercase: true }],
    racks: [{ type: String, trim: true, uppercase: true }],
    bins: [{ type: String, trim: true, uppercase: true }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.StorageLocation || mongoose.model<IStorageLocation>('StorageLocation', StorageLocationSchema);
