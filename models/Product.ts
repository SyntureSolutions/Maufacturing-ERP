import mongoose, { Schema, Document } from 'mongoose';

// Layout follows the ERP Material Master Template: basic data (MARA), plant data (MARC) and accounting (MBEW).
// Template column -> field: Material ID = sku, Material Description = name, Material Group = category,
// Base UOM = uom, Reorder Point = minStockLevel, Moving Avg Price = purchasePrice. Total Stock Qty and
// Total Value are not stored: they come from the product's batches.
export const PRODUCT_TYPES = ['RAW_MATERIAL', 'SEMI_FINISHED', 'FINISHED_GOOD', 'PACKAGING', 'TRADING_GOOD', 'SPARE_PART', 'SERVICE'] as const;
// SAP material type codes used in the template's drop-down (Reference_Data), plus the standard ones for our own types.
export const SAP_MATERIAL_TYPES: Record<string, (typeof PRODUCT_TYPES)[number]> = {
  ROH: 'RAW_MATERIAL', HALB: 'SEMI_FINISHED', FERT: 'FINISHED_GOOD', VERP: 'PACKAGING', HAWA: 'TRADING_GOOD', ERSA: 'SPARE_PART', DIEN: 'SERVICE',
};
export const MRP_TYPES: Record<string, string> = { PD: 'MRP', VB: 'Reorder Point', ND: 'No Planning' };
export const PRICE_CONTROLS: Record<string, string> = { V: 'Moving Average', S: 'Standard Price' };
export const TEMPLATE_UOMS: Record<string, string> = { EA: 'Each', M: 'Meter', KG: 'Kilogram', PC: 'Piece' };
export const STOCK_TYPES = ['STOCKABLE', 'NON_STOCK'] as const;

// "PD (MRP)" as written in the template is stored as its code, PD.
const code = (v: any) => (typeof v === 'string' ? v.split('(')[0].trim().toUpperCase() : v);
const productType = (v: any) => (typeof v === 'string' ? SAP_MATERIAL_TYPES[code(v)] || v.trim().toUpperCase() : v);
// "EA (Each)" is stored as EA; existing lower-case units (pcs, kg) are left as they are.
const unit = (v: any) => (typeof v === 'string' ? v.split('(')[0].trim() : v);
const yesNo = (v: any) => (typeof v === 'string' ? /^(y|yes|true)$/i.test(v.trim()) : v);

export interface IProduct extends Document {
  // Basic data
  name: string;
  sku: string; // Unique Identifier
  category: mongoose.Types.ObjectId;
  uom: string; // Unit of Measure (kg, pcs, box)
  barcode?: string;
  description?: string;
  image?: string;
  productType?: (typeof PRODUCT_TYPES)[number];
  grossWeight?: number; // kg
  netWeight?: number; // kg
  oemName?: string;
  oemPartNumber?: string;
  bomId?: mongoose.Types.ObjectId;
  hsnCode?: string;
  gstRate?: number;
  tcsGoods?: string;
  tcsRate?: number;
  price?: number;
  minSellingPrice?: number; // MSP: an order line below it needs a Manager/Admin to approve the margin
  // Plant data
  plant?: string;
  mrpType: string;
  minStockLevel: number; // reorder point
  safetyStock: number;
  plannedDeliveryDays?: number;
  storageBin?: string;
  batchManaged: boolean;
  // Accounting
  valuationClass?: string;
  priceControl: string;
  purchasePrice?: number;
  isActive: boolean;
  // Item master details. Stored and shown on the Item screen; not yet used by POs, GRNs, SOs or postings (see docs/Pending-UI-and-API.md).
  remarks?: string;
  deactivatedFrom?: Date; // inactive from this date (isActive stays the switch used today)
  stockType: (typeof STOCK_TYPES)[number]; // NON_STOCK items (consumables, services) are not meant to carry stock
  includeInValuation: boolean;
  isScrap: boolean;
  rackNo?: string;
  salesUom?: string; // unit the item is sold in, e.g. box
  salesConversion: number; // stock units in one sales unit, e.g. 50 pcs in a box
  purchaseUom?: string;
  purchaseConversion: number; // stock units in one purchase unit
  salesAccount?: string; // ledger code sales of this item post to
  purchaseAccount?: string; // ledger code purchases of this item post to
  hsnDescription?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true },
    sku: { type: String, required: true, unique: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    uom: { type: String, required: true, default: 'pcs', set: unit },
    barcode: { type: String },
    description: { type: String },
    image: { type: String },
    minStockLevel: { type: Number, default: 0 },
    price: { type: Number, default: 0, min: 0 },
    minSellingPrice: { type: Number, min: 0 },
    purchasePrice: { type: Number, default: 0, min: 0 },
    productType: {
      type: String,
      enum: PRODUCT_TYPES,
      default: 'FINISHED_GOOD',
      set: productType
    },
    grossWeight: { type: Number, min: 0 },
    netWeight: {
      type: Number,
      min: 0,
      validate: {
        // On updates `this` is the query (no grossWeight), so the check runs on create and save.
        validator: function (this: any, v: number) { return v == null || this?.grossWeight == null || v <= this.grossWeight; },
        message: 'Net weight cannot be more than gross weight.'
      }
    },
    oemName: { type: String, trim: true },
    oemPartNumber: { type: String, trim: true },
    bomId: { type: Schema.Types.ObjectId, ref: 'BillOfMaterials' },
    hsnCode: { type: String, trim: true },
    gstRate: { type: Number, default: 18, min: 0 },
    tcsGoods: { type: String, default: '' }, // goods under section 206C(1) (see lib/tcs), or none
    tcsRate: { type: Number, default: 0, min: 0 },
    plant: { type: String, set: code },
    mrpType: { type: String, enum: Object.keys(MRP_TYPES), default: 'PD', set: code },
    safetyStock: { type: Number, default: 0, min: 0 },
    plannedDeliveryDays: { type: Number, min: 0 },
    storageBin: { type: String, trim: true },
    batchManaged: { type: Boolean, default: true, set: yesNo },
    valuationClass: { type: String, set: code },
    priceControl: { type: String, enum: Object.keys(PRICE_CONTROLS), default: 'V', set: code },
    isActive: { type: Boolean, default: true },
    remarks: { type: String, trim: true },
    deactivatedFrom: { type: Date },
    stockType: { type: String, enum: STOCK_TYPES, default: 'STOCKABLE' },
    includeInValuation: { type: Boolean, default: true, set: yesNo },
    isScrap: { type: Boolean, default: false, set: yesNo },
    rackNo: { type: String, trim: true },
    salesUom: { type: String, trim: true, set: unit },
    salesConversion: { type: Number, default: 1, min: [0.000001, 'Sales conversion must be more than zero.'] },
    purchaseUom: { type: String, trim: true, set: unit },
    purchaseConversion: { type: Number, default: 1, min: [0.000001, 'Purchase conversion must be more than zero.'] },
    salesAccount: { type: String, trim: true },
    purchaseAccount: { type: String, trim: true },
    hsnDescription: { type: String, trim: true },
  },
  { timestamps: true }
);

// Indexing for search performance
ProductSchema.index({ name: 'text', sku: 'text', barcode: 'text' });
ProductSchema.index({ oemPartNumber: 1 });

export default mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);
