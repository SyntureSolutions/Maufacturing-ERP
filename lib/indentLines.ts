import mongoose from 'mongoose';
import PurchaseOrder from '@/models/PurchaseOrder';
import PurchaseIndent from '@/models/PurchaseIndent';
import { HttpError } from '@/lib/httpError';

// Purchase requisition (indent) lines and the PO lines that order them.
// The link lives on the PO line (`items.sources`); how much of a requisition line is ordered is worked out from
// the POs that are not cancelled, so cancelling a PO frees the requisition quantity without any other update.

const key = (indent: any, lineNo: number) => `${String(indent)}|${lineNo}`;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Quantity ordered so far per indent line ("<indentId>|<lineNo>"), across POs that are not cancelled. */
export async function orderedByIndentLine(indentIds: any[], excludePoId?: any) {
  const ids = indentIds.map(String).filter(id => mongoose.isValidObjectId(id)).map(id => new mongoose.Types.ObjectId(id));
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const match: any = { status: { $ne: 'CANCELLED' }, 'items.sources.indent': { $in: ids } };
  if (excludePoId) match._id = { $ne: new mongoose.Types.ObjectId(String(excludePoId)) };
  const pos: any[] = await PurchaseOrder.find(match).select('items.sources').lean();
  for (const po of pos) for (const item of po.items || []) for (const s of item.sources || []) {
    if (!ids.some(id => id.equals(s.indent))) continue;
    out.set(key(s.indent, s.lineNo), r4((out.get(key(s.indent, s.lineNo)) || 0) + s.quantity));
  }
  return out;
}

/** Indents with `orderedQty` and `openQty` on every line, for display. */
export async function withOrderedQuantities(indents: any[]) {
  const ordered = await orderedByIndentLine(indents.map(i => i._id));
  return indents.map(indent => {
    const plain = typeof indent.toObject === 'function' ? indent.toObject() : indent;
    return {
      ...plain,
      items: (plain.items || []).map((line: any) => {
        const orderedQty = ordered.get(key(plain._id, line.lineNo)) || 0;
        return { ...line, orderedQty, openQty: r4(Math.max(0, line.quantity - orderedQty)) };
      }),
    };
  });
}

/**
 * Checks the requisition lines a new or edited PO line says it orders: the indent must be approved, the line must exist
 * and be for the same product, and the PO cannot order more of it than is still open. Returns the cleaned sources.
 * `excludePoId` leaves out the PO being edited, so its own earlier quantities do not count against it.
 */
export async function checkPoLineSources(lines: { product: string; quantity: number; sources?: any[] }[], excludePoId?: any) {
  const all = lines.flatMap(l => l.sources || []);
  if (!all.length) return lines.map(() => [] as { indent: string; lineNo: number; quantity: number }[]);
  for (const s of all) if (!mongoose.isValidObjectId(String(s?.indent))) throw new HttpError(400, 'A requisition reference is not valid.');
  const indents: any[] = await PurchaseIndent.find({ _id: { $in: [...new Set(all.map(s => String(s.indent)))] } }).lean();
  const ordered = await orderedByIndentLine(indents.map(i => i._id), excludePoId);
  const claimed = new Map<string, number>();

  return lines.map((line, n) => {
    const sources = (line.sources || []).map((raw: any) => {
      const indent = indents.find(i => String(i._id) === String(raw.indent));
      if (!indent) throw new HttpError(400, `Line ${n + 1}: requisition not found.`);
      // A requisition in an RFQ is ordered by the award; a hand-made PO may not order it too. A PO the award created keeps its links when edited.
      const allowed = excludePoId ? ['APPROVED', 'RFQ_CREATED'] : ['APPROVED'];
      if (!allowed.includes(indent.status)) throw new HttpError(409, `Line ${n + 1}: requisition ${indent.number} is ${indent.status}; only approved requisitions that are not in an RFQ can be ordered.`);
      const lineNo = Number(raw.lineNo);
      const reqLine = (indent.items || []).find((i: any) => i.lineNo === lineNo);
      if (!reqLine) throw new HttpError(400, `Line ${n + 1}: requisition ${indent.number} has no line ${raw.lineNo}.`);
      if (String(reqLine.product) !== String(line.product)) throw new HttpError(400, `Line ${n + 1}: requisition ${indent.number} line ${lineNo} is for a different product.`);
      const quantity = Number(raw.quantity ?? reqLine.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpError(400, `Line ${n + 1}: the quantity taken from a requisition must be more than zero.`);
      const k = key(indent._id, lineNo);
      const open = r4(reqLine.quantity - (ordered.get(k) || 0) - (claimed.get(k) || 0));
      if (quantity > open + 1e-9) throw new HttpError(409, `Line ${n + 1}: only ${open} is still open on requisition ${indent.number} line ${lineNo}.`);
      claimed.set(k, r4((claimed.get(k) || 0) + quantity));
      return { indent: String(indent._id), lineNo, quantity };
    });
    const total = sources.reduce((s, x) => s + x.quantity, 0);
    if (total > line.quantity + 1e-9) throw new HttpError(400, `Line ${n + 1}: the requisitions add up to ${r4(total)}, more than the ${line.quantity} ordered.`);
    return sources;
  });
}
