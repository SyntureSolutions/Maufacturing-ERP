export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const isValidGstin = (g: string) => GSTIN_RE.test(g);
export const stateCodeOf = (gstin?: string) => (gstin && /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : '');

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface TaxLineInput { productId?: string; description: string; hsnCode: string; quantity: number; unitPrice: number; gstRate: number; uom?: string }
export interface TaxLine extends TaxLineInput {
  goodsValue: number;    // quantity x rate
  chargeShare: number;   // this line's part of the document charges (freight, packing...)
  taxableValue: number; cgstRate: number; cgstAmount: number; sgstRate: number; sgstAmount: number; igstRate: number; igstAmount: number; totalAmount: number;
}
export interface HsnSummaryRow { hsnCode: string; taxableValue: number; cgst: number; sgst: number; igst: number; totalTax: number }

/** Freight, packing & forwarding, insurance or other charges billed with the goods */
export interface ChargeInput { label: string; amount: number }
export const CHARGE_LABELS = ['Freight', 'Packing & Forwarding', 'Insurance', 'Loading / Unloading', 'Other charges'] as const;

/**
 * Charges spread over the lines in proportion to their value (the last line takes the rounding), so each part is
 * taxed at its line's GST rate and reported under its HSN: under GST, charges billed with the goods follow the goods.
 */
export function spreadCharges(values: number[], charges: ChargeInput[] = []) {
  const total = r2(charges.reduce((t, c) => t + (Number(c.amount) || 0), 0));
  const base = values.reduce((t, v) => t + v, 0);
  const shares = values.map(v => (base > 0 ? r2((total * v) / base) : 0));
  if (values.length) shares[values.length - 1] = r2(total - shares.slice(0, -1).reduce((t, v) => t + v, 0));
  return shares;
}

/** Intra-state supply => CGST + SGST (half each); inter-state => IGST. Each line is rounded to paise. Charges are spread over the lines. */
export function computeTax(lines: TaxLineInput[], sellerStateCode: string, placeOfSupplyStateCode: string, charges: ChargeInput[] = []) {
  const intra = !!sellerStateCode && sellerStateCode === placeOfSupplyStateCode;
  const goods = lines.map(l => r2(l.quantity * l.unitPrice));
  const shares = spreadCharges(goods, charges);
  const items: TaxLine[] = lines.map((l, n) => {
    const taxable = r2(goods[n] + shares[n]);
    const tax = r2(taxable * l.gstRate / 100);
    const half = r2(tax / 2);
    return {
      ...l, goodsValue: goods[n], chargeShare: shares[n], taxableValue: taxable,
      cgstRate: intra ? l.gstRate / 2 : 0, cgstAmount: intra ? half : 0,
      sgstRate: intra ? l.gstRate / 2 : 0, sgstAmount: intra ? r2(tax - half) : 0,
      igstRate: intra ? 0 : l.gstRate, igstAmount: intra ? 0 : tax,
      totalAmount: r2(taxable + tax),
    };
  });
  const sum = (f: (i: TaxLine) => number) => r2(items.reduce((s, i) => s + f(i), 0));
  const hsn = new Map<string, HsnSummaryRow>();
  for (const i of items) {
    const row = hsn.get(i.hsnCode) || { hsnCode: i.hsnCode, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 };
    row.taxableValue = r2(row.taxableValue + i.taxableValue);
    row.cgst = r2(row.cgst + i.cgstAmount);
    row.sgst = r2(row.sgst + i.sgstAmount);
    row.igst = r2(row.igst + i.igstAmount);
    row.totalTax = r2(row.cgst + row.sgst + row.igst);
    hsn.set(i.hsnCode, row);
  }
  return {
    intraState: intra, items,
    goodsTotal: sum(i => i.goodsValue), chargesTotal: sum(i => i.chargeShare), charges: charges.filter(c => Number(c.amount) > 0),
    subTotal: sum(i => i.taxableValue), totalCGST: sum(i => i.cgstAmount), totalSGST: sum(i => i.sgstAmount), totalIGST: sum(i => i.igstAmount),
    totalAmount: sum(i => i.totalAmount), hsnSummary: [...hsn.values()],
  };
}

export function amountInWords(amount: number) {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n: number) => (n < 20 ? a[n] : `${b[Math.floor(n / 10)]}${n % 10 ? ' ' + a[n % 10] : ''}`);
  const three = (n: number) => (n >= 100 ? `${a[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' + two(n % 100) : ''}` : two(n));
  const rupees = Math.floor(amount), paise = Math.round((amount - rupees) * 100);
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10000000), lakh = Math.floor((rupees % 10000000) / 100000), thousand = Math.floor((rupees % 100000) / 1000), rest = rupees % 1000;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  const words = (parts.join(' ') || 'Zero') + ' Rupees';
  return `${words}${paise ? ` and ${two(paise)} Paise` : ''} Only`;
}

/** GST state / union territory codes (first two digits of a GSTIN) and their names, for "Place of Supply". */
export const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland',
  '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '96': 'Other Country',
};
export const stateName = (code?: string) => (code ? GST_STATES[code] || `State ${code}` : '');
