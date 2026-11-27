import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import GSTReturn from '@/models/GSTReturn';
import Invoice from '@/models/Invoice';
import { demoOrThrow } from '@/lib/demoMode';

const memoryGstReturns: any[] = [
  {
    _id: 'gst-1',
    returnPeriod: '2026-03',
    formType: 'GSTR-3B',
    status: 'FILED',
    totalSales: 302000,
    totalPurchases: 156500,
    taxLiabilityCGST: 18120,
    taxLiabilitySGST: 18120,
    taxLiabilityIGST: 0,
    itcAvailableCGST: 9390,
    itcAvailableSGST: 9390,
    itcAvailableIGST: 0,
    netTaxPayable: 17460,
    arn: 'AA2703260192837'
  },
  {
    _id: 'gst-2',
    returnPeriod: '2026-04',
    formType: 'GSTR-1',
    status: 'READY_TO_FILE',
    totalSales: 302000,
    totalPurchases: 124000,
    taxLiabilityCGST: 18120,
    taxLiabilitySGST: 18120,
    taxLiabilityIGST: 0,
    itcAvailableCGST: 7440,
    itcAvailableSGST: 7440,
    itcAvailableIGST: 0,
    netTaxPayable: 21360
  },
  {
    _id: 'gst-3',
    returnPeriod: '2026-04',
    formType: 'GSTR-2B',
    status: 'MATCHED_ITC',
    totalSales: 0,
    totalPurchases: 124000,
    taxLiabilityCGST: 0,
    taxLiabilitySGST: 0,
    taxLiabilityIGST: 0,
    itcAvailableCGST: 7440,
    itcAvailableSGST: 7440,
    itcAvailableIGST: 0,
    netTaxPayable: -14880
  }
];

const memoryEInvoices: any[] = [
  {
    _id: 'einv-1',
    invoiceNumber: 'INV-2026-001',
    customerName: 'Metro Cycle Distributors',
    customerGSTIN: '27AAAAA0000A1Z5',
    irn: 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef',
    ackNumber: '11260901283',
    ackDate: '2026-04-01T10:30:00.000Z',
    ewayBillNumber: 'EWB-2710049283',
    ewayBillValidTill: '2026-04-05T23:59:59.000Z',
    status: 'GENERATED_VALID',
    taxableAmount: 50000,
    cgstAmount: 2000,
    sgstAmount: 2000,
    totalAmount: 54000
  },
  {
    _id: 'einv-2',
    invoiceNumber: 'INV-2026-002',
    customerName: 'Apex Bike Hub',
    customerGSTIN: '27BBBBA1111B2Z6',
    irn: 'f6e5d4c3b2a198765432109876fedcba9876543210fedcba9876543210fedcba',
    ackNumber: '11260901284',
    ackDate: '2026-04-03T14:15:00.000Z',
    ewayBillNumber: 'EWB-2710049285',
    ewayBillValidTill: '2026-04-07T23:59:59.000Z',
    status: 'GENERATED_VALID',
    taxableAmount: 35000,
    cgstAmount: 1500,
    sgstAmount: 1500,
    totalAmount: 38000
  }
];

const memoryItcLedger: any[] = [
  {
    _id: 'itc-1',
    supplierName: 'Apex Alloy Frames Ltd.',
    supplierGSTIN: '27AAACA9921A1Z9',
    billNumber: 'BILL-APX-4412',
    taxableAmount: 25000,
    cgstClaimed: 1000,
    sgstClaimed: 1000,
    gstr2bMatchStatus: 'MATCHED_2B',
    eligibility: 'ELIGIBLE_ITC'
  },
  {
    _id: 'itc-2',
    supplierName: 'Shimano Component Imports',
    supplierGSTIN: '27AAACS1102B1Z4',
    billNumber: 'BILL-SHI-8801',
    taxableAmount: 40000,
    cgstClaimed: 4000,
    sgstClaimed: 4000,
    gstr2bMatchStatus: 'MATCHED_2B',
    eligibility: 'ELIGIBLE_ITC'
  }
];

const memoryHsnMaster: any[] = [
  {
    code: '87120010',
    description: 'Bicycles (Non-motorized Mountain, City & Road Bikes)',
    gstRate: 12,
    cgstRate: 6,
    sgstRate: 6,
    igstRate: 12,
    jurisdiction: 'Intra/Inter State'
  },
  {
    code: '87149990',
    description: 'Bicycle Parts, Frames, Suspension Forks & Drivetrains',
    gstRate: 18,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18,
    jurisdiction: 'Intra/Inter State'
  },
  {
    code: '85011012',
    description: 'Electric Hub Motors & Lithium Battery Packs for E-Bikes',
    gstRate: 18,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18,
    jurisdiction: 'Intra/Inter State'
  }
];

