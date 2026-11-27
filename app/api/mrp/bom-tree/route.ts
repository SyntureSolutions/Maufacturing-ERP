import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { buildBomTree } from '@/lib/mrpEngine';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const product = req.nextUrl.searchParams.get('product');
    if (!product) return NextResponse.json({ error: 'product is required.' }, { status: 400 });
    await dbConnect();
    const tree = await buildBomTree(product);
    if (!tree) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    return NextResponse.json(tree);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
