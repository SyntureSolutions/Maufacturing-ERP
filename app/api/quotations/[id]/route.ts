import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { createNumbered } from '@/lib/docNumber';
import dbConnect from '@/lib/mongodb';
import Quotation from '@/models/Quotation';
import SalesOrder from '@/models/SalesOrder';
import Customer from '@/models/Customer';
import { verifyAuth } from '@/lib/auth';
import { HttpError, statusOf } from '@/lib/httpError';
import { applyQuoteContent, QUOTE_EDIT_ROLES, QUOTE_STAGE_ROLES } from '@/lib/quotationRevision';
import Enquiry from '@/models/Enquiry';
import { notify, companyName } from '@/lib/notify';
import { checkCredit, CREDIT_OVERRIDE_ROLES } from '@/lib/creditExposure';
import { logAuditEvent } from '@/lib/audit';

// One quotation with its customer and products, for the quotation's own page
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
    await dbConnect();
    const quote = await Quotation.findById(id)
      .populate('customer', 'name code gstin billingAddress city pincode stateCode country paymentTerms')
      .populate('items.product', 'name sku uom hsnCode gstRate')
      .lean();
    if (!quote) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
    return NextResponse.json(quote);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server Error' }, { status: statusOf(err) });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!QUOTE_STAGE_ROLES.includes(user.role)) return NextResponse.json({ error: 'You do not have permission to change quotations.' }, { status: 403 });

    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send the change as a JSON object.' }, { status: 400 });
    const { stage, poNumber, lossReason, bypassCreditCheck } = body;

    // Content (lines, customer, terms) changes in place only while the quotation has not been sent; after that it is revised
    const CONTENT = ['items', 'customer', 'customerName', 'paymentTerms', 'validUntil', 'terms', 'orderType', 'currency', 'exchangeRate', 'incoterm', 'portOfLoading', 'portOfDischarge', 'country', 'enquiryRef', 'placeOfSupply'];
    if (!stage && CONTENT.some(k => body[k] !== undefined)) {
      if (!QUOTE_EDIT_ROLES.includes(user.role)) return NextResponse.json({ error: 'Only Admin, Manager or Sales can change quotations.' }, { status: 403 });
      await dbConnect();
      const quote: any = await Quotation.findById(id);
      if (!quote) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
      if (quote.stage !== 'ENQUIRY_RECEIVED') throw new HttpError(409, `${quote.quoteNumber} has been sent. Change it by making a revision, so the customer's copy stays on record.`);
      if ((quote.discountRequests || []).at(-1)?.status === 'PENDING') throw new HttpError(409, 'A discount request is waiting for approval; decide it before changing the quotation.');
      if (body.customer !== undefined && String(body.customer || '') !== String(quote.customer || '')) {
        if (!body.customer) { quote.customer = undefined; }
        else {
          if (!mongoose.isValidObjectId(String(body.customer))) throw new HttpError(400, 'Choose a valid customer.');
          const c: any = await Customer.findById(body.customer).select('name').lean();
          if (!c) throw new HttpError(404, 'Customer not found.');
          quote.customer = c._id; quote.customerName = c.name;
        }
      }
      if (!quote.customer && body.customerName !== undefined) quote.customerName = String(body.customerName).trim();
      if (!quote.customerName) throw new HttpError(400, 'Choose the customer, or type the name of the prospect.');
      if (body.enquiryRef !== undefined) quote.enquiryRef = body.enquiryRef || undefined;
      await applyQuoteContent(quote, body);
      await quote.save();
      await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'EDIT', resource: 'Quotation', resourceId: id, resourceName: quote.quoteNumber, details: `Draft changed; total ₹${quote.totalAmount.toLocaleString('en-IN')}.` });
      return NextResponse.json({ quotation: quote, message: `Quotation ${quote.quoteNumber} saved.` });
    }

    const STAGES = ['ENQUIRY_RECEIVED', 'QUOTATION_SENT', 'UNDER_REVIEW', 'PO_RECEIVED', 'LOST_DECLINED'];
    if (stage !== undefined && !STAGES.includes(stage)) return NextResponse.json({ error: `Stage must be one of ${STAGES.join(', ')}.` }, { status: 400 });

    if (stage === 'LOST_DECLINED') {
      const categories = ['COMPETITOR', 'PRICE', 'LEAD_TIME', 'SPEC_MISMATCH', 'BUDGET_CANCELLED', 'OTHER'];
      if (!categories.includes(body.lossCategory) || typeof lossReason !== 'string' || !lossReason.trim()) {
        return NextResponse.json({ error: 'Select a reason category and enter a detailed reason before marking the quotation lost.' }, { status: 400 });
      }
    }

    let updatedQuote: any = null;
    let createdSalesOrder: any = null;
    const creditWarning: string | null = null;

    try {
      await dbConnect();
      const quote = await Quotation.findById(id);

      if (!quote) {
        return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
      }
      // A won quotation is final: it already has its sales order, and winning it again would make a second one
      if (stage && quote.stage === 'PO_RECEIVED') {
        return NextResponse.json({ error: `${quote.quoteNumber} is already won (sales order ${quote.salesOrderRef || 'raised'}).` }, { status: 409 });
      }

      // Handle Stage transitions
      if (stage) {
        if (stage === 'LOST_DECLINED') {
          quote.lossCategory = body.lossCategory;
          quote.lossReason = lossReason.trim();
        }
        // CREDIT GATE CHECK IF MOVING TO PO_RECEIVED
        if (stage === 'PO_RECEIVED') {
          const lastDiscount = (quote.discountRequests || []).at(-1);
          if (lastDiscount?.status === 'PENDING') return NextResponse.json({ error: 'A discount request on this quotation is waiting for approval. Approve or reject it before taking the order.' }, { status: 409 });
          // Credit gate: real exposure (unpaid invoices + approved orders not yet invoiced) plus this deal
          let bypassed = false;
          if (quote.customer) {
            const credit = await checkCredit(quote.customer, quote.totalAmount);
            if (credit.over) {
              if (!bypassCreditCheck) {
                return NextResponse.json({
                  error: `Credit limit exceeded! Customer Credit Limit: ₹${credit.limit.toLocaleString('en-IN')}, Total Exposure with this deal: ₹${credit.newTotal.toLocaleString('en-IN')} (₹${credit.receivable.toLocaleString('en-IN')} unpaid invoices + ₹${credit.openOrders.toLocaleString('en-IN')} open orders + this deal). Explicit approval required to bypass credit gate.`,
                  creditCheckFailed: true, creditLimit: credit.limit, exposure: credit.newTotal,
                }, { status: 422 });
              }
              if (!CREDIT_OVERRIDE_ROLES.includes(user.role)) {
                return NextResponse.json({ error: 'Only an Admin, Manager or Finance Manager can override the credit limit.' }, { status: 403 });
              }
              bypassed = true;
              await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'OVERRIDE', resource: 'Quotation', resourceId: id, resourceName: quote.quoteNumber || id, details: `Credit limit ₹${credit.limit} overridden: exposure with this deal ₹${credit.newTotal}.`, reason: String(body.bypassReason || '') });
            }
          }

          quote.creditCheckPassed = true;
          quote.creditCheckNotes = bypassed 
            ? 'Credit Gate overridden by Sales Manager authorization' 
            : 'Credit Gate check passed successfully';

          if (poNumber) quote.poNumber = poNumber;

          // An order line needs an item from the item master; a typed-in line has to be matched to one first
          const loose = quote.items.findIndex((i: any) => !i.product);
          if (loose >= 0) return NextResponse.json({ error: `Line ${loose + 1} (${quote.items[loose].productName}) is not linked to an item. Revise the quotation and choose the item before taking the order.` }, { status: 400 });

          // Claim the quotation first, so two people (or a double click) cannot each raise a sales order from it
          const claim = await Quotation.updateOne({ _id: quote._id, stage: { $ne: 'PO_RECEIVED' }, salesOrderRef: { $in: [null, ''] } }, { $set: { salesOrderRef: 'IN_PROGRESS' } });
          if (!claim.modifiedCount) return NextResponse.json({ error: `${quote.quoteNumber} is already being won by someone else, or already has a sales order.` }, { status: 409 });
          const release = () => Quotation.updateOne({ _id: quote._id, salesOrderRef: 'IN_PROGRESS' }, { $unset: { salesOrderRef: 1 } });

          // Workflow Step 3: Trigger DRAFT Sales Order Creation on PO Received
          const draftSO = await createNumbered(SalesOrder, 'SO', 'soNumber', (soNumber) => SalesOrder.create({
            soNumber,
            customer: quote.customer,
            customerName: quote.customerName,
            quotationRef: quote.quoteNumber,
            quotation: quote._id,
            poNumber: quote.poNumber || poNumber || `PO-${Date.now().toString().slice(-6)}`,
            items: quote.items.map((i: any) => ({
              product: i.product,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              listPrice: i.listPrice,
              discountPercent: i.discountPercent,
              totalPrice: i.totalPrice,
            })),
            charges: (quote.charges || []).map((c: any) => ({ label: c.label, amount: c.amount })),
            totalAmount: quote.totalAmount,
            paymentTerms: quote.paymentTerms,
            // Price and terms are frozen at conversion so the order matches what the customer accepted
            priceLocked: true,
            lockedAt: new Date(),
            terms: quote.terms,
            orderType: quote.orderType,
            currency: quote.currency,
            exchangeRate: quote.exchangeRate,
            incoterm: quote.incoterm,
            portOfLoading: quote.portOfLoading,
            portOfDischarge: quote.portOfDischarge,
            country: quote.country,
            status: 'DRAFT', // Explicit DRAFT status, NO inventory reservation yet!
            creditCheckPassed: true,
          })).catch(async (e: any) => { await release(); throw e; });

          quote.salesOrderRef = draftSO.soNumber;
          createdSalesOrder = draftSO;
        }

        quote.stage = stage;
      }

      await quote.save();
      updatedQuote = quote;

      if (createdSalesOrder && updatedQuote?.customer) {
        // Best-effort customer notification; never blocks the deal
        const c: any = await Customer.findById(updatedQuote.customer).lean();
        const vars = { orderNumber: createdSalesOrder.soNumber, customerName: c?.name, totalAmount: createdSalesOrder.totalAmount?.toLocaleString('en-IN'), deliveryDate: createdSalesOrder.deliveryDate ? new Date(createdSalesOrder.deliveryDate).toLocaleDateString('en-IN') : 'to be confirmed', companyName: await companyName() };
        await notify({ event: 'ORDER_CONFIRMATION', channel: 'EMAIL', to: c?.email, vars, refType: 'SALES_ORDER', refNumber: createdSalesOrder.soNumber });
        await notify({ event: 'ORDER_CONFIRMATION', channel: 'SMS', to: c?.phone, vars, refType: 'SALES_ORDER', refNumber: createdSalesOrder.soNumber });
      }

      return NextResponse.json({
        quotation: updatedQuote,
        createdSalesOrder,
        creditWarning,
        message: stage === 'PO_RECEIVED' 
          ? `Deal marked WON! Sales Order ${createdSalesOrder?.soNumber || ''} created in DRAFT status.` 
          : `Quotation stage updated to ${stage}`,
      });
    } catch (dbErr) {
      throw dbErr; // never report a deal as won when nothing was saved
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: statusOf(error) });
  }
}

