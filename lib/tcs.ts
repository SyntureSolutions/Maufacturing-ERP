import { HttpError } from '@/lib/httpError';

// Tax collected at source on the sale of the goods listed in section 206C(1) of the Income-tax Act (scrap, minerals,
// forest produce...). The blanket TCS on all sales above Rs 50 lakh (206C(1H)) was withdrawn from 1 April 2025, so only
// items marked here carry TCS. The rate is kept on the item, because these rates change; the presets are a starting point.

export const TCS_GOODS = {
  SCRAP: { label: 'Scrap', rate: 1 },
  MINERALS: { label: 'Coal, lignite or iron ore', rate: 1 },
  FOREST: { label: 'Forest produce (not timber or tendu leaves)', rate: 2 },
  TIMBER: { label: 'Timber', rate: 2 },
  TENDU: { label: 'Tendu leaves', rate: 5 },
  LIQUOR: { label: 'Alcoholic liquor for human consumption', rate: 1 },
} as const;
export type TcsGoods = keyof typeof TCS_GOODS;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The item master's TCS fields: the type of goods (or none) and its rate. Only keys sent are returned. */
export function tcsFields(b: { tcsGoods?: any; tcsRate?: any }) {
  const out: { tcsGoods?: string; tcsRate?: number } = {};
  if (b.tcsGoods !== undefined) {
    const g = String(b.tcsGoods ?? '').trim().toUpperCase();
    if (g && !(g in TCS_GOODS)) throw new HttpError(400, `TCS goods must be one of ${Object.values(TCS_GOODS).map(x => x.label).join(', ')}.`);
    out.tcsGoods = g;
    if (!g) out.tcsRate = 0;
  }
  if (b.tcsRate !== undefined && out.tcsRate === undefined) {
    const n = b.tcsRate === '' || b.tcsRate === null ? 0 : Number(b.tcsRate);
    if (!Number.isFinite(n) || n < 0 || n > 20) throw new HttpError(400, 'TCS rate must be from 0 to 20%.');
    out.tcsRate = n;
  }
  if (out.tcsGoods && b.tcsRate === undefined) out.tcsRate = TCS_GOODS[out.tcsGoods as TcsGoods].rate; // the preset when no rate is typed
  return out;
}

export interface TcsRow { goods: string; rate: number; base: number; amount: number }

/**
 * TCS on an invoice: on each TCS line's value including GST, at the item's rate. None for a buyer outside India or one who
 * has given a Form 27C declaration (goods for manufacturing, not trading). A buyer with no PAN is charged twice the rate,
 * at least 5% (section 206CC).
 */
export function tcsFor(lines: { tcsGoods?: string; tcsRate?: number; totalAmount: number }[], buyer: { pan?: string; gstin?: string; country?: string; tcsDeclaration27C?: boolean }) {
  if ((buyer.country && buyer.country !== 'IN') || buyer.tcsDeclaration27C) return { rows: [] as TcsRow[], amount: 0 };
  const noPan = !buyer.pan && !buyer.gstin; // characters 3-12 of a GSTIN are the PAN
  const by = new Map<string, TcsRow>();
  for (const l of lines) {
    const base = Number(l.tcsRate) || 0;
    if (!(base > 0)) continue;
    const rate = noPan ? Math.max(base * 2, 5) : base;
    const key = `${l.tcsGoods || ''}|${rate}`;
    const row = by.get(key) || { goods: l.tcsGoods || '', rate, base: 0, amount: 0 };
    row.base = r2(row.base + l.totalAmount);
    by.set(key, row);
  }
  const rows = [...by.values()].map(r => ({ ...r, amount: r2((r.base * r.rate) / 100) }));
  return { rows, amount: r2(rows.reduce((t, r) => t + r.amount, 0)) };
}
