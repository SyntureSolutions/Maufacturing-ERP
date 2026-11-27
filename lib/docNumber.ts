import type { Model } from 'mongoose';

// Sequential document number per year, e.g. IND-2026-0001
/**
 * Creates a document under the next sequential number. Two people creating at the same moment can be handed the same number;
 * the unique index refuses the second, which then simply asks for the next number and tries again.
 */
export async function createNumbered<T>(model: Model<any>, prefix: string, field: string, make: (number: string) => Promise<T>, attempts = 8): Promise<T> {
  for (let i = 1; ; i++) {
    const number = await nextDocNumber(model, prefix, field);
    try { return await make(number); } catch (err: any) {
      const clash = err?.code === 11000 && (err?.keyPattern?.[field] || String(err?.message).includes(field));
      if (!clash || i >= attempts) throw err;
    }
  }
}

export async function nextDocNumber(model: Model<any>, prefix: string, field = 'number') {
  const year = new Date().getFullYear();
  const stem = `${prefix}-${year}-`;
  const last = await model.findOne({ [field]: new RegExp(`^${stem}`) }).sort({ [field]: -1 }).select(field).lean() as any;
  const seq = last ? parseInt(String(last[field]).slice(stem.length), 10) + 1 : 1;
  return `${stem}${String(seq).padStart(4, '0')}`;
}
