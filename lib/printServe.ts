import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CompanySettings from '@/models/CompanySettings';
import { verifyAuth } from '@/lib/auth';
import { safeFileName } from '@/lib/documentPdf';
import { buildPrintPdf } from '@/lib/printLayout';
import { PRINT_TYPES } from '@/lib/printDocs';

/** Answers a PDF request for one document of a kind in lib/printDocs: inline for the preview, ?download=1 to save it */
export async function servePrint(req: NextRequest, type: string, id: string) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const kind = PRINT_TYPES[type];
    if (!kind) return NextResponse.json({ error: 'There is no printout for that kind of document.' }, { status: 404 });
    if (!kind.roles.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await dbConnect();
    const spec = await kind.load(id, req.nextUrl.searchParams, { origin: process.env.APP_URL || req.nextUrl.origin });
    if (!spec) return NextResponse.json({ error: `${kind.label} not found.` }, { status: 404 });
    const company: any = await CompanySettings.findOne({ key: 'company' }).lean();
    const pdf = await buildPrintPdf(spec, company || {});
    const disposition = req.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline';
    return new NextResponse(Buffer.from(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${disposition}; filename="${safeFileName(spec.number)}"`, 'Cache-Control': 'private, no-store' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
