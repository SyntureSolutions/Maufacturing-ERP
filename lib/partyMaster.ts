import { HttpError } from '@/lib/httpError';
import { isValidGstin } from '@/lib/gst';
import { INCOTERMS } from '@/lib/quoteTerms';

// Shared checks for customer and vendor master data loaded from the ERP master templates.

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const blank = (v: any) => v === undefined || v === null || String(v).trim() === '';

/** Accepts a stored code (SOLD_TO) or its template label ("Sold-To Party"); returns the code or throws 400. */
export function groupCode<T extends string>(value: any, labels: Record<T, string>, what: string): T {
  const v = String(value).trim();
  const hit = (Object.keys(labels) as T[]).find(k => k === v.toUpperCase() || labels[k].toLowerCase() === v.toLowerCase());
  if (!hit) throw new HttpError(400, `${what} must be one of ${Object.values(labels).join(', ')}.`);
  return hit;
}

/** Country code, defaulting to India. */
export function countryOf(value: any): string {
  if (blank(value)) return 'IN';
  const c = String(value).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) throw new HttpError(400, 'Country must be a 2-letter code (e.g. IN).');
  return c;
}

/** Indian postal codes are 6 digits; other countries are taken as written. */
export function checkPostalCode(country: string, pincode: any) {
  if (country === 'IN' && !blank(pincode) && !/^\d{6}$/.test(String(pincode).trim())) throw new HttpError(400, 'Pincode must be 6 digits.');
}

/**
 * The template's "Tax ID / PAN" and "GST / VAT No." columns. For India they are a PAN and a GSTIN and must be valid
 * (the GSTIN decides the GST state). For other countries they are kept as a foreign tax id and VAT number.
 * Only keys that were sent are returned, so an update leaves the others alone.
 */
export function taxNumbers(country: string, b: { pan?: any; gstin?: any; taxId?: any; vatNumber?: any }) {
  const out: { pan?: string; gstin?: string; taxId?: string; vatNumber?: string } = {};
  const up = (v: any) => String(v ?? '').toUpperCase().trim();
  if (country === 'IN') {
    if (b.gstin !== undefined) {
      out.gstin = up(b.gstin);
      if (out.gstin && !isValidGstin(out.gstin)) throw new HttpError(400, 'GSTIN format is invalid.');
    }
    if (b.pan !== undefined || b.taxId !== undefined) {
      out.pan = up(blank(b.pan) ? b.taxId : b.pan);
      if (out.pan && !PAN_RE.test(out.pan)) throw new HttpError(400, 'PAN format is invalid.');
    }
    if (!out.pan && out.gstin) out.pan = out.gstin.slice(2, 12); // characters 3-12 of a GSTIN are the PAN
  } else {
    // A foreign party has no GSTIN; whatever was sent as PAN/GSTIN is its own tax id / VAT number.
    if (b.taxId !== undefined || b.pan !== undefined) out.taxId = String((blank(b.taxId) ? b.pan : b.taxId) ?? '').trim();
    if (b.vatNumber !== undefined || b.gstin !== undefined) out.vatNumber = String((blank(b.vatNumber) ? b.gstin : b.vatNumber) ?? '').trim();
    out.gstin = '';
    out.pan = '';
  }
  return out;
}

/** Incoterms 2020 code, or undefined when not given. */
export function incotermOf(value: any): string | undefined {
  if (blank(value)) return undefined;
  const t = String(value).split('(')[0].trim().toUpperCase();
  if (!INCOTERMS.includes(t)) throw new HttpError(400, `Incoterm must be one of ${INCOTERMS.join(', ')}.`);
  return t;
}

/** A non-negative amount, or undefined when not given. */
export function amountOf(value: any, what: string): number | undefined {
  if (blank(value)) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${what} must be zero or more.`);
  return n;
}

/** GST registration of a party: it decides whether a GSTIN is needed and how its invoices are reported (B2B / B2C / SEZ / export). */
export const GST_REGISTRATIONS = {
  REGISTERED: 'Registered (regular)',
  COMPOSITION: 'Registered (composition)',
  SEZ: 'SEZ unit / developer',
  UNREGISTERED: 'Unregistered',
  CONSUMER: 'Consumer',
  OVERSEAS: 'Overseas (outside India)',
} as const;
export type GstRegistration = keyof typeof GST_REGISTRATIONS;

/** Constitution of business, as asked on GST forms */
export const CONSTITUTIONS = {
  PROPRIETORSHIP: 'Proprietorship', PARTNERSHIP: 'Partnership', LLP: 'LLP', PRIVATE_LTD: 'Private Limited Company',
  PUBLIC_LTD: 'Public Limited Company', HUF: 'HUF', TRUST: 'Trust / Society', GOVERNMENT: 'Government body', OTHER: 'Other',
} as const;

const NEEDS_GSTIN: GstRegistration[] = ['REGISTERED', 'COMPOSITION', 'SEZ'];

/** The registration a party has: as recorded, or (for parties saved before it was asked) worked out from GSTIN and country. */
export function gstRegistrationOf(p: { gstRegistration?: string; gstin?: string; country?: string }): GstRegistration {
  if (p.gstRegistration && p.gstRegistration in GST_REGISTRATIONS) return p.gstRegistration as GstRegistration;
  if (p.country && p.country !== 'IN') return 'OVERSEAS';
  return p.gstin ? 'REGISTERED' : 'UNREGISTERED';
}

/**
 * GST registration status, constitution of business and the road distance used on e-way bills. Only the keys sent
 * are returned. The registration must agree with the GSTIN and country: a registered, composition or SEZ party needs
 * a GSTIN; an unregistered party or consumer must not have one; an overseas party is outside India.
 */
export function gstProfile(b: { gstRegistration?: any; constitution?: any; distanceKm?: any }, final: { gstin?: string; country?: string }) {
  const out: { gstRegistration?: GstRegistration; constitution?: string; distanceKm?: number | null } = {};
  if (!blank(b.gstRegistration)) {
    out.gstRegistration = groupCode(b.gstRegistration, GST_REGISTRATIONS, 'GST registration');
    const reg = out.gstRegistration;
    // the country first: a party abroad is Overseas whatever else was filled in
    if (reg !== 'OVERSEAS' && final.country && final.country !== 'IN') throw new HttpError(400, 'A party outside India is Overseas for GST.');
    if (reg === 'OVERSEAS' && (final.country || 'IN') === 'IN') throw new HttpError(400, 'An overseas party needs a country other than India.');
    if (NEEDS_GSTIN.includes(reg) && !final.gstin) throw new HttpError(400, `A ${GST_REGISTRATIONS[reg].toLowerCase()} party needs a GSTIN.`);
    if ((reg === 'UNREGISTERED' || reg === 'CONSUMER') && final.gstin) throw new HttpError(400, `This party has a GSTIN, so it is not ${GST_REGISTRATIONS[reg].toLowerCase()}. Clear the GSTIN or choose Registered.`);
  }
  if (b.constitution !== undefined) out.constitution = blank(b.constitution) ? '' : groupCode(b.constitution, CONSTITUTIONS, 'Constitution of business');
  if (b.distanceKm !== undefined) {
    if (blank(b.distanceKm)) out.distanceKm = null; // cleared
    else {
      const km = Number(b.distanceKm);
      // the e-way bill portal accepts up to 4,000 km
      if (!Number.isFinite(km) || km < 0 || km > 4000) throw new HttpError(400, 'Distance must be 0 to 4,000 km.');
      out.distanceKm = Math.round(km);
    }
  }
  return out;
}
