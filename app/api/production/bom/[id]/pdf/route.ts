import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import BillOfMaterials from '@/models/BillOfMaterials';
import Product from '@/models/Product';
import CompanySettings from '@/models/CompanySettings';
import { verifyAuth } from '@/lib/auth';
import { bomSpec } from '@/lib/printDocs';
import { buildPrintPdf } from '@/lib/printLayout';
import { safeFileName } from '@/lib/documentPdf';

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'QUALITY_INSPECTOR', 'SUPPLY_CHAIN_MANAGER', 'VIEWER', 'STAFF'];

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await context.params;
    await dbConnect();

    let bom: any = null;
    let product: any = null;

    if (mongoose.isValidObjectId(id)) {
      bom = await BillOfMaterials.findById(id).populate('product').populate('components.product', 'name sku uom').populate('outputs.product', 'name sku uom').lean();
      if (!bom) {
        // ID could be product ID
        bom = await BillOfMaterials.findOne({ product: id }).populate('product').populate('components.product', 'name sku uom').populate('outputs.product', 'name sku uom').lean();
      }
    }

    if (bom?.product) {
      product = bom.product;
    } else if (bom) {
      product = await Product.findById(bom.product).lean();
    }

    if (!bom) return NextResponse.json({ error: 'Bill of materials not found.' }, { status: 404 });

    const company: any = await CompanySettings.findOne({ key: 'company' }).lean();
    const pdf = await buildPrintPdf(bomSpec(bom, product), company || {});
    const isDownload = req.nextUrl.searchParams.get('download') === '1';
    const disposition = isDownload ? 'attachment' : 'inline';

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${safeFileName(product?.name ? `BOM_${product.name}` : 'BOM_Specification')}"`,
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
