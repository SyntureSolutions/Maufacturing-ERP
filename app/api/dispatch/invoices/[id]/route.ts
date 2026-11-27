import { NextRequest, NextResponse } from 'next/server';
import { canViewInvoices } from '@/lib/accessRoles';
import dbConnect from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import Customer from '@/models/Customer';
import mongoose from 'mongoose';
import '@/models/Customer';
import '@/models/Product';
import { verifyAuth } from '@/lib/auth';
import { buildEInvoiceJson, buildEwayBillJson, computeIrn, DocInput, EWAY_THRESHOLD } from '@/lib/einvoice';

function toDoc(inv: any): DocInput {
  return {
    number: inv.invoiceNumber, date: new Date(inv.date), seller: inv.parties.seller, buyer: inv.parties.buyer, placeOfSupply: inv.placeOfSupply,
    items: inv.items.map((i: any) => ({ description: i.description, hsnCode: i.hsnCode, quantity: i.quantity, uom: undefined, unitPrice: i.unitPrice, listPrice: i.listPrice, chargeShare: i.chargeShare, taxableValue: i.taxableValue, gstRate: (i.cgstRate || 0) + (i.sgstRate || 0) + (i.igstRate || 0), cgstAmount: i.cgstAmount, sgstAmount: i.sgstAmount, igstAmount: i.igstAmount, totalAmount: i.totalAmount })),
    subTotal: inv.subTotal, totalCGST: inv.totalCGST, totalSGST: inv.totalSGST, totalIGST: inv.totalIGST, totalAmount: inv.totalAmount, otherCharges: inv.tcsAmount || undefined,
  };
}

// Download payloads: ?doc=einvoice  or  ?doc=eway&distance=120&vehicle=MH12AB1234&transporter=...
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewInvoices(user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });
    const { id } = await context.params;
    await dbConnect();
    if (!req.nextUrl.searchParams.get('doc')) {
      if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      const one: any = await Invoice.findOne({ _id: id, type: 'SALES' }).populate('customer', 'name code gstin').populate('items.product', 'name sku uom').lean();
      return one ? NextResponse.json(one) : NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    const inv: any = await Invoice.findById(id);
    if (!inv?.parties) return NextResponse.json({ error: 'Invoice not found or has no GST party snapshot.' }, { status: 404 });
    const q = req.nextUrl.searchParams;
    const doc = toDoc(inv);

    if (q.get('doc') === 'einvoice') {
      const { json, errors } = buildEInvoiceJson(doc);
      if (errors.length) return NextResponse.json({ error: errors.join(' ') }, { status: 422 });
      const irnHash = computeIrn(inv.parties.seller.gstin, inv.date, 'INV', inv.invoiceNumber);
      if (inv.einvoiceStatus === 'NOT_GENERATED') { inv.einvoiceStatus = 'JSON_GENERATED'; inv.irnHash = irnHash; await inv.save(); }
      return new NextResponse(JSON.stringify([json], null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="einvoice-${inv.invoiceNumber}.json"` } });
    }
    if (q.get('doc') === 'eway') {
      if (inv.totalAmount <= EWAY_THRESHOLD) return NextResponse.json({ error: `E-way bill is required only for consignments above Rs ${EWAY_THRESHOLD}.` }, { status: 422 });
      // distance as typed; otherwise the one already on the invoice, or the customer's distance in the master
      const typed = (q.get('distance') ?? '').trim();
      const cust: any = typed === '' && inv.customer ? await Customer.findById(inv.customer).select('distanceKm').lean() : null;
      const distanceKm = typed !== '' ? Number(typed) : inv.transport?.distanceKm ?? cust?.distanceKm ?? NaN;
      const transport = { mode: 'ROAD' as const, distanceKm, vehicleNo: q.get('vehicle') || '', transporterName: q.get('transporter') || '', transporterId: q.get('transporterId') || '', docNo: q.get('docNo') || '', docDate: q.get('docDate') ? new Date(q.get('docDate')!) : undefined };
      const { json, errors } = buildEwayBillJson(doc, transport);
      if (errors.length) return NextResponse.json({ error: errors.join(' ') }, { status: 422 });
      if (inv.ewayStatus === 'NOT_GENERATED') { inv.ewayStatus = 'JSON_GENERATED'; inv.transport = { mode: 'ROAD', distanceKm: transport.distanceKm, transporterName: transport.transporterName, transporterId: transport.transporterId, docNo: transport.docNo, vehicleNo: transport.vehicleNo }; await inv.save(); }
      return new NextResponse(JSON.stringify(json, null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="ewaybill-${inv.invoiceNumber}.json"` } });
    }
    return NextResponse.json({ error: 'doc must be einvoice or eway.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Record what the government portals returned after the JSON was uploaded
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'FINANCE_MANAGER'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await context.params;
    const b = await req.json();
    await dbConnect();
    const inv: any = await Invoice.findById(id);
    if (!inv) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });

    if (b.action === 'record-irn') {
      if (!/^[0-9a-f]{64}$/i.test(String(b.irn || ''))) return NextResponse.json({ error: 'IRN must be the 64-character hash returned by the IRP.' }, { status: 400 });
      if (inv.irnHash && inv.irnHash !== String(b.irn).toLowerCase()) return NextResponse.json({ error: 'IRN does not match this invoice (supplier GSTIN + FY + doc type + number).' }, { status: 409 });
      inv.irn = String(b.irn).toLowerCase(); inv.ackNo = b.ackNo; inv.ackDate = b.ackDate ? new Date(b.ackDate) : new Date(); inv.signedQr = b.signedQr; inv.einvoiceStatus = 'REGISTERED';
    } else if (b.action === 'record-eway') {
      if (!/^\d{12}$/.test(String(b.number || ''))) return NextResponse.json({ error: 'E-way bill number must be 12 digits.' }, { status: 400 });
      inv.ewayBillNumber = b.number; inv.ewayValidUpto = b.validUpto ? new Date(b.validUpto) : undefined; inv.ewayStatus = 'GENERATED';
    } else {
      return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
    }
    await inv.save();
    return NextResponse.json(inv);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
