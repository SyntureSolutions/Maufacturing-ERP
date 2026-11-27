import { statusOf } from '@/lib/httpError';
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Enquiry from '@/models/Enquiry';
import Quotation from '@/models/Quotation';
import Customer from '@/models/Customer';
import { verifyAuth } from '@/lib/auth';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const { unitPrice = 18500 } = body;

    const quoteNumber = `QT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      await dbConnect();
      const enquiry = await Enquiry.findById(id);
      if (enquiry) {
        if (enquiry.status !== 'NEW') return NextResponse.json({ error: enquiry.status === 'QUALIFIED' ? `${enquiry.enquiryNumber} has already been quoted (${enquiry.convertedQuotationRef || 'quotation'}).` : `${enquiry.enquiryNumber} is ${String(enquiry.status).toLowerCase()} and cannot be quoted.` }, { status: 409 });
        const claimed = await Enquiry.updateOne({ _id: enquiry._id, status: 'NEW' }, { $set: { status: 'QUALIFIED' } });
        if (!claimed.modifiedCount) return NextResponse.json({ error: 'The enquiry was changed by someone else. Reload and try again.' }, { status: 409 });
      }
      
      const customerName = enquiry ? enquiry.customerName : (body.customerName || 'Converted Lead');
      const enquiryItems = enquiry ? enquiry.items : (body.items || []);

      const items = enquiryItems.map((item: any) => ({
        productName: item.productName || 'Bicycle Unit',
        quantity: item.estimatedQuantity || item.quantity || 10,
        unitPrice: item.unitPrice || unitPrice,
        totalPrice: (item.estimatedQuantity || item.quantity || 10) * (item.unitPrice || unitPrice),
      }));

      const totalAmount = items.reduce((sum: number, i: any) => sum + i.totalPrice, 0);

      // Check if Customer exists or find one
      const existingCustomer = await Customer.findOne({ name: customerName });

      let newQuote: any;
      try {
      newQuote = await Quotation.create({
        quoteNumber,
        enquiryRef: enquiry ? enquiry.enquiryNumber : id,
        enquiry: enquiry ? enquiry._id : undefined,
        customer: existingCustomer ? existingCustomer._id : undefined,
        customerName,
        items,
        totalAmount,
        paymentTerms: 'NET 30',
        stage: 'ENQUIRY_RECEIVED',
        creditCheckPassed: false,
      });
      } catch (saveErr) {
        if (enquiry) await Enquiry.updateOne({ _id: enquiry._id, status: 'QUALIFIED' }, { $set: { status: 'NEW' } }).catch(() => {});
        throw saveErr;
      }

      if (enquiry) await Enquiry.updateOne({ _id: enquiry._id }, { $set: { convertedQuotationRef: quoteNumber } });

      return NextResponse.json({
        message: 'Enquiry converted to Deal Kanban successfully',
        quotation: newQuote,
      }, { status: 201 });
    } catch (dbErr) {
      throw dbErr; // never pretend an enquiry was converted
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: statusOf(error) });
  }
}
