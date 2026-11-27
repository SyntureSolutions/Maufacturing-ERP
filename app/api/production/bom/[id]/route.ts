import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import BillOfMaterials from '@/models/BillOfMaterials';
import WorkOrder from '@/models/WorkOrder';
import '@/models/Product';
import { verifyAuth } from '@/lib/auth';
import { HttpError, statusOf } from '@/lib/httpError';
import { requestApproval } from '@/lib/approvals';
import { BOM_EDIT_ROLES, activateBom, assertNoLoop, cleanBomInput, nextVersion } from '@/lib/bom';

// One bill of materials.
// PATCH { ...fields }                  edits a draft
// PATCH { action: 'activate' }         makes a draft the item's default; if the approval matrix has a BOM activation rule it goes for approval first
// PATCH { action: 'new-version' }      copies this BOM into a new draft
// DELETE                               removes a draft that no work order uses

type Ctx = { params: Promise<{ id: string }> };

const load = (id: string) => BillOfMaterials.findById(id)
  .populate('product', 'name sku uom productType')
  .populate('components.product', 'name sku uom purchaseUom purchaseConversion')
  .populate('outputs.product', 'name sku uom purchaseUom purchaseConversion isScrap')
  .lean();

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Bill of materials not found.' }, { status: 404 });
    await dbConnect();
    const bom = await load(id);
    if (!bom) return NextResponse.json({ error: 'Bill of materials not found.' }, { status: 404 });
    return NextResponse.json(bom);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!BOM_EDIT_ROLES.includes(user.role)) return NextResponse.json({ error: 'Only an Admin, Manager or Production Manager can change a bill of materials.' }, { status: 403 });
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Bill of materials not found.' }, { status: 404 });
    await dbConnect();
    const body = await req.json();
    const bom: any = await BillOfMaterials.findById(id).lean();
    if (!bom) return NextResponse.json({ error: 'Bill of materials not found.' }, { status: 404 });

    if (body.action === 'new-version') {
      const version = await nextVersion(String(bom.product));
      const copy = await BillOfMaterials.create({
        product: bom.product, version, baseQuantity: bom.baseQuantity || 1, notes: bom.notes, copiedFrom: bom._id,
        components: bom.components.map((c: any) => ({ product: c.product, quantity: c.quantity, unit: c.unit, unitFactor: c.unitFactor || 1, wastagePercentage: c.wastagePercentage || 0 })),
        outputs: (bom.outputs || []).map((o: any) => ({ product: o.product, kind: o.kind, quantity: o.quantity, unit: o.unit, unitFactor: o.unitFactor || 1 })),
        routingSteps: bom.routingSteps.map((s: any) => ({ stepNumber: s.stepNumber, description: s.description, machineType: s.machineType, estimatedTimeMinutes: s.estimatedTimeMinutes })),
        status: 'DRAFT', isDefault: false, createdBy: user.name,
      });
      return NextResponse.json(copy, { status: 201 });
    }

    if (body.action === 'activate') {
      if (bom.status !== 'DRAFT') return NextResponse.json({ error: bom.status === 'PENDING_APPROVAL' ? 'This BOM is already waiting for approval.' : 'Only a draft can be activated. Make a new version to change this BOM.' }, { status: 409 });
      // checked before anyone is asked to approve it
      const clean = await cleanBomInput({}, bom);
      await assertNoLoop(clean.product, clean.components.map(c => c.product));
      // claim the draft so two clicks cannot both submit it
      const claimed = await BillOfMaterials.findOneAndUpdate({ _id: id, status: 'DRAFT' }, { status: 'PENDING_APPROVAL', submittedBy: user.name }, { returnDocument: 'after' }).populate('product', 'sku name');
      if (!claimed) return NextResponse.json({ error: 'This BOM was changed by someone else. Refresh and try again.' }, { status: 409 });
      try {
        const p: any = claimed.product;
        const request = await requestApproval({
          module: 'BOM_ACTIVATION', refId: String(claimed._id), refNumber: `${p?.sku || p?.name || 'BOM'} v${claimed.version}`, amount: 0,
          requestedBy: user.name, requestedById: user.id, requestedByRole: user.role,
          summary: `${p?.name || 'Item'}: ${claimed.components.length} component${claimed.components.length === 1 ? '' : 's'}, makes ${claimed.baseQuantity || 1}`,
        });
        if (request) return NextResponse.json({ status: 'PENDING_APPROVAL', request: { _id: request._id, levels: request.levels.map((l: any) => l.role) } }, { status: 202 });
        await activateBom(id, user.name);
        return NextResponse.json(await load(id));
      } catch (err) {
        await BillOfMaterials.updateOne({ _id: id, status: 'PENDING_APPROVAL' }, { status: 'DRAFT', $unset: { submittedBy: 1 } });
        throw err;
      }
    }

    if (body.action) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });

    // edit a draft
    if (bom.status !== 'DRAFT') return NextResponse.json({ error: bom.status === 'PENDING_APPROVAL' ? 'This BOM is waiting for approval and cannot be edited.' : 'An active or obsolete BOM cannot be edited. Make a new version instead.' }, { status: 409 });
    if (body.product !== undefined && String(body.product) !== String(bom.product)) throw new HttpError(400, 'The item a BOM makes cannot be changed. Make a new BOM for the other item.');
    const clean = await cleanBomInput(body, bom);
    await assertNoLoop(clean.product, clean.components.map(c => c.product));
    const version = clean.version || bom.version;
    if (version !== bom.version && await BillOfMaterials.exists({ product: bom.product, version })) return NextResponse.json({ error: `Version ${version} already exists for this item.` }, { status: 409 });
    const saved = await BillOfMaterials.findOneAndUpdate(
      { _id: id, status: 'DRAFT' },
      { version, baseQuantity: clean.baseQuantity, components: clean.components, outputs: clean.outputs, routingSteps: clean.routingSteps, notes: clean.notes },
      { returnDocument: 'after', runValidators: true },
    );
    if (!saved) return NextResponse.json({ error: 'This BOM is no longer a draft. Refresh to see it.' }, { status: 409 });
    return NextResponse.json(await load(id));
  } catch (err: any) {
    if (err?.code === 11000) return NextResponse.json({ error: 'That version already exists for this item.' }, { status: 409 });
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!BOM_EDIT_ROLES.includes(user.role)) return NextResponse.json({ error: 'Only an Admin, Manager or Production Manager can delete a bill of materials.' }, { status: 403 });
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Bill of materials not found.' }, { status: 404 });
    await dbConnect();
    if (await WorkOrder.exists({ bom: id })) return NextResponse.json({ error: 'A work order uses this BOM, so it is kept.' }, { status: 409 });
    const gone = await BillOfMaterials.findOneAndDelete({ _id: id, status: 'DRAFT' });
    if (!gone) return NextResponse.json({ error: (await BillOfMaterials.exists({ _id: id })) ? 'Only a draft can be deleted. An active BOM is retired by activating a newer version.' : 'Bill of materials not found.' }, { status: 409 });
    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
