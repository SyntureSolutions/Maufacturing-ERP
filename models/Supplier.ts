import mongoose, { Schema, Document } from 'mongoose';

// Layout follows the ERP Vendor Master Template: general data (LFA1), company code data (LFB1) and
// purchasing org data (LFM1). Prodexa runs one company and one purchasing org, so all sit on the supplier.
// Template column -> field: Vendor ID = code, Vendor Name 1 = name, Street Address = address.
// Indian tax numbers go to pan / gstin (gstin drives the GST state); a foreign vendor's go to taxId / vatNumber.
export const VENDOR_ACCOUNT_GROUPS = ['DOMESTIC', 'FOREIGN', 'SERVICE_PROVIDER', 'ONE_TIME'] as const;
export const VENDOR_ACCOUNT_GROUP_LABELS: Record<(typeof VENDOR_ACCOUNT_GROUPS)[number], string> = {
  DOMESTIC: 'Domestic Supplier', FOREIGN: 'Foreign Supplier', SERVICE_PROVIDER: 'Service Provider', ONE_TIME: 'One-Time Vendor',
};
// Drop-down lists from the template's hidden Reference_Data tab. Payment terms are not enforced (existing suppliers use others).
export const TEMPLATE_VENDOR_PAYMENT_TERMS = ['Net 30', 'Net 60', '2% 10 Net 30', 'COD'] as const;
export const TEMPLATE_CURRENCIES = ['INR', 'USD', 'EUR'] as const;

// "211000 (Trade Payables)" as written in the template is stored as its code, 211000.
const code = (v: any) => (typeof v === 'string' ? v.split('(')[0].trim() : v);

export interface ISupplier extends Document {
  // General data
  name: string;
  name2?: string;
  code: string; // Unique Identifier
  accountGroup: (typeof VENDOR_ACCOUNT_GROUPS)[number];
  searchTerm?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  pincode?: string;
  region?: string;
  country: string;
  gstin?: string;
  gstRegistration?: string;    // REGISTERED, COMPOSITION, SEZ, UNREGISTERED, CONSUMER, OVERSEAS (see lib/partyMaster)
  constitution?: string;       // constitution of business
  distanceKm?: number | null;  // road distance from our works, filled into e-way bills
  pan?: string;
  taxId?: string;
  vatNumber?: string;
  bankDetails?: string;
  // Company code data
  companyCode?: string;
  reconciliationAccount?: string;
  paymentTerms?: string;
  paymentMethod?: string;
  toleranceGroup?: string;
  withholdingTaxCode?: string;
  // Purchasing org data
  purchasingOrg?: string;
  orderCurrency: string;
  incoterm?: string;
  minOrderValue?: number;
  pricingSchemaGroup?: string;
  orderingAddress?: string; // partner vendor code
  invoicingParty?: string; // partner vendor code
  performanceRating?: number;
  certifications?: string[];
  leadTime?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierSchema = new Schema<ISupplier>(
  {
    name: { type: String, required: true },
    name2: { type: String, trim: true },
    code: { type: String, required: true, unique: true },
    accountGroup: { type: String, enum: VENDOR_ACCOUNT_GROUPS, default: 'DOMESTIC' },
    searchTerm: { type: String, trim: true, uppercase: true },
    contactPerson: { type: String },
    email: { type: String },
    phone: { type: String },
    address: { type: String },
    city: { type: String, trim: true },
    pincode: { type: String, trim: true },
    region: { type: String, trim: true, uppercase: true },
    country: { type: String, default: 'IN', uppercase: true, minlength: 2, maxlength: 2 },
    gstin: { type: String },
    gstRegistration: { type: String, enum: ['REGISTERED', 'COMPOSITION', 'SEZ', 'UNREGISTERED', 'CONSUMER', 'OVERSEAS'] },
    constitution: { type: String },
    distanceKm: { type: Number, min: 0, max: 4000 },
    pan: { type: String },
    taxId: { type: String, trim: true },
    vatNumber: { type: String, trim: true },
    bankDetails: { type: String },
    companyCode: { type: String, trim: true },
    reconciliationAccount: { type: String, set: code },
    paymentTerms: { type: String },
    paymentMethod: { type: String, trim: true },
    toleranceGroup: { type: String, trim: true, uppercase: true },
    withholdingTaxCode: { type: String, trim: true, uppercase: true },
    purchasingOrg: { type: String, set: code },
    orderCurrency: { type: String, default: 'INR', uppercase: true, match: /^[A-Z]{3}$/ },
    incoterm: { type: String, trim: true, uppercase: true },
    minOrderValue: { type: Number, min: 0 },
    pricingSchemaGroup: { type: String, trim: true, uppercase: true },
    orderingAddress: { type: String, trim: true },
    invoicingParty: { type: String, trim: true },
    performanceRating: { type: Number },
    certifications: [{ type: String }],
    leadTime: { type: Number }, // in days
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SupplierSchema.index({ searchTerm: 1 });

export default mongoose.models.Supplier || mongoose.model<ISupplier>('Supplier', SupplierSchema);
