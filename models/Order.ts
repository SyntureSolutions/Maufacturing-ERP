import mongoose, { Schema, Document } from 'mongoose';

export interface IOrder extends Document {
  orderNumber: string;
  customerName: string;
  shippingAddress: string;
  items: {
    product: mongoose.Types.ObjectId;
    quantity: number;
    price: number;
  }[];
  allocations: {
    batch: mongoose.Types.ObjectId;
    quantity: number;
  }[];
  customer?: mongoose.Types.ObjectId;
  salesOrder?: mongoose.Types.ObjectId;
  taxDetails?: any;
  invoiceNumber?: string;
  paymentStatus?: 'PENDING' | 'PARTIAL' | 'PAID';
  totalAmount: number;
  status: 'PENDING' | 'ALLOCATED' | 'PICKED' | 'SHIPPED' | 'CANCELLED';
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true },
    customerName: { type: String, required: true },
    shippingAddress: { type: String, required: true },
    items: [
      {
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 },
      },
    ],
    allocations: [
      {
        batch: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
        quantity: { type: Number, required: true, min: 1 },
      },
    ],
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
    taxDetails: { type: Schema.Types.Mixed },
    invoiceNumber: { type: String },
    paymentStatus: { type: String, enum: ['PENDING', 'PARTIAL', 'PAID'], default: 'PENDING' },
    totalAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['PENDING', 'ALLOCATED', 'PICKED', 'SHIPPED', 'CANCELLED'],
      default: 'PENDING',
    },
  },
  { timestamps: true }
);

export default mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema);
