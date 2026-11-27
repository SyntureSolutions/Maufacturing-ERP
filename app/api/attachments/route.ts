import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attachment from '@/models/Attachment';
import { verifyAuth } from '@/lib/auth';
import { canAccessAttachments, isAttachmentType } from '@/lib/attachmentAccess';

export const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'dwg', 'dxf', 'zip'];
const ENTITY_RE = /^[A-Z_]{2,30}$/;

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const entityType = req.nextUrl.searchParams.get('entityType'), entityId = req.nextUrl.searchParams.get('entityId');
    if (!entityType || !entityId) return NextResponse.json({ error: 'entityType and entityId are required.' }, { status: 400 });
    if (!canAccessAttachments(entityType, user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot see files on this kind of document.' }, { status: 403 });
    await dbConnect();
    return NextResponse.json(await Attachment.find({ entityType, entityId }).sort({ createdAt: -1 }).lean());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role === 'VIEWER') return NextResponse.json({ error: 'Viewers cannot upload files.' }, { status: 403 });
    const form = await req.formData();
    const file = form.get('file');
    const entityType = String(form.get('entityType') || ''), entityId = String(form.get('entityId') || '');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file supplied.' }, { status: 400 });
    if (!ENTITY_RE.test(entityType) || !entityId || !isAttachmentType(entityType)) return NextResponse.json({ error: 'Invalid attachment target.' }, { status: 400 });
    if (!canAccessAttachments(entityType, user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot attach files to this kind of document.' }, { status: 403 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File is larger than 5 MB.' }, { status: 413 });
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXT.includes(ext)) return NextResponse.json({ error: `File type .${ext} is not allowed.` }, { status: 415 });

    await dbConnect();
    const doc = await Attachment.create({
      entityType, entityId, filename: file.name.replace(/[^\w.\- ()]/g, '_').slice(0, 120), mimeType: file.type || 'application/octet-stream', size: file.size,
      category: String(form.get('category') || '') || undefined, data: Buffer.from(await file.arrayBuffer()), uploadedBy: user.name,
    });
    const { data, ...meta } = doc.toObject();
    void data;
    return NextResponse.json(meta, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
