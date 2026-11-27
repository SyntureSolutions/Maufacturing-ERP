import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import Category from '@/models/Category';
import { getSession } from '@/lib/auth';
import { demoMode, demoOrThrow } from '@/lib/demoMode';

const SAMPLE_CATEGORIES = [
  { _id: 'cat-1', name: 'Finished Bicycles', slug: 'finished-bicycles', description: 'Complete urban, mountain, road and electric bikes' },
  { _id: 'cat-2', name: 'Frames & Chassis', slug: 'frames-chassis', description: 'Aluminum alloy, carbon fiber frames & rigid/suspension forks' },
  { _id: 'cat-3', name: 'Drivetrains & Transmission', slug: 'drivetrains', description: 'Gears, chains, derailleurs, cranksets, and pedals' },
  { _id: 'cat-4', name: 'Brakes & Steering', slug: 'brakes-steering', description: 'Hydraulic disc brakes, brake levers, handlebars & cables' },
  { _id: 'cat-5', name: 'Wheels & Tires', slug: 'wheels-tires', description: 'Alloy rims, spokes, inner tubes, and all-terrain tires' },
  { _id: 'cat-6', name: 'Packaging & Crates', slug: 'packaging-crates', description: 'Wooden crates, protective foam, and bulk shipping boxes' }
];

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
      await dbConnect();
      const categories = await Category.find({}).populate('parentId').sort({ name: 1 });
      // sample categories only in DEMO_MODE: their ids are not real, so an item cannot be filed under them
      return NextResponse.json(categories.length === 0 && demoMode() ? SAMPLE_CATEGORIES : categories);
    } catch (dbErr) {
      demoOrThrow(dbErr);
    }

    return NextResponse.json(SAMPLE_CATEGORIES);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const session = await getSession();
    if (!session || !['ADMIN', 'MANAGER'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { name, description, parentId } = await req.json();
    const slug = name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');

    try {
      await dbConnect();
      const category = await Category.create({ 
        name, 
        description, 
        slug, 
        parentId: parentId || null 
      });
      return NextResponse.json(category, { status: 201 });
    } catch (dbErr) {
      demoOrThrow(dbErr); // a category is only pretended in demo mode
      const newCat = {
        _id: `cat-${Date.now()}`,
        name,
        slug,
        description: description || '',
        parentId: parentId || null
      };
      SAMPLE_CATEGORIES.unshift(newCat);
      return NextResponse.json(newCat, { status: 201 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
