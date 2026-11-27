import mongoose from 'mongoose';
import { HttpError } from '@/lib/httpError';

/** Who may add, correct and cancel enquiries (leads). */
export const ENQUIRY_ROLES = ['ADMIN', 'MANAGER', 'SALES', 'STAFF'];
export const ENQUIRY_SOURCES = ['WEBSITE', 'EMAIL', 'PHONE', 'TRADE_SHOW', 'DIRECT'] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-.\s]{6,20}$/;
const text = (v: any) => String(v ?? '').trim();

/**
 * Turns a request body into enquiry fields. Only fields that were sent are returned, so an edit leaves the rest alone.
 * With `whole`, the fields a new enquiry needs (customer name, at least one item) are required. Throws HttpError(400) on bad values.
 */
export function enquiryFields(b: any, whole: boolean) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, 'Send the enquiry as a JSON object.');
  const out: Record<string, any> = {};

  if (b.customerName !== undefined || whole) {
    const name = text(b.customerName);
    if (!name) throw new HttpError(400, 'Customer name is required.');
    if (name.length > 200) throw new HttpError(400, 'Customer name is too long (200 characters at most).');
    out.customerName = name;
  }
  if (b.email !== undefined) {
    const email = text(b.email);
    if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'The email address is not valid.');
    out.email = email;
  }
  if (b.phone !== undefined) {
    const phone = text(b.phone);
    if (phone && !PHONE_RE.test(phone)) throw new HttpError(400, 'The phone number is not valid (digits, spaces, + - ( ) only, 6 to 20 characters).');
    out.phone = phone;
  }
  if (b.source !== undefined || whole) {
    const source = text(b.source || 'WEBSITE').toUpperCase();
    if (!(ENQUIRY_SOURCES as readonly string[]).includes(source)) throw new HttpError(400, `Source must be one of ${ENQUIRY_SOURCES.join(', ')}.`);
    out.source = source;
  }
  if (b.notes !== undefined) {
    const notes = text(b.notes);
    if (notes.length > 2000) throw new HttpError(400, 'Notes are too long (2000 characters at most).');
    out.notes = notes;
  }
  if (b.region !== undefined || b.country !== undefined || whole) {
    const region = b.region === 'EXPORT' ? 'EXPORT' : 'DOMESTIC';
    out.region = region;
    const country = text(b.country);
    if (region === 'EXPORT' && !country) throw new HttpError(400, 'Country is required for export enquiries.');
    out.country = region === 'EXPORT' ? country : '';
  }
  if (b.items !== undefined || whole) {
    if (!Array.isArray(b.items) || b.items.length === 0) throw new HttpError(400, 'Add at least one item.');
    if (b.items.length > 50) throw new HttpError(400, 'An enquiry can have 50 items at most.');
    out.items = b.items.map((it: any, n: number) => {
      const productName = text(it?.productName);
      if (!productName) throw new HttpError(400, `Item ${n + 1}: say what is wanted.`);
      const qty = Number(it?.estimatedQuantity);
      if (!Number.isFinite(qty) || qty <= 0) throw new HttpError(400, `Item ${n + 1}: the quantity must be more than zero.`);
      const item: Record<string, any> = { productName, estimatedQuantity: qty };
      if (it?.product && mongoose.isValidObjectId(String(it.product))) item.product = String(it.product);
      return item;
    });
  }
  return out;
}
