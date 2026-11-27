import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { inflateSync } from 'zlib';
import mongoose from 'mongoose';
import { PDFDocument } from 'pdf-lib';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';

// Capture what would be handed to the mail server
const mail = vi.hoisted(() => ({ sent: [] as any[], fail: false }));
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: async (o: any) => { if (mail.fail) throw new Error('SMTP connection refused'); mail.sent.push(o); } }) },
}));

const STREAM = new RegExp('stream\\r?\\n([\\s\\S]*?)\\r?\\nendstream', 'g');
const HEX_TJ = new RegExp('<([0-9A-Fa-f]+)>\\s*Tj', 'g');
const pdfText = (bytes: Uint8Array) => {
  const out: string[] = [];
  for (const m of Buffer.from(bytes).toString('latin1').matchAll(STREAM)) {
    let body = m[1];
    try { body = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { /* uncompressed */ }
    for (const h of body.matchAll(HEX_TJ)) out.push(Buffer.from(h[1], 'hex').toString('latin1'));
  }
  return out.join('\n');
};

describe('PO email with PDF attachment', () => {
  const m: any = {}, r: any = {}, d: any = {};

  beforeAll(async () => {
    process.env.SMTP_HOST = 'smtp.test.local'; process.env.SMTP_FROM = 'orders@prodexa.test';
    await startDb();
    for (const [k, p] of Object.entries({ PO: 'PurchaseOrder', Supplier: 'Supplier', Product: 'Product', Company: 'CompanySettings' })) { const mod: any = await import(/* @vite-ignore */ `@/models/${p}`); m[k] = mod.default || mod; }
    m.Log = (await import('@/models/Notification')).NotificationLog;
    r.dispatch = await import('@/app/api/purchase/[id]/dispatch/route');
    r.pdf = await import('@/app/api/purchase/[id]/pdf/route');
    const cat = new mongoose.Types.ObjectId();
    d.p = await m.Product.create({ name: 'Hydraulic Disc Brake', sku: 'CMP-BRK-1', category: cat, uom: 'set' });
    d.s = await m.Supplier.create({ name: 'Shimano Imports', code: 'S-1', email: 'sales@shimano.test', phone: '9876543210', address: 'BKC, Mumbai', gstin: '27AAPFU0939F1ZV' });
    await m.Company.create({ key: 'company', legalName: 'Prodexa Pvt Ltd', gstin: '27AAPFU0939F1ZV', address1: '1 Factory Rd', city: 'Pune', pincode: '411001', stateCode: '27' });
    d.po = await m.PO.create({ poNumber: 'PO-E-100', supplier: d.s._id, status: 'ORDERED', totalAmount: 5900, expectedDeliveryDate: new Date('2026-12-01'), items: [{ product: d.p._id, quantity: 50, unitPrice: 100, totalPrice: 5000 }] });
    asAdmin();
  }, 120000);

  afterAll(stopDb);

  it('attaches the purchase order PDF to the vendor email and keeps the acknowledgement link in the body', async () => {
    const res = await call(r.dispatch.POST, 'POST', {}, { id: id(d.po) });
    expect(res.status).toBe(200);
    expect(res.json.attachment).toBe('PO-E-100.pdf');
    expect(res.json.results.find((x: any) => x.channel === 'EMAIL').status).toBe('SENT');

    expect(mail.sent).toHaveLength(1);
    const msg = mail.sent[0];
    expect(msg.to).toBe('sales@shimano.test');
    expect(msg.subject).toContain('PO-E-100');
    expect(msg.text).toContain('attached as a PDF');
    expect(msg.text).toContain(res.json.ackLink);                    // acknowledgement link still in the email text
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments[0]).toMatchObject({ filename: 'PO-E-100.pdf', contentType: 'application/pdf' });

    const pdf = new Uint8Array(msg.attachments[0].content);
    expect(Buffer.from(pdf).toString('latin1').startsWith('%PDF-')).toBe(true);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
    const t = pdfText(pdf);
    for (const s of ['PO-E-100', 'Prodexa Pvt Ltd', 'Shimano Imports', 'Hydraulic Disc Brake', 'CMP-BRK-1', 'Rs. 5,900.00', res.json.ackLink]) expect(t).toContain(s);

    const log = await m.Log.findOne({ event: 'PO_DISPATCH', channel: 'EMAIL' });
    expect(log.status).toBe('SENT');
    expect(log.attachments).toEqual(['PO-E-100.pdf']);               // visible in the communication log
    const po = await m.PO.findById(d.po._id);
    expect(po.dispatch.channels).toContain('EMAIL');
    expect(po.dispatch.ackToken).toMatch(/^[a-f0-9]{32}$/);
  });

  it('does not attach anything to the WhatsApp message (link only)', async () => {
    const wa = await m.Log.findOne({ event: 'PO_DISPATCH', channel: 'WHATSAPP' });
    expect(wa.attachments ?? []).toEqual([]);
    expect(wa.body).toContain('vendor-ack/');
  });

  it('records a mail server failure but still saves the dispatch so it can be retried', async () => {
    mail.fail = true;
    const res = await call(r.dispatch.POST, 'POST', {}, { id: id(d.po) });
    mail.fail = false;
    expect(res.status).toBe(200);
    const email = res.json.results.find((x: any) => x.channel === 'EMAIL');
    expect(email.status).toBe('FAILED');
    expect(email.reason).toContain('SMTP connection refused');
    const failed = await m.Log.findOne({ event: 'PO_DISPATCH', channel: 'EMAIL', status: 'FAILED' });
    expect(failed.attachments).toEqual(['PO-E-100.pdf']);
    expect(failed.error).toContain('SMTP connection refused');
    // reusing the same acknowledgement link on re-send
    expect((await m.PO.findById(d.po._id)).dispatch.ackToken).toBe(res.json.ackLink.split('/').pop());

    const retry = await call(r.dispatch.POST, 'POST', {}, { id: id(d.po) });
    expect(retry.json.results.find((x: any) => x.channel === 'EMAIL').status).toBe('SENT');
    expect(mail.sent).toHaveLength(2);
  });

  it('a vendor without an email address is skipped, not failed', async () => {
    const s2 = await m.Supplier.create({ name: 'No Email Co', code: 'S-2' });
    const po2 = await m.PO.create({ poNumber: 'PO-E-101', supplier: s2._id, status: 'ORDERED', totalAmount: 10, items: [{ product: d.p._id, quantity: 1, unitPrice: 10, totalPrice: 10 }] });
    const before = mail.sent.length;
    const res = await call(r.dispatch.POST, 'POST', {}, { id: id(po2) });
    expect(res.json.results.find((x: any) => x.channel === 'EMAIL').status).toBe('SKIPPED');
    expect(mail.sent.length).toBe(before);
  });

  it('only approved POs can be sent, and only by purchasing roles', async () => {
    const draft = await m.PO.create({ poNumber: 'PO-E-102', supplier: d.s._id, status: 'DRAFT', totalAmount: 1, items: [{ product: d.p._id, quantity: 1, unitPrice: 1, totalPrice: 1 }] });
    expect((await call(r.dispatch.POST, 'POST', {}, { id: id(draft) })).status).toBe(409);
    asRole('SALES');
    expect((await call(r.dispatch.POST, 'POST', {}, { id: id(d.po) })).status).toBe(403);
    asAdmin();
  });

  it('the preview endpoint serves the same PDF inline, or as a download', async () => {
    const inline: Response = await r.pdf.GET(new (await import('next/server')).NextRequest('http://localhost/x'), { params: Promise.resolve({ id: id(d.po) }) });
    expect(inline.status).toBe(200);
    expect(inline.headers.get('content-type')).toBe('application/pdf');
    expect(inline.headers.get('content-disposition')).toContain('inline');
    const bytes = new Uint8Array(await inline.arrayBuffer());
    expect(Buffer.from(bytes).toString('latin1').startsWith('%PDF-')).toBe(true);
    expect(pdfText(bytes)).toContain('vendor-ack/'); // carries the vendor's acknowledgement link once dispatched

    const dl: Response = await r.pdf.GET(new (await import('next/server')).NextRequest('http://localhost/x?download=1'), { params: Promise.resolve({ id: id(d.po) }) });
    expect(dl.headers.get('content-disposition')).toContain('attachment; filename="PO-E-100.pdf"');

    expect((await call(r.pdf.GET, 'GET', undefined, { id: 'nope' })).status).toBe(400);
    expect((await call(r.pdf.GET, 'GET', undefined, { id: String(new mongoose.Types.ObjectId()) })).status).toBe(404);
  });

  // ---------- found on re-check ----------
  it('only purchasing and finance roles can open the PO PDF (it holds contact details, bank details and the vendor link)', async () => {
    const { NextRequest } = await import('next/server');
    const open = async (role: string) => { asRole(role); const res: Response = await r.pdf.GET(new NextRequest('http://localhost/x'), { params: Promise.resolve({ id: id(d.po) }) }); return res.status; };
    expect(await open('VIEWER')).toBe(403);
    expect(await open('SALES')).toBe(403);
    expect(await open('STAFF')).toBe(403);
    expect(await open('HR_MANAGER')).toBe(403);
    expect(await open('SUPPLY_CHAIN_MANAGER')).toBe(200);
    expect(await open('FINANCE_MANAGER')).toBe(200);
    expect(await open('MANAGER')).toBe(200);
    asAdmin();
  });

  it('a PO number with unusual characters cannot break the file name or the response headers', async () => {
    const { NextRequest } = await import('next/server');
    const odd = await m.PO.create({ poNumber: 'PO-E/200 "x"\r\nX-Evil: 1', supplier: d.s._id, status: 'ORDERED', totalAmount: 1, items: [{ product: d.p._id, quantity: 1, unitPrice: 1, totalPrice: 1 }] });
    const res: Response = await r.pdf.GET(new NextRequest('http://localhost/x'), { params: Promise.resolve({ id: id(odd) }) });
    expect(res.status).toBe(200);
    const disp = res.headers.get('content-disposition')!;
    expect(disp).toMatch(/^inline; filename="[A-Za-z0-9._-]+\.pdf"$/);
    expect(res.headers.get('x-evil')).toBeNull();

    const before = mail.sent.length;
    const sent = await call(r.dispatch.POST, 'POST', {}, { id: id(odd) });
    expect(sent.status).toBe(200);
    expect(mail.sent[before].attachments[0].filename).toMatch(/^[A-Za-z0-9._-]+\.pdf$/);
  });

  it('does not list an attachment in the log when the email provider is not configured and nothing was sent', async () => {
    const host = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    try {
      const po = await m.PO.create({ poNumber: 'PO-E-300', supplier: d.s._id, status: 'ORDERED', totalAmount: 1, items: [{ product: d.p._id, quantity: 1, unitPrice: 1, totalPrice: 1 }] });
      await call(r.dispatch.POST, 'POST', {}, { id: id(po) });
      const log = await m.Log.findOne({ refNumber: 'PO-E-300', channel: 'EMAIL' });
      expect(log.status).toBe('SKIPPED');
      expect(log.attachments ?? []).toEqual([]);
    } finally { process.env.SMTP_HOST = host; }
  });

  it('keeps line breaks in the PO notes', async () => {
    const po = await m.PO.create({ poNumber: 'PO-N', supplier: d.s._id, status: 'ORDERED', totalAmount: 1, notes: 'Deliver to Gate 2.\nCall security first.', items: [{ product: d.p._id, quantity: 1, unitPrice: 1, totalPrice: 1 }] });
    asAdmin();
    const res: Response = await r.pdf.GET(new (await import('next/server')).NextRequest('http://localhost/x'), { params: Promise.resolve({ id: id(po) }) });
    const t = pdfText(new Uint8Array(await res.arrayBuffer()));
    expect(t).toContain('Deliver to Gate 2.\nCall security first.'); // two separate lines, not run together
  });

  it('warns when some characters could not be printed in the PDF', async () => {
    const s3 = await m.Supplier.create({ name: 'शिमानो Imports', code: 'S-3', email: 'x@shimano.test' });
    const po = await m.PO.create({ poNumber: 'PO-E-400', supplier: s3._id, status: 'ORDERED', totalAmount: 1, items: [{ product: d.p._id, quantity: 1, unitPrice: 1, totalPrice: 1 }] });
    const res = await call(r.dispatch.POST, 'POST', {}, { id: id(po) });
    expect(res.json.pdfWarning).toContain('could not be printed');
    const plain = await call(r.dispatch.POST, 'POST', {}, { id: id(d.po) });
    expect(plain.json.pdfWarning).toBeUndefined();
  });

  it('the PO list says plainly when nothing was delivered', async () => {
    // exercised in the UI: dispatch with no delivered channel must not read as "Sent"
    mail.fail = true;
    const po = await m.PO.create({ poNumber: 'PO-E-500', supplier: d.s._id, status: 'ORDERED', totalAmount: 1, items: [{ product: d.p._id, quantity: 1, unitPrice: 1, totalPrice: 1 }] });
    const res = await call(r.dispatch.POST, 'POST', {}, { id: id(po) });
    mail.fail = false;
    expect(res.json.delivered).toBe(false);
    const ok = await call(r.dispatch.POST, 'POST', {}, { id: id(po) });
    expect(ok.json.delivered).toBe(true);
    expect((await m.PO.findById(po._id)).dispatch.lastAttemptDelivered).toBe(true);
  });
});
