import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import { statusOf } from '@/lib/httpError';
import SourceList from '@/models/SourceList';
import { SOURCE_LIST_ROLES, sourceListEntry } from '@/lib/sourceList';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!SOURCE_LIST_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const body = await req.json();
    await dbConnect();
    const entry: any = await SourceList.findById(id);
    if (!entry) return NextResponse.json({ error: 'Source list entry not found.' }, { status: 404 });
    entry.set(await sourceListEntry(body, entry.toObject()));
    await entry.save();
    return NextResponse.json(entry);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}

// Removing an entry only changes who may supply from now on; purchase orders already raised are not affected.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!SOURCE_LIST_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    await dbConnect();
    const deleted = await SourceList.findByIdAndDelete(id);
    return deleted ? NextResponse.json({ message: 'Source list entry removed.' }) : NextResponse.json({ error: 'Source list entry not found.' }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
