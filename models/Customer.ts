import mongoose, { Schema, Document } from 'mongoose';

// Layout follows the ERP Customer Master Template: general data (KNA1), company code data (KNB1)
// and sales area data (KNVV). Prodexa runs one company, so company code fields sit on the customer.
export const ACCOUNT_GROUPS = ['SOLD_TO', 'SHIP_TO', 'BILL_TO', 'PAYER'] as const;
export const ACCOUNT_GROUP_LABELS: Record<(typeof ACCOUNT_GROUPS)[number], string> = {
  SOLD_TO: 'Sold-To Party', SHIP_TO: 'Ship-To Party', BILL_TO: 'Bill-To Party', PAYER: 'Payer',
};
// Drop-down lists from the template's hidden Reference_Data tab. Codes are stored; labels are for display.
export const SALES_ORGS: Record<string, string> = { SO01: 'North Region', SO02: 'South Region', SO03: 'Export' };
export const DISTRIBUTION_CHANNELS: Record<string, string> = { '01': 'Direct Sales', '02': 'Wholesale', '03': 'Retail' };
export const DIVISIONS: Record<string, string> = { HV: 'HVAC', LT: 'Lighting', SV: 'Services' };
// Template payment terms. Not enforced on the schema: existing customers use other terms (Net 15, Net 45, Immediate).
export const TEMPLATE_PAYMENT_TERMS = ['Net 30', 'Net 60', 'Pay in Advance', 'COD'] as const;

// "121000 (Trade Receivables)" as written in the template is stored as its code, 121000.
const code = (v: any) => (typeof v === 'string' ? v.split('(')[0].trim() : v);

export interface ISalesArea {
  salesOrg: string;
  distributionChannel: string;
  division: string;
  salesDistrict?: string;
  pricingProcedure?: string;
  shippingConditions?: string;
  incoterm?: string;
}

export interface ICustomer extends Document {
  // General data
  name: string;
  code: string;
  accountGroup: (typeof ACCOUNT_GROUPS)[number];
  searchTerm?: string;
  gstin?: string;
  gstRegistration?: string;    // REGISTERED, COMPOSITION, SEZ, UNREGISTERED, CONSUMER, OVERSEAS (see lib/partyMaster)
  constitution?: string;       // constitution of business
  distanceKm?: number | null;  // road distance from our works, filled into e-way bills
  pan?: string;
  tcsDeclaration27C?: boolean; // buyer has declared (Form 27C) the goods are for manufacturing: no TCS
  taxId?: string; // a foreign customer's tax id (Indian customers use pan)
  contactPerson?: string;
  email?: string;
  phone?: string;
  billingAddress: string;
  city?: string;
  pincode?: string;
  region?: string;
  country: string;
  stateCode?: string;
  shippingAddresses: string[];
  // Company code data
  companyCode?: string;
  reconciliationAccount?: string;
  paymentTerms?: string;
  paymentMethod?: string;
  dunningProcedure?: string;
  creditLimit?: number;
  // Sales area data
  salesAreas: ISalesArea[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SalesAreaSchema = new Schema<ISalesArea>(
  {
    salesOrg: { type: String, required: true, enum: Object.keys(SALES_ORGS) },
    distributionChannel: { type: String, required: true, enum: Object.keys(DISTRIBUTION_CHANNELS) },
    division: { type: String, required: true, enum: Object.keys(DIVISIONS) },
    salesDistrict: { type: String, trim: true },
    pricingProcedure: { type: String, trim: true },
    shippingConditions: { type: String, trim: true },
    incoterm: { type: String, trim: true, uppercase: true },
  },
  { _id: false }
);

const CustomerSchema = new Schema<ICustomer>(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    accountGroup: { type: String, enum: ACCOUNT_GROUPS, default: 'SOLD_TO' },
    searchTerm: { type: String, trim: true, uppercase: true },
    gstin: { type: String },
    gstRegistration: { type: String, enum: ['REGISTERED', 'COMPOSITION', 'SEZ', 'UNREGISTERED', 'CONSUMER', 'OVERSEAS'] },
    constitution: { type: String },
    distanceKm: { type: Number, min: 0, max: 4000 },
    pan: { type: String, uppercase: true },
    tcsDeclaration27C: { type: Boolean, default: false },
    taxId: { type: String, trim: true },
    contactPerson: { type: String },
    email: { type: String },
    phone: { type: String },
    billingAddress: { type: String, required: true },
    city: { type: String },
    pincode: { type: String },
    region: { type: String, trim: true, uppercase: true },
    country: { type: String, default: 'IN', uppercase: true, minlength: 2, maxlength: 2 },
    stateCode: { type: String },
    shippingAddresses: [{ type: String }],
    companyCode: { type: String, trim: true },
    reconciliationAccount: { type: String, set: code },
    paymentTerms: { type: String },
    paymentMethod: { type: String, trim: true },
    dunningProcedure: { type: String, set: code },
    creditLimit: { type: Number, min: 0 },
    salesAreas: { type: [SalesAreaSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CustomerSchema.index({ searchTerm: 1 });

export default mongoose.models.Customer || mongoose.model<ICustomer>('Customer', CustomerSchema);
