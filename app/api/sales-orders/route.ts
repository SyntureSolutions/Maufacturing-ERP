import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SalesOrder from '@/models/SalesOrder';
import { verifyAuth } from '@/lib/auth';
import mongoose from 'mongoose';
import Customer from '@/models/Customer';
import Product from '@/models/Product';
import { HttpError, statusOf } from '@/lib/httpError';
import { logAuditEvent } from '@/lib/audit';
import { sanitizeListForViewer } from '@/lib/pii';
import { createNumbered } from '@/lib/docNumber';
import { assertItemsActive } from '@/lib/itemRules';
import { applyDiscount, chargesTotal, cleanCharges } from '@/lib/docCharges';

/** Who may raise a sales order by hand. */
const SO_CREATE_ROLES = ['ADMIN', 'MANAGER', 'SALES'];

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const orders = await SalesOrder.find({})
      .populate('customer', 'name code creditLimit')
      .populate('items.product', 'name sku price')
      .sort({ createdAt: -1 });
    return NextResponse.json(sanitizeListForViewer(orders, user.role));
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role === 'VIEWER') return NextResponse.json({ error: 'Forbidden: Executive Viewer has read-only access' }, { status: 403 });
    if (!SO_CREATE_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { customer, customerName, quotationRef, poNumber, items, paymentTerms, deliveryDate, charges: rawCharges } = await req.json();
    if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'Sales Order must contain at least 1 item');
    await dbConnect();

    // The customer must be a real one (or at least named); the credit check happens when the order is approved
    let custId: any, custName = String(customerName || '').trim();
    if (customer) {
      if (!mongoose.isValidObjectId(String(customer))) throw new HttpError(400, 'Choose a valid customer.');
      const c: any = await Customer.findById(customer).select('name').lean();
      if (!c) throw new HttpError(404, 'Customer not found.');
      custId = c._id; custName = c.name;
    }
    if (!custName) throw new HttpError(400, 'Choose a customer.');

    // Lines: real products, positive quantities, non-negative prices; line and order totals are worked out here, not trusted from the request
    await assertItemsActive(items.map((i: any) => i?.product).filter((p: any) => mongoose.isValidObjectId(String(p))), 'sales order');
    const products: any[] = await Product.find({ _id: { $in: items.map((i: any) => i?.product).filter((p: any) => mongoose.isValidObjectId(String(p))) } }).select('price').lean();
    const clean = items.map((raw: any, n: number) => {
      const prod = products.find(p => String(p._id) === String(raw?.product));
      if (!prod) throw new HttpError(400, `Line ${n + 1}: choose a product that exists.`);
      const quantity = Number(raw.quantity);
      const unitPrice = raw.unitPrice === undefined || raw.unitPrice === '' ? Number(prod.price) : Number(raw.unitPrice);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpError(400, `Line ${n + 1}: quantity must be more than zero.`);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new HttpError(400, `Line ${n + 1}: enter a valid unit price.`);
      // a discount makes the unit price the net rate; the list rate and % are kept to show
      const disc = applyDiscount({ unitPrice, discountPercent: raw.discountPercent }, `Line ${n + 1}`);
      const line: any = { product: prod._id, quantity, unitPrice: disc.unitPrice, totalPrice: Math.round(quantity * disc.unitPrice * 100) / 100 };
      if (disc.discountPercent) { line.listPrice = disc.listPrice; line.discountPercent = disc.discountPercent; }
      if (raw.lineNo !== undefined && raw.lineNo !== '') {
        line.lineNo = Number(raw.lineNo);
        if (!Number.isInteger(line.lineNo) || line.lineNo <= 0) throw new HttpError(400, `Line ${n + 1}: line number must be a positive whole number.`);
      }
      if (raw.requiredDeliveryDate) {
        line.requiredDeliveryDate = new Date(raw.requiredDeliveryDate);
        if (isNaN(+line.requiredDeliveryDate)) throw new HttpError(400, `Line ${n + 1}: delivery date is not a valid date.`);
      }
      return line;
    });
    const orderDate = deliveryDate ? new Date(deliveryDate) : undefined;
    if (orderDate && isNaN(+orderDate)) throw new HttpError(400, 'Delivery date is not a valid date.');
    const charges = cleanCharges(rawCharges);
    const totalAmount = Math.round((clean.reduce((s: number, i: any) => s + i.totalPrice, 0) + chargesTotal(charges)) * 100) / 100;

    const newSO: any = await createNumbered(SalesOrder, 'SO', 'soNumber', (soNumber) => SalesOrder.create({
      soNumber, customer: custId, customerName: custName, quotationRef, poNumber, items: clean, charges, totalAmount, deliveryDate: orderDate,
      paymentTerms: paymentTerms || 'NET 30',
      status: 'DRAFT', // no inventory reserved until approved
    }));
    await logAuditEvent({
      userId: user.id, userName: user.name, userRole: user.role, action: 'CREATE', resource: 'SALES_ORDER', resourceId: String(newSO._id),
      resourceName: `${newSO.soNumber} - ${custName}`, details: `Created Sales Order with ${clean.length} item(s). Total: ₹${totalAmount.toLocaleString('en-IN')}.`,
    });
    return NextResponse.json(newSO, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: statusOf(error) });
  }
}
