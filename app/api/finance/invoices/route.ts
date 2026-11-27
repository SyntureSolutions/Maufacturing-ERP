import { NextRequest, NextResponse } from 'next/server';
import { canViewInvoices } from '@/lib/accessRoles';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import SalesOrder from '@/models/SalesOrder';
import { verifyAuth } from '@/lib/auth';
import { memorySalesOrders } from '@/lib/salesStore';
import { demoOrThrow } from '@/lib/demoMode';

const memoryInvoices: any[] = [
  {
    _id: 'inv-101',
    invoiceNumber: 'INV-2026-001',
    type: 'SALES',
    customer: { _id: 'cust-1', name: 'Metro Cycle Distributors', code: 'DIS-001' },
    issueDate: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(), // 35 days ago (Overdue)
    dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    totalAmount: 540000,
    amountPaid: 200000,
    status: 'PARTIAL',
    paymentHistory: [
      { amount: 200000, paymentDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), method: 'BANK_TRANSFER', reference: 'NEFT-88392' }
    ]
  },
  {
    _id: 'inv-102',
    invoiceNumber: 'INV-2026-002',
    type: 'SALES',
    customer: { _id: 'cust-2', name: 'Apex Bike Hub', code: 'DIS-002' },
    issueDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    dueDate: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString(),
    totalAmount: 380000,
    amountPaid: 380000,
    status: 'PAID',
    paymentHistory: [
      { amount: 380000, paymentDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), method: 'UPI', reference: 'UPI-99201' }
    ]
  },
  {
    _id: 'inv-103',
    invoiceNumber: 'INV-2026-003',
    type: 'SALES',
    customer: { _id: 'cust-3', name: 'Decathlon Regional Logistics', code: 'DIS-003' },
    issueDate: new Date(Date.now() - 75 * 24 * 60 * 60 * 1000).toISOString(), // 75 days ago (Critical Overdue)
    dueDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    totalAmount: 890000,
    amountPaid: 0,
    status: 'UNPAID',
    paymentHistory: []
  },
  {
    _id: 'bill-201',
    invoiceNumber: 'BILL-SHI-8801',
    type: 'PURCHASE',
    supplier: { _id: 'sup-1', name: 'Shimano Component Imports', code: 'SUP-001' },
    issueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    dueDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    totalAmount: 480000,
    amountPaid: 150000,
    status: 'PARTIAL',
    paymentHistory: [
      { amount: 150000, paymentDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), method: 'CHEQUE', reference: 'CHQ-1004' }
    ]
  },
  {
    _id: 'bill-202',
    invoiceNumber: 'BILL-APX-4412',
    type: 'PURCHASE',
    supplier: { _id: 'sup-2', name: 'Apex Alloy Frames Ltd.', code: 'SUP-002' },
    issueDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    totalAmount: 270000,
    amountPaid: 270000,
    status: 'PAID',
    paymentHistory: [
      { amount: 270000, paymentDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), method: 'BANK_TRANSFER', reference: 'RTGS-5521' }
    ]
  }
];

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewInvoices(user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });

    try {
      await dbConnect();
      const invoices = await Invoice.find({})
        .populate('customer', 'name code')
        .populate('supplier', 'name code')
        .sort({ issueDate: -1 });
      if (invoices.length > 0) {
        return NextResponse.json(invoices);
      }
    } catch (dbErr) {
      demoOrThrow(dbErr);
      console.warn('MongoDB query for Invoices unavailable, using sample fallback:', dbErr);
    }

    return NextResponse.json(memoryInvoices);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, invoiceId, amount, paymentMethod, reference } = body;

    // Handle Payment Recording Action
    if (action === 'RECORD_PAYMENT') {
      const paymentAmount = Number(amount) || 0;
      const nowIso = new Date().toISOString();

      try {
        await dbConnect();
        if (invoiceId && mongoose.Types.ObjectId.isValid(invoiceId)) {
          const inv = await Invoice.findById(invoiceId);
          if (inv) {
            inv.amountPaid = (inv.amountPaid || 0) + paymentAmount;
            inv.status = inv.amountPaid >= inv.totalAmount ? 'PAID' : 'PARTIAL';
            inv.paymentHistory = inv.paymentHistory || [];
            inv.paymentHistory.push({
              amount: paymentAmount,
              paymentDate: new Date(),
              method: paymentMethod || 'BANK_TRANSFER',
              reference: reference || `REF-${Date.now()}`
            });
            await inv.save();
            return NextResponse.json(inv);
          }
        }
      } catch (dbErr) {
        demoOrThrow(dbErr);
        console.warn('MongoDB Payment update failed, updating memory fallback:', dbErr);
      }

      // Memory Store update
      const idx = memoryInvoices.findIndex(i => i._id === invoiceId);
      if (idx !== -1) {
        const inv = { ...memoryInvoices[idx] };
        inv.amountPaid = (inv.amountPaid || 0) + paymentAmount;
        inv.status = inv.amountPaid >= inv.totalAmount ? 'PAID' : 'PARTIAL';
        inv.paymentHistory = inv.paymentHistory || [];
        inv.paymentHistory.push({
          amount: paymentAmount,
          paymentDate: nowIso,
          method: paymentMethod || 'BANK_TRANSFER',
          reference: reference || `REF-${Date.now()}`
        });
        memoryInvoices[idx] = inv;
        return NextResponse.json(inv);
      }

      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Strict RBAC Gate: Only FINANCE_MANAGER and ADMIN can issue legal GST Tax Invoices
    if (!['ADMIN', 'FINANCE_MANAGER'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Sales role cannot issue legal GST Tax Invoices. Statutory tax compliance is strictly centralized in Finance.' },
        { status: 403 }
      );
    }

    // An order that already has invoices in the tracked flow cannot be invoiced again through this older screen
    if (body.salesOrderId && mongoose.isValidObjectId(body.salesOrderId)) {
      try {
        await dbConnect();
        const so: any = await SalesOrder.findById(body.salesOrderId).select('soNumber taxInvoiceStatus taxInvoiceNumber').lean();
        if (so && ['INVOICED', 'PARTIAL'].includes(so.taxInvoiceStatus)) return NextResponse.json({ error: `Sales order ${so.soNumber} is already ${so.taxInvoiceStatus === 'PARTIAL' ? 'partly ' : ''}invoiced${so.taxInvoiceNumber ? ` (${so.taxInvoiceNumber})` : ''}. Use the Dispatch screen for the rest.` }, { status: 409 });
      } catch (dbErr) { demoOrThrow(dbErr); }
    }

    // Create New Tax Invoice / Vendor Bill Action
    const invoiceNumber = body.invoiceNumber || (body.type === 'SALES' ? `INV-2026-${Math.floor(100 + Math.random() * 900)}` : `BILL-SUP-${Math.floor(100 + Math.random() * 900)}`);
    const invoiceData = {
      ...body,
      invoiceNumber,
      issuedByRole: user.role,
    };

    try {
      await dbConnect();
      const newInv = await Invoice.create(invoiceData);

      // Link back to SalesOrder if specified
      if (body.salesOrderId) {
        try {
          await SalesOrder.findByIdAndUpdate(body.salesOrderId, {
            taxInvoiceStatus: 'INVOICED',
            taxInvoiceNumber: newInv.invoiceNumber,
            taxInvoiceId: newInv._id,
          });
        } catch (soErr) {
          console.warn('Failed to link SalesOrder in DB:', soErr);
        }

        const memIdx = memorySalesOrders.findIndex(o => o._id === body.salesOrderId || o.soNumber === body.salesOrderId);
        if (memIdx !== -1) {
          memorySalesOrders[memIdx].taxInvoiceStatus = 'INVOICED';
          memorySalesOrders[memIdx].taxInvoiceNumber = newInv.invoiceNumber;
          memorySalesOrders[memIdx].taxInvoiceId = String(newInv._id);
        }
      }

      return NextResponse.json(newInv, { status: 201 });
    } catch (dbErr) {
      demoOrThrow(dbErr);
      console.warn('MongoDB Create Invoice failed, fallback to memory store:', dbErr);
      const newInv: any = {
        _id: `inv-${Date.now()}`,
        invoiceNumber,
        type: body.type || 'SALES',
        customer: body.customer ? { name: body.customerName || 'Customer Party', code: 'CUST-000' } : (body.customerName ? { name: body.customerName, code: 'CUST-001' } : undefined),
        supplier: body.supplier ? { name: body.supplierName || 'Supplier Party', code: 'SUP-000' } : undefined,
        soNumber: body.soNumber,
        quotationRef: body.quotationRef,
        proformaRef: body.proformaRef,
        issuedByRole: user.role,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        subTotal: body.subTotal || Math.round((body.totalAmount || 100000) / 1.18),
        totalCGST: body.totalCGST || Math.round(((body.totalAmount || 100000) - Math.round((body.totalAmount || 100000) / 1.18)) / 2),
        totalSGST: body.totalSGST || Math.round(((body.totalAmount || 100000) - Math.round((body.totalAmount || 100000) / 1.18)) / 2),
        totalIGST: body.totalIGST || 0,
        totalAmount: body.totalAmount || 100000,
        amountPaid: body.amountPaid || 0,
        status: body.amountPaid >= body.totalAmount ? 'PAID' : (body.amountPaid > 0 ? 'PARTIAL' : 'UNPAID'),
        paymentHistory: body.amountPaid > 0 ? [{ amount: body.amountPaid, paymentDate: new Date().toISOString(), method: 'BANK_TRANSFER' }] : []
      };

      if (body.salesOrderId) {
        const memIdx = memorySalesOrders.findIndex(o => o._id === body.salesOrderId || o.soNumber === body.salesOrderId);
        if (memIdx !== -1) {
          memorySalesOrders[memIdx].taxInvoiceStatus = 'INVOICED';
          memorySalesOrders[memIdx].taxInvoiceNumber = newInv.invoiceNumber;
          memorySalesOrders[memIdx].taxInvoiceId = newInv._id;
        }
      }

      memoryInvoices.unshift(newInv);
      return NextResponse.json(newInv, { status: 201 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: 500 });
  }
}
