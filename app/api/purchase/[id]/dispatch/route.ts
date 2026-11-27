import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import dbConnect from '@/lib/mongodb';
import PurchaseOrder from '@/models/PurchaseOrder';
import CompanySettings from '@/models/CompanySettings';
import '@/models/Supplier';
import { verifyAuth } from '@/lib/auth';
import { notify } from '@/lib/notify';
import { hasUnsupportedText, safeFileName } from '@/lib/poPdf';
import { buildPrintPdf } from '@/lib/printLayout';
import { PRINT_TYPES } from '@/lib/printDocs';

// Send an approved PO to the vendor by email / WhatsApp with an acknowledgement link
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await context.params;
    await dbConnect();
    const po: any = await PurchaseOrder.findById(id).populate('supplier', 'name email phone');
    if (!po) return NextResponse.json({ error: 'Purchase order not found.' }, { status: 404 });
    if (!['ORDERED', 'PARTIALLY_RECEIVED'].includes(po.status)) return NextResponse.json({ error: 'Only approved purchase orders can be sent to the vendor.' }, { status: 409 });

    const company: any = await CompanySettings.findOne({ key: 'company' }).lean();
    const token = po.dispatch?.ackToken || randomBytes(16).toString('hex');
    const base = process.env.APP_URL || req.nextUrl.origin;
    const vars = {
      poNumber: po.poNumber, supplierName: po.supplier?.name, totalAmount: po.totalAmount?.toLocaleString('en-IN'),
      expectedDelivery: po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString('en-IN') : 'to be confirmed',
      ackLink: `${base}/vendor-ack/${token}`, companyName: company?.legalName || 'Our company',
    };
    // The same PDF the buyer can preview in the app is attached to the email
    // If the PDF cannot be built the vendor still gets the email with the acknowledgement link
    let attachment: { filename: string; content: Uint8Array; contentType: string } | null = null;
    let attachmentError: string | undefined;
    let pdfWarning: string | undefined;
    try {
      const full: any = await PurchaseOrder.findById(id).populate('supplier').populate('items.product', 'name sku uom').lean();
      const spec = await PRINT_TYPES['purchase-order'].load(id, new URLSearchParams(), { ackLink: vars.ackLink });
      const pdf = await buildPrintPdf(spec!, company || {});
      attachment = { filename: safeFileName(po.poNumber), content: pdf, contentType: 'application/pdf' };
      if (hasUnsupportedText(full, company)) pdfWarning = 'Some characters could not be printed in the PDF (it supports Western European text only) and appear as ?. Check the PDF preview.';
    } catch (err: any) {
      attachmentError = err.message;
    }
    const results = [
      { channel: 'EMAIL', ...(await notify({ event: 'PO_DISPATCH', channel: 'EMAIL', to: po.supplier?.email, vars, refType: 'PURCHASE_ORDER', refNumber: po.poNumber, attachments: attachment ? [attachment] : undefined })) },
      { channel: 'WHATSAPP', ...(await notify({ event: 'PO_DISPATCH', channel: 'WHATSAPP', to: po.supplier?.phone, vars, refType: 'PURCHASE_ORDER', refNumber: po.poNumber })) },
    ];
    const sent = results.filter(r => r.status === 'SENT').map(r => r.channel);
    const delivered = sent.length > 0;
    po.dispatch = { ...(po.dispatch?.toObject?.() || po.dispatch || {}), at: new Date(), by: user.name, channels: sent, ackToken: token, lastAttemptDelivered: delivered };
    await po.save();
    return NextResponse.json({ results, ackLink: vars.ackLink, attachment: attachment?.filename, attachmentError, pdfWarning, delivered });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