// Delete a quotation that was never sent: no revisions, no discount request, no sales order.
// Anything the customer may have seen is kept; mark it lost instead.
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!QUOTE_EDIT_ROLES.includes(user.role)) return NextResponse.json({ error: 'Only Admin, Manager or Sales can delete quotations.' }, { status: 403 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
    await dbConnect();
    const quote: any = await Quotation.findById(id).lean();
    if (!quote) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
    if (quote.stage !== 'ENQUIRY_RECEIVED' || quote.salesOrderRef || (quote.revisions || []).length || (quote.discountRequests || []).length) {
      throw new HttpError(409, `${quote.quoteNumber} has been sent or worked on, so it is kept on record. Mark it lost instead.`);
    }
    const gone = await Quotation.deleteOne({ _id: id, stage: 'ENQUIRY_RECEIVED' });
    if (!gone.deletedCount) throw new HttpError(409, 'The quotation changed meanwhile. Reload and try again.');
    // the enquiry it came from can be quoted again
    if (quote.enquiry) await Enquiry.updateOne({ _id: quote.enquiry, status: 'QUALIFIED' }, { $set: { status: 'NEW' }, $unset: { convertedQuotationRef: 1 } });
    await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'DELETE', resource: 'Quotation', resourceId: id, resourceName: quote.quoteNumber, details: `Draft quotation for ${quote.customerName} deleted.` });
    return NextResponse.json({ message: `Quotation ${quote.quoteNumber} deleted.` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server Error' }, { status: statusOf(err) });
  }
}
