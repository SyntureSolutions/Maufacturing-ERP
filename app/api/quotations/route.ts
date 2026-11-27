import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Quotation from '@/models/Quotation';
import Customer from '@/models/Customer';
import { verifyAuth } from '@/lib/auth';
import mongoose from 'mongoose';
import { demoMode, demoOrThrow } from '@/lib/demoMode';
import { HttpError, statusOf } from '@/lib/httpError';
import { createNumbered } from '@/lib/docNumber';
import { logAuditEvent } from '@/lib/audit';
import { applyQuoteContent, QUOTE_EDIT_ROLES } from '@/lib/quotationRevision';

export const SAMPLE_QUOTATIONS = [
  {
    _id: 'qt-101',
    quoteNumber: 'QT-2026-101',
    enquiryRef: 'ENQ-2026-001',
    customerName: 'Decathlon Retail India',
    customerCreditLimit: 2500000,
    currentBalance: 850000,
    items: [
      { productName: 'Apex Urban Commuter Bicycle', quantity: 50, unitPrice: 18500, totalPrice: 925000 }
    ],
    totalAmount: 925000,
    paymentTerms: 'NET 45',
    stage: 'ENQUIRY_RECEIVED',
    creditCheckPassed: false,
    createdAt: new Date('2026-04-10T08:00:00Z').toISOString(),
  },
  {
    _id: 'qt-102',
    quoteNumber: 'QT-2026-102',
    enquiryRef: 'ENQ-2026-002',
    customerName: 'Metro Wheels & Distributors',
    customerCreditLimit: 1500000,
    currentBalance: 400000,
    items: [
      { productName: 'Velocity Trail Mountain Bike 29er', quantity: 20, unitPrice: 32000, totalPrice: 640000 },
      { productName: 'E-Glide Electric Hybrid Bike 250W', quantity: 10, unitPrice: 48000, totalPrice: 480000 }
    ],
    totalAmount: 1120000,
    paymentTerms: '50% Advance, 50% on Delivery',
    stage: 'QUOTATION_SENT',
    creditCheckPassed: true,
    validUntil: new Date('2026-05-15').toISOString(),
    createdAt: new Date('2026-04-08T11:20:00Z').toISOString(),
  },
  {
    _id: 'qt-103',
    quoteNumber: 'QT-2026-103',
    enquiryRef: 'ENQ-2026-003',
    customerName: 'National Sports Logistics Ltd',
    customerCreditLimit: 3000000,
    currentBalance: 1200000,
    items: [
      { productName: 'AeroPro Carbon Road Bike', quantity: 15, unitPrice: 65000, totalPrice: 975000 }
    ],
    totalAmount: 975000,
    paymentTerms: 'NET 30',
    stage: 'UNDER_REVIEW',
    creditCheckPassed: true,
    validUntil: new Date('2026-05-01').toISOString(),
    createdAt: new Date('2026-04-05T14:10:00Z').toISOString(),
  },
  {
    _id: 'qt-104',
    quoteNumber: 'QT-2026-104',
    customerName: 'ProBike Wholesale Chain',
    customerCreditLimit: 800000,
    currentBalance: 750000,
    items: [
      { productName: 'Apex Urban Commuter Bicycle', quantity: 30, unitPrice: 18500, totalPrice: 555000 }
    ],
    totalAmount: 555000,
    paymentTerms: 'NET 15',
    stage: 'PO_RECEIVED',
    poNumber: 'PO-PB-2026-88',
    creditCheckPassed: true,
    salesOrderRef: 'SO-2026-001',
    createdAt: new Date('2026-04-01T09:30:00Z').toISOString(),
  },
  {
    _id: 'qt-105',
    quoteNumber: 'QT-2026-105',
    customerName: 'Apex Speed Cycles Gujarat',
    customerCreditLimit: 500000,
    currentBalance: 480000,
    items: [
      { productName: 'E-Glide Electric Hybrid Bike 250W', quantity: 8, unitPrice: 48000, totalPrice: 384000 }
    ],
    totalAmount: 384000,
    paymentTerms: 'Immediate Bank Transfer',
    stage: 'LOST_DECLINED',
    lossReason: 'Competitor offered lower lead time (3 days vs 14 days)',
    createdAt: new Date('2026-03-28T16:45:00Z').toISOString(),
  },
];

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      await dbConnect();
      const quotations = await Quotation.find({}).sort({ updatedAt: -1 });
      // sample quotations only in DEMO_MODE: their ids are not real, so they cannot be opened or won
      if (quotations.length > 0 || !demoMode()) return NextResponse.json(quotations);
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample quotations only in DEMO_MODE
    }

    return NextResponse.json(SAMPLE_QUOTATIONS);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!QUOTE_EDIT_ROLES.includes(user.role)) return NextResponse.json({ error: 'Only Admin, Manager or Sales can make quotations.' }, { status: 403 });
    const b = await req.json().catch(() => null);
    if (!b || typeof b !== 'object') throw new HttpError(400, 'Send the quotation as a JSON object.');
    await dbConnect();

    // a registered customer, or at least a name for a prospect who is not a customer yet
    let customer: any = null;
    if (b.customer) {
      if (!mongoose.isValidObjectId(String(b.customer))) throw new HttpError(400, 'Choose a valid customer.');
      customer = await Customer.findById(b.customer).select('name paymentTerms').lean();
      if (!customer) throw new HttpError(404, 'Customer not found.');
    }
    const customerName = String(customer?.name || b.customerName || '').trim();
    if (!customerName) throw new HttpError(400, 'Choose the customer, or type the name of the prospect.');

    const quote: any = new Quotation({
      customer: customer?._id, customerName, enquiryRef: b.enquiryRef || undefined, stage: 'ENQUIRY_RECEIVED', creditCheckPassed: false,
      paymentTerms: b.paymentTerms || customer?.paymentTerms || 'NET 30', revision: 1,
    });
    await applyQuoteContent(quote, b); // lines, totals and GST are worked out here, never taken from the request
    const saved: any = await createNumbered(Quotation, 'QT', 'quoteNumber', async (quoteNumber) => { quote.quoteNumber = quoteNumber; return quote.save(); });
    await logAuditEvent({
      userId: user.id, userName: user.name, userRole: user.role, action: 'CREATE', resource: 'Quotation', resourceId: String(saved._id),
      resourceName: `${saved.quoteNumber} - ${customerName}`, details: `Quotation for ₹${saved.totalAmount.toLocaleString('en-IN')} with ${saved.items.length} item(s).`,
    });
    return NextResponse.json(saved, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: statusOf(error) }); // nothing is reported as saved unless it was
  }
}
