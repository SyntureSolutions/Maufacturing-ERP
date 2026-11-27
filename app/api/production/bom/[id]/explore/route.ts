import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import { statusOf } from '@/lib/httpError';
import { canBuild, exploreBom } from '@/lib/bomExplore';

// GET ?qty=N          the BOM's multi-level tree with stock, its balance, where its item is used and its versions
// GET ?build=N        can N be made from stock now: what is short, and the most that can be made today

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Bill of materials not found.' }, { status: 404 });
    await dbConnect();
    const q = req.nextUrl.searchParams;
    if (q.has('build')) return NextResponse.json(await canBuild(id, Number(q.get('build'))));
    return NextResponse.json(await exploreBom(id, Number(q.get('qty')) || undefined));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
