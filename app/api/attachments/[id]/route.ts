import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attachment from '@/models/Attachment';
import { verifyAuth } from '@/lib/auth';
import { canAccessAttachments } from '@/lib/attachmentAccess';

// Only formats that cannot run script in the browser are shown inline; everything else downloads.
const INLINE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    await dbConnect();
    const doc: any = await Attachment.findById(id).select('+data');
    if (!doc) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    if (!canAccessAttachments(doc.entityType, user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot open files on this kind of document.' }, { status: 403 });
    const inline = INLINE.has(doc.mimeType);
    return new NextResponse(new Uint8Array(doc.data), {
      headers: {
        'Content-Type': inline ? doc.mimeType : 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(doc.filename)}"`,
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    await dbConnect();
    const doc: any = await Attachment.findById(id).select('uploadedBy entityType');
    if (!doc) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    if (!canAccessAttachments(doc.entityType, user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot change files on this kind of document.' }, { status: 403 });
    if (user.role !== 'ADMIN' && doc.uploadedBy !== user.name) return NextResponse.json({ error: 'Only the uploader or an Admin can delete this file.' }, { status: 403 });
    await Attachment.deleteOne({ _id: id });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
