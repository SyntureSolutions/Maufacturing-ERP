export interface LabelData {
  sku: string;
  gtin?: string; // numeric GTIN (8-14 digits); if absent the SKU is encoded under AI 91
  batchNo: string;
  serialNo: string;
  mfgDate: Date;
  mrp?: number;
}

export const FNC1 = '\xf1'; // JsBarcode's FNC1 character for GS1-128

export const LABEL_SIZES = {
  '50x25': { w: 50, h: 25, label: '50 × 25 mm' },
  '100x50': { w: 100, h: 50, label: '100 × 50 mm' },
} as const;
export type LabelSize = keyof typeof LABEL_SIZES;

export const yymmdd = (d: Date) => `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

const clean = (v: string) => v.replace(/[^\x21-\x7e]/g, '').slice(0, 20); // GS1 AI values: printable ASCII, max 20

/** GS1-128 element string: fixed-length AIs first, variable-length AIs separated by FNC1. */
export function buildGs1(d: LabelData) {
  const gtin = d.gtin && /^\d{8,14}$/.test(d.gtin) ? d.gtin.padStart(14, '0') : null;
  const parts: string[] = [];
  parts.push(gtin ? `01${gtin}11${yymmdd(d.mfgDate)}` : `11${yymmdd(d.mfgDate)}`);
  const variable: string[] = [];
  if (!gtin) variable.push(`91${clean(d.sku)}`);
  variable.push(`10${clean(d.batchNo)}`);
  if (d.mrp && d.mrp > 0) variable.push(`3920${Math.round(d.mrp)}`); // 392n: amount payable, n = 0 decimals
  variable.push(`21${clean(d.serialNo)}`);
  const encoded = FNC1 + parts[0] + variable.join(FNC1);
  const human = [gtin ? `(01)${gtin}` : '', `(11)${yymmdd(d.mfgDate)}`, !gtin ? `(91)${clean(d.sku)}` : '', `(10)${clean(d.batchNo)}`, d.mrp ? `(3920)${Math.round(d.mrp)}` : '', `(21)${clean(d.serialNo)}`].filter(Boolean).join('');
  return { encoded, human };
}

/** Serial numbers batch-001 ... for a run of labels */
export function serialRange(prefix: string, start: number, count: number) {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(start + i).padStart(4, '0')}`);
}
