import { createHash } from 'crypto';

// NIC e-invoice (schema 1.1) and e-way bill JSON builders.
// The IRP/EWB portals issue the official IRN acknowledgement, signed QR and e-way bill number;
// these helpers only produce the upload payloads and the deterministic IRN hash.

const ddmmyyyy = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Financial year string used in the IRN hash, e.g. 2026-27
export function financialYear(d: Date) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String(y + 1).slice(-2)}`;
}

/** IRN = SHA-256(supplier GSTIN + FY + doc type + doc number), as specified by the IRP. */
export function computeIrn(sellerGstin: string, invoiceDate: Date, docType: 'INV' | 'CRN' | 'DBN', docNo: string) {
  return createHash('sha256').update(`${sellerGstin}${financialYear(invoiceDate)}${docType}${docNo}`).digest('hex');
}

export interface Party { gstin?: string; name: string; address1: string; address2?: string; city: string; pincode: string; stateCode: string; phone?: string; email?: string }
export interface DocItem { description: string; hsnCode: string; quantity: number; uom?: string; unitPrice: number; listPrice?: number; chargeShare?: number; taxableValue: number; gstRate: number; cgstAmount: number; sgstAmount: number; igstAmount: number; totalAmount: number }
export interface DocInput {
  number: string; date: Date; seller: Party; buyer: Party; placeOfSupply: string; items: DocItem[];
  subTotal: number; totalCGST: number; totalSGST: number; totalIGST: number; totalAmount: number;
  otherCharges?: number; // TCS: outside the GST values, inside the invoice value
}

const UNIT_MAP: Record<string, string> = { pcs: 'PCS', unit: 'UNT', units: 'UNT', set: 'SET', kg: 'KGS', box: 'BOX', ltr: 'LTR', mtr: 'MTR' };
export const nicUnit = (u?: string) => UNIT_MAP[(u || '').toLowerCase()] || 'OTH';

export function buildEInvoiceJson(d: DocInput) {
  const errors: string[] = [];
  if (!d.seller.gstin) errors.push('Seller GSTIN missing (set it in Company Settings).');
  if (!d.buyer.gstin) errors.push('Buyer GSTIN missing: e-invoice applies to B2B supplies only.');
  if (d.seller.pincode?.length !== 6 || d.buyer.pincode?.length !== 6) errors.push('Seller and buyer need 6-digit pincodes.');
  if (d.items.some(i => !i.hsnCode)) errors.push('Every item needs an HSN code.');
  const json = {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', EcmGstin: null, IgstOnIntra: 'N' },
    DocDtls: { Typ: 'INV', No: d.number, Dt: ddmmyyyy(d.date) },
    SellerDtls: { Gstin: d.seller.gstin, LglNm: d.seller.name, Addr1: d.seller.address1, ...(d.seller.address2 ? { Addr2: d.seller.address2 } : {}), Loc: d.seller.city, Pin: Number(d.seller.pincode), Stcd: d.seller.stateCode },
    BuyerDtls: { Gstin: d.buyer.gstin, LglNm: d.buyer.name, Pos: d.placeOfSupply, Addr1: d.buyer.address1, ...(d.buyer.address2 ? { Addr2: d.buyer.address2 } : {}), Loc: d.buyer.city, Pin: Number(d.buyer.pincode), Stcd: d.buyer.stateCode },
    ItemList: d.items.map((i, n) => {
      // the portal wants AssAmt = TotAmt - Discount: the gross is at the list rate with this line's share of freight and
      // other charges (they are taxed with the goods), and the discount takes it down to the taxable value
      const gross = r2(i.quantity * (i.listPrice || i.unitPrice) + (i.chargeShare || 0));
      const discount = r2(gross - i.taxableValue);
      return {
        SlNo: String(n + 1), PrdDesc: i.description, IsServc: 'N', HsnCd: i.hsnCode, Qty: i.quantity, Unit: nicUnit(i.uom),
        UnitPrice: i.quantity ? Math.round((gross / i.quantity) * 1000) / 1000 : 0, TotAmt: gross, ...(discount > 0 ? { Discount: discount } : {}), AssAmt: i.taxableValue, GstRt: i.gstRate,
        IgstAmt: i.igstAmount, CgstAmt: i.cgstAmount, SgstAmt: i.sgstAmount, TotItemVal: i.totalAmount,
      };
    }),
    ValDtls: { AssVal: d.subTotal, CgstVal: d.totalCGST, SgstVal: d.totalSGST, IgstVal: d.totalIGST, ...(d.otherCharges ? { OthChrg: d.otherCharges } : {}), TotInvVal: d.totalAmount },
  };
  return { json, errors };
}

export interface TransportInput { mode?: 'ROAD' | 'RAIL' | 'AIR' | 'SHIP'; distanceKm: number; transporterName?: string; transporterId?: string; docNo?: string; docDate?: Date; vehicleNo?: string }

export function buildEwayBillJson(d: DocInput, t: TransportInput) {
  const errors: string[] = [];
  if (!d.seller.gstin) errors.push('Seller GSTIN missing.');
  if (!(t.distanceKm >= 0)) errors.push('Approximate distance in km is required.');
  if (!t.vehicleNo && !t.transporterId) errors.push('Enter a vehicle number or a transporter ID.');
  const modeCode = { ROAD: 1, RAIL: 2, AIR: 3, SHIP: 4 }[t.mode || 'ROAD'];
  const json = {
    version: '1.0.0621',
    billLists: [{
      userGstin: d.seller.gstin, supplyType: 'O', subSupplyType: 1, docType: 'INV', docNo: d.number, docDate: ddmmyyyy(d.date),
      fromGstin: d.seller.gstin, fromTrdName: d.seller.name, fromAddr1: d.seller.address1, fromAddr2: d.seller.address2 || '', fromPlace: d.seller.city,
      fromPincode: Number(d.seller.pincode), fromStateCode: Number(d.seller.stateCode), actualFromStateCode: Number(d.seller.stateCode),
      toGstin: d.buyer.gstin || 'URP', toTrdName: d.buyer.name, toAddr1: d.buyer.address1, toAddr2: d.buyer.address2 || '', toPlace: d.buyer.city,
      toPincode: Number(d.buyer.pincode), toStateCode: Number(d.placeOfSupply), actualToStateCode: Number(d.buyer.stateCode),
      transactionType: 1, totalValue: d.subTotal, cgstValue: d.totalCGST, sgstValue: d.totalSGST, igstValue: d.totalIGST, cessValue: 0, totInvValue: d.totalAmount,
      transporterId: t.transporterId || '', transporterName: t.transporterName || '', transDocNo: t.docNo || '', transMode: modeCode,
      transDistance: Math.round(t.distanceKm), transDocDate: t.docDate ? ddmmyyyy(t.docDate) : '', vehicleNo: (t.vehicleNo || '').replace(/\s/g, '').toUpperCase(), vehicleType: 'R',
      itemList: d.items.map(i => ({
        productName: i.description, productDesc: i.description, hsnCode: Number(i.hsnCode) || i.hsnCode, quantity: i.quantity, qtyUnit: nicUnit(i.uom),
        taxableAmount: i.taxableValue, sgstRate: i.sgstAmount ? i.gstRate / 2 : 0, cgstRate: i.cgstAmount ? i.gstRate / 2 : 0, igstRate: i.igstAmount ? i.gstRate : 0, cessRate: 0,
      })),
    }],
  };
  return { json, errors };
}

/** GST rules require an e-way bill for consignments above Rs 50,000 */
export const EWAY_THRESHOLD = 50000;
