import { HttpError } from '@/lib/httpError';

/**
 * Document line numbers in steps of 10 (10, 20, 30...), as on SAP documents and the bulk SO template.
 * Lines that already have a number keep it, so a line is still found by its number after other lines are added
 * or removed; new lines continue after the highest number in use.
 */
export const LINE_STEP = 10;

export function numberLines(items: { lineNo?: number | null }[] | undefined | null) {
  if (!items?.length) return;
  let next = items.reduce((max, i) => Math.max(max, Number(i.lineNo) || 0), 0);
  for (const item of items) {
    if (!(Number(item.lineNo) > 0)) {
      next = Math.floor(next / LINE_STEP) * LINE_STEP + LINE_STEP;
      item.lineNo = next;
    }
  }
}

/** Mongoose plugin body: number `items` before every validation, and refuse two lines with the same number. */
export function lineNumbersHook(this: any) {
  numberLines(this.items);
  const seen = new Set<number>();
  for (const i of this.items || []) {
    if (seen.has(i.lineNo)) throw new HttpError(400, `Line number ${i.lineNo} is used twice.`);
    seen.add(i.lineNo);
  }
}

/** When a line is due: its own date, or the document's. */
export function lineDueDate(line: { deliveryDate?: Date | null; requiredDeliveryDate?: Date | null }, doc: { deliveryDate?: Date | null; expectedDeliveryDate?: Date | null }) {
  return line.deliveryDate || line.requiredDeliveryDate || doc.expectedDeliveryDate || doc.deliveryDate || undefined;
}
