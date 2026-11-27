import mongoose, { Schema, Document } from 'mongoose';
import { lineNumbersHook } from '@/lib/lineNumbers';

// A purchase requisition (indent) line this PO line orders, and how much of it.
export interface IPOLineSource {
  indent: mongoose.Types.ObjectId;
  lineNo: number;
  quantity: number;
}

export interface IPurchaseOrderItem {
  lineNo?: number; // 10, 20, 30...
  product: mongoose.Types.ObjectId;
  deliveryDate?: Date; // this line's own due date, if it differs; the PO's expectedDeliveryDate is the earliest such date
  sources?: IPOLineSource[];
  quantity: number;          // always in the item's stock unit
  // when ordered in the item's purchase unit (e.g. bag = 25 kg): that unit and how many stock units are in one.
  // quantity and unitPrice stay in stock units; the supplier sees quantity / factor at unitPrice x factor.
  orderUnit?: string;
  orderFactor?: number;
  receivedQuantity?: number;
  billedQuantity?: number; // quantity the vendor has billed us for (set when a vendor bill is booked)
  unitPrice: number;          // net rate (after the line discount), in stock units
  listPrice?: number;         // rate before the discount, when there is one
  discountPercent?: number;
  totalPrice: number;
  originalUnitPrice?: number;
  negotiatedUnitPrice?: number;
  negotiatedTotalPrice?: number;
}

export type NegotiationStatus = 'NONE' | 'IN_NEGOTIATION' | 'AGREED' | 'REJECTED';

export interface IPurchaseOrder extends Document {
  charges?: { label: string; amount: number }[];
  poNumber: string;
  supplier: mongoose.Types.ObjectId;
  items: IPurchaseOrderItem[];
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
  sourceType: 'MRP_AUTO' | 'MANUAL';
  totalAmount: number;
  orderDate: Date;
  receivedDate?: Date;
  expectedDeliveryDate?: Date;
  project?: mongoose.Types.ObjectId;
  mrpRun?: mongoose.Types.ObjectId;
  salesOrder?: mongoose.Types.ObjectId; // customer order the materials were bought for
  qualityCheckRequired?: boolean;
  notes?: string;
  // Negotiation tracking fields for Finance Manager
  negotiationStatus: NegotiationStatus;
  originalAmount?: number;
  negotiatedAmount?: number;
  savingsAmount?: number;
  savingsPercentage?: number;
  negotiationNotes?: string;
  negotiationAgreedAt?: Date;
  negotiationAgreedBy?: string;
  negotiationHistory?: {
    proposedBy: string;
    proposedDate: Date;
    counterPrice: number;
    status: string;
    notes?: string;
  }[];
  // Approval Tiering
  approvalRequiredRole?: 'SUPPLY_CHAIN_MANAGER' | 'FINANCE_MANAGER' | 'ADMIN';
  approvalTier?: 'TIER_1_SUPPLY_CHAIN' | 'TIER_2_FINANCE' | 'TIER_3_EXECUTIVE';
  approvedBy?: {
    name: string;
    role: string;
    date: Date;
  };
  dispatch?: { at?: Date; by?: string; channels?: string[]; ackToken?: string; ackAt?: Date; ackBy?: string; lastAttemptDelivered?: boolean };
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseOrderItemSchema = new Schema<IPurchaseOrderItem>({
  lineNo: { type: Number, min: 1 },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  deliveryDate: { type: Date },
  sources: [{
    indent: { type: Schema.Types.ObjectId, ref: 'PurchaseIndent', required: true },
    lineNo: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 0.0001 },
    _id: false,
  }],
  quantity: { type: Number, required: true, min: 0.0001 },
  orderUnit: String,
  orderFactor: { type: Number, min: 0.000001 },
  receivedQuantity: { type: Number, default: 0 },
  billedQuantity: { type: Number, default: 0 },
  unitPrice: { type: Number, required: true, min: 0 },
  listPrice: { type: Number, min: 0 },
  discountPercent: { type: Number, min: 0, max: 99.99 },
  totalPrice: { type: Number, required: true, min: 0 },
  originalUnitPrice: { type: Number },
  negotiatedUnitPrice: { type: Number },
  negotiatedTotalPrice: { type: Number }
});

const PurchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    poNumber: { type: String, required: true, unique: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    items: [PurchaseOrderItemSchema],
    charges: [{ label: { type: String, required: true }, amount: { type: Number, required: true, min: 0 }, _id: false }], // freight, packing & forwarding... before GST
    status: { 
      type: String, 
      enum: ['DRAFT', 'PENDING_APPROVAL', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'], 
      default: 'DRAFT' 
    },
    sourceType: {
      type: String,
      enum: ['MRP_AUTO', 'MANUAL'],
      default: 'MANUAL'
    },
    totalAmount: { type: Number, required: true, default: 0 },
    orderDate: { type: Date, default: Date.now },
    receivedDate: { type: Date },
    expectedDeliveryDate: { type: Date },
    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    mrpRun: { type: Schema.Types.ObjectId, ref: 'MRPRun' },
    salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder', index: true },
    qualityCheckRequired: { type: Boolean, default: false },
    notes: { type: String },
    negotiationStatus: {
      type: String,
      enum: ['NONE', 'IN_NEGOTIATION', 'AGREED', 'REJECTED'],
      default: 'NONE'
    },
    originalAmount: { type: Number },
    negotiatedAmount: { type: Number },
    savingsAmount: { type: Number, default: 0 },
    savingsPercentage: { type: Number, default: 0 },
    negotiationNotes: { type: String },
    negotiationAgreedAt: { type: Date },
    negotiationAgreedBy: { type: String },
    negotiationHistory: [
      {
        proposedBy: { type: String },
        proposedDate: { type: Date, default: Date.now },
        counterPrice: { type: Number },
        status: { type: String },
        notes: { type: String }
      }
    ],
    approvalRequiredRole: {
      type: String,
      enum: ['SUPPLY_CHAIN_MANAGER', 'FINANCE_MANAGER', 'ADMIN'],
      default: 'SUPPLY_CHAIN_MANAGER'
    },
    approvalTier: {
      type: String,
      enum: ['TIER_1_SUPPLY_CHAIN', 'TIER_2_FINANCE', 'TIER_3_EXECUTIVE'],
      default: 'TIER_1_SUPPLY_CHAIN'
    },
    dispatch: { at: Date, by: String, channels: [String], ackToken: { type: String, index: true }, ackAt: Date, ackBy: String, lastAttemptDelivered: Boolean },
    approvedBy: {
      name: { type: String },
      role: { type: String },
      date: { type: Date }
    }
  },
  { timestamps: true }
);

PurchaseOrderSchema.pre('validate', function () {
  lineNumbersHook.call(this);
  // The PO is due when its first dated line is due. A line with no date of its own is due with the PO (see lineDueDate).
  const dates = ((this as any).items || []).map((i: any) => i.deliveryDate).filter(Boolean).map((d: Date) => new Date(d).getTime());
  if (dates.length) (this as any).expectedDeliveryDate = new Date(Math.min(...dates));
});
PurchaseOrderSchema.index({ 'items.sources.indent': 1 });

export default mongoose.models.PurchaseOrder || mongoose.model<IPurchaseOrder>('PurchaseOrder', PurchaseOrderSchema);