export async function GET(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN','MANAGER','FINANCE_MANAGER','VIEWER'].includes(authedUser.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });
    try {
      await dbConnect();
      const returns = await GSTReturn.find({}).sort({ returnPeriod: -1 });
      if (returns.length > 0) {
        return NextResponse.json({
          returns,
          eInvoices: memoryEInvoices,
          itcLedger: memoryItcLedger,
          hsnMaster: memoryHsnMaster
        });
      }
    } catch (dbErr) {
      demoOrThrow(dbErr);
      console.warn('MongoDB connection unavailable, using sample GST fallback:', dbErr);
    }

    return NextResponse.json({
      returns: memoryGstReturns,
      eInvoices: memoryEInvoices,
      itcLedger: memoryItcLedger,
      hsnMaster: memoryHsnMaster
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN','FINANCE_MANAGER'].includes(authedUser.role)) return NextResponse.json({ error: 'Forbidden: your role cannot change this data.' }, { status: 403 });
    const body = await req.json();
    const { action, returnPeriod, formType, invoiceNumber, customerName, customerGSTIN, taxableAmount } = body;

    if (action === 'GENERATE_E_INVOICE') {
      const taxVal = Number(taxableAmount) || 50000;
      const cgst = taxVal * 0.06;
      const sgst = taxVal * 0.06;
      const total = taxVal + cgst + sgst;

      const randomHex = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      const newEInv = {
        _id: `einv-${Date.now()}`,
        invoiceNumber: invoiceNumber || `INV-2026-${Math.floor(100 + Math.random() * 900)}`,
        customerName: customerName || 'Metro Cycle Distributors',
        customerGSTIN: customerGSTIN || '27AAAAA0000A1Z5',
        irn: randomHex,
        ackNumber: String(Math.floor(10000000000 + Math.random() * 90000000000)),
        ackDate: new Date().toISOString(),
        ewayBillNumber: `EWB-27${Math.floor(10000000 + Math.random() * 90000000)}`,
        ewayBillValidTill: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'GENERATED_VALID',
        taxableAmount: taxVal,
        cgstAmount: cgst,
        sgstAmount: sgst,
        totalAmount: total
      };

      memoryEInvoices.unshift(newEInv);
      return NextResponse.json(newEInv, { status: 201 });
    }

    try {
      await dbConnect();
      const start = new Date(`${returnPeriod}-01`);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);

      let gstReturn = await GSTReturn.findOne({ returnPeriod, formType });
      if (gstReturn && gstReturn.status === 'FILED') {
        return NextResponse.json({ error: 'GST Return already filed for this period' }, { status: 400 });
      }

      const salesInvoices = await Invoice.find({ type: 'SALES', date: { $gte: start, $lte: end }, status: { $in: ['ISSUED', 'PARTIAL', 'PAID'] } });
      const purchaseInvoices = await Invoice.find({ type: 'PURCHASE', date: { $gte: start, $lte: end }, status: { $in: ['ISSUED', 'PARTIAL', 'PAID'] } });

      let totalSales = 0, totalPurchases = 0;
      let taxLiabilityCGST = 0, taxLiabilitySGST = 0, taxLiabilityIGST = 0;
      let itcAvailableCGST = 0, itcAvailableSGST = 0, itcAvailableIGST = 0;

      salesInvoices.forEach(inv => {
        totalSales += inv.subTotal || 0;
        taxLiabilityCGST += inv.totalCGST || 0;
        taxLiabilitySGST += inv.totalSGST || 0;
        taxLiabilityIGST += inv.totalIGST || 0;
      });

      purchaseInvoices.forEach(inv => {
        totalPurchases += inv.subTotal || 0;
        itcAvailableCGST += inv.totalCGST || 0;
        itcAvailableSGST += inv.totalSGST || 0;
        itcAvailableIGST += inv.totalIGST || 0;
      });

      const netTaxPayable = (taxLiabilityCGST + taxLiabilitySGST + taxLiabilityIGST) - (itcAvailableCGST + itcAvailableSGST + itcAvailableIGST);

      if (gstReturn) {
        gstReturn.totalSales = totalSales;
        gstReturn.totalPurchases = totalPurchases;
        gstReturn.taxLiabilityCGST = taxLiabilityCGST;
        gstReturn.taxLiabilitySGST = taxLiabilitySGST;
        gstReturn.taxLiabilityIGST = taxLiabilityIGST;
        gstReturn.itcAvailableCGST = itcAvailableCGST;
        gstReturn.itcAvailableSGST = itcAvailableSGST;
        gstReturn.itcAvailableIGST = itcAvailableIGST;
        gstReturn.netTaxPayable = netTaxPayable;
        await gstReturn.save();
      } else {
        gstReturn = await GSTReturn.create({
          returnPeriod,
          formType,
          totalSales,
          totalPurchases,
          taxLiabilityCGST,
          taxLiabilitySGST,
          taxLiabilityIGST,
          itcAvailableCGST,
          itcAvailableSGST,
          itcAvailableIGST,
          netTaxPayable
        });
      }

      return NextResponse.json(gstReturn, { status: 200 });
    } catch (dbErr) {
      demoOrThrow(dbErr);
      console.warn('MongoDB connection unavailable, filing GST return in fallback mode:', dbErr);
      const fallbackReturn = {
        _id: `gst-${Date.now()}`,
        returnPeriod: returnPeriod || '2026-04',
        formType: formType || 'GSTR-3B',
        status: 'READY_TO_FILE',
        totalSales: 302000,
        totalPurchases: 124000,
        taxLiabilityCGST: 18120,
        taxLiabilitySGST: 18120,
        taxLiabilityIGST: 0,
        itcAvailableCGST: 7440,
        itcAvailableSGST: 7440,
        itcAvailableIGST: 0,
        netTaxPayable: 21360
      };
      memoryGstReturns.unshift(fallbackReturn);
      return NextResponse.json(fallbackReturn, { status: 200 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
