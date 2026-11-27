import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import SalesOrder from '@/models/SalesOrder';
import Quotation from '@/models/Quotation';
import { verifyAuth } from '@/lib/auth';
import { memorySalesOrders } from '@/lib/salesStore';
import { demoOrThrow } from '@/lib/demoMode';

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const soId = searchParams.get('salesOrderId');

    if (soId) {
      // Find specific SO
      try {
        await dbConnect();
        const so = await SalesOrder.findById(soId);
        if (so) return NextResponse.json(so);
      } catch (e) {
        demoOrThrow(e);
        // fallback
      }
      const memSo = memorySalesOrders.find(o => o._id === soId || o.soNumber === soId);
      if (memSo) return NextResponse.json(memSo);
      return NextResponse.json({ error: 'Sales order not found' }, { status: 404 });
    }

    return NextResponse.json({
      proformas: memorySalesOrders.filter(o => !!o.proformaNumber),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, salesOrderId, quotationId } = body;

    // ACTION: REQUEST TAX INVOICE FROM FINANCE
    if (action === 'REQUEST_TAX_INVOICE') {
      if (!salesOrderId) {
        return NextResponse.json({ error: 'salesOrderId is required' }, { status: 400 });
      }

      let updatedRecord: any = null;

      try {
        await dbConnect();
        if (mongoose.Types.ObjectId.isValid(salesOrderId)) {
          updatedRecord = await SalesOrder.findByIdAndUpdate(
            salesOrderId,
            { taxInvoiceStatus: 'REQUESTED' },
            { new: true }
          );
        } else {
          updatedRecord = await SalesOrder.findOneAndUpdate(
            { $or: [{ soNumber: salesOrderId }, { quotationRef: salesOrderId }] },
            { taxInvoiceStatus: 'REQUESTED' },
            { new: true }
          );
        }
      } catch (dbErr) {
        demoOrThrow(dbErr);
        console.warn('MongoDB SO update fallback to memory:', dbErr);
      }

      const memIdx = memorySalesOrders.findIndex(o => o._id === salesOrderId || o.soNumber === salesOrderId || o.quotationRef === salesOrderId);
      if (memIdx !== -1) {
        memorySalesOrders[memIdx].taxInvoiceStatus = 'REQUESTED';
        if (!updatedRecord) updatedRecord = memorySalesOrders[memIdx];
      }

      return NextResponse.json({
        success: true,
        message: 'Tax Invoice requested! Order has been placed in Finance Central Billing Queue.',
        salesOrder: updatedRecord || { _id: salesOrderId, taxInvoiceStatus: 'REQUESTED' },
      });
    }

    // ACTION: GENERATE / ISSUE PRO-FORMA INVOICE
    const generatedPINumber = `PI-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date();

    if (salesOrderId) {
      try {
        await dbConnect();
        await SalesOrder.findByIdAndUpdate(salesOrderId, {
          proformaNumber: generatedPINumber,
          proformaIssuedAt: now,
        });
      } catch (dbErr) {
        demoOrThrow(dbErr);
        console.warn('DB update for proforma on SO failed, using memory fallback:', dbErr);
      }

      const memIdx = memorySalesOrders.findIndex(o => o._id === salesOrderId || o.soNumber === salesOrderId);
      if (memIdx !== -1) {
        memorySalesOrders[memIdx].proformaNumber = generatedPINumber;
        memorySalesOrders[memIdx].proformaIssuedAt = now.toISOString();
      }
    }

    if (quotationId) {
      try {
        await dbConnect();
        await Quotation.findByIdAndUpdate(quotationId, {
          proformaNumber: generatedPINumber,
          proformaIssuedAt: now,
        });
      } catch (dbErr) {
        demoOrThrow(dbErr);
        console.warn('DB update for proforma on Quotation failed:', dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Commercial Pro-Forma Invoice generated successfully.',
      proformaNumber: generatedPINumber,
      issuedAt: now.toISOString(),
      watermark: 'PRO-FORMA INVOICE (NOT A TAX INVOICE)',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: 500 });
  }
}
