import mongoose, { Schema, Document } from 'mongoose';

export type ShipmentOrderType = 'PURCHASE_ORDER' | 'SALES_ORDER';
export type DelayReasonCode = 
  | 'CUSTOMS_HOLD' 
  | 'WEATHER_ROAD_BLOCK' 
  | 'CARRIER_BREAKDOWN' 
  | 'TRAFFIC_CONGESTION' 
  | 'DOCK_CONGESTION' 
  | 'DOCUMENTATION_PENDING';

export interface IShipmentCargoItem {
  productName: string;
  sku?: string;
  quantity: number;
  unitCost?: number;
  uom?: string;
}

export interface IShipment extends Document {
  trackingNumber: string;
  order?: mongoose.Types.ObjectId;
  orderType: ShipmentOrderType;
  orderNumber: string; // e.g. PO-2026-0042 or SO-2026-003
  entityName: string; // Supplier name or Customer name
  items: IShipmentCargoItem[];
  type: 'INBOUND' | 'OUTBOUND';
  carrier: string;
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  origin: string;
  destination: string;
  dispatchDate?: Date;
  expectedDeliveryDate?: Date;
  revisedETA?: Date;
  actualDeliveryDate?: Date;
  status: 'PREPARING' | 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED' | 'DELAYED' | 'RETURNED';
  ewayBillNumber?: string;
  shippingCost: number;

  // Delay tracking
  delayReasonCode?: DelayReasonCode;
  delayDetails?: string;

  // Proof of Delivery (POD)
  podReceiverName?: string;
  podReceiverPhone?: string;
  podSignature?: string;
  podTimestamp?: Date;
  podNotes?: string;

  // Auto-GRN integration for inbound shipments
  grnGenerated?: boolean;
  grnBatchNumbers?: string[];

  createdAt: Date;
  updatedAt: Date;
}

const ShipmentCargoItemSchema = new Schema<IShipmentCargoItem>(
  {
    productName: { type: String, required: true },
    sku: { type: String },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, default: 0 },
    uom: { type: String, default: 'units' }
  },
  { _id: false }
);

const ShipmentSchema = new Schema<IShipment>(
  {
    trackingNumber: { type: String, required: true, unique: true },
    order: { type: Schema.Types.ObjectId },
    orderType: { type: String, enum: ['PURCHASE_ORDER', 'SALES_ORDER'], default: 'PURCHASE_ORDER' },
    orderNumber: { type: String, required: true },
    entityName: { type: String, required: true },
    items: [ShipmentCargoItemSchema],
    type: { type: String, enum: ['INBOUND', 'OUTBOUND'], required: true },
    carrier: { type: String, required: true },
    vehicleNumber: { type: String },
    driverName: { type: String },
    driverPhone: { type: String },
    origin: { type: String, required: true },
    destination: { type: String, required: true },
    dispatchDate: { type: Date },
    expectedDeliveryDate: { type: Date },
    revisedETA: { type: Date },
    actualDeliveryDate: { type: Date },
    status: {
      type: String,
      enum: ['PREPARING', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'DELAYED', 'RETURNED'],
      default: 'PREPARING',
    },
    ewayBillNumber: { type: String },
    shippingCost: { type: Number, default: 0 },

    // Delay tracking
    delayReasonCode: {
      type: String,
      enum: [
        'CUSTOMS_HOLD',
        'WEATHER_ROAD_BLOCK',
        'CARRIER_BREAKDOWN',
        'TRAFFIC_CONGESTION',
        'DOCK_CONGESTION',
        'DOCUMENTATION_PENDING'
      ]
    },
    delayDetails: { type: String },

    // Proof of Delivery
    podReceiverName: { type: String },
    podReceiverPhone: { type: String },
    podSignature: { type: String },
    podTimestamp: { type: Date },
    podNotes: { type: String },

    // Auto-GRN integration
    grnGenerated: { type: Boolean, default: false },
    grnBatchNumbers: [{ type: String }]
  },
  { timestamps: true }
);

ShipmentSchema.index({ trackingNumber: 1 });
ShipmentSchema.index({ status: 1 });
ShipmentSchema.index({ orderNumber: 1 });

export default mongoose.models.Shipment || mongoose.model<IShipment>('Shipment', ShipmentSchema);
