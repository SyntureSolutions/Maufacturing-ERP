import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import { statusOf } from '@/lib/httpError';
import StorageLocation from '@/models/StorageLocation';
import { ensureDefaultLocations } from '@/lib/storageLocations';
import { LOCATION_WRITE_ROLES, locationFields } from '@/lib/locationInput';

// Storage locations for put-away and batch moves. Active ones by default; ?all=1 includes those taken out of use.
export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    await ensureDefaultLocations();
    const all = req.nextUrl.searchParams.get('all') === '1';
    return NextResponse.json(await StorageLocation.find(all ? {} : { isActive: true }).sort({ code: 1 }).lean());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!LOCATION_WRITE_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const body = await req.json();
    await dbConnect();
    await ensureDefaultLocations();
    const created = await StorageLocation.create({ ...locationFields(body), code: body.code });
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
