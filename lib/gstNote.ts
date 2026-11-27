import { HttpError } from '@/lib/httpError';

// The GST details of a credit or debit note: why it is issued, the original invoice it adjusts, a rate difference
// (billed vs actual rate) when that is the reason, the other party's own note number, and when input credit is reversed.

/** Reasons for issuing a note, as asked for on GST returns */
export const NOTE_REASONS = {
  SALES_RETURN: 'Sales return',
  PURCHASE_RETURN: 'Purchase return',
  POST_SALE_DISCOUNT: 'Post-sale discount',
  RATE_DIFFERENCE: 'Rate difference',
  DEFICIENCY: 'Deficiency in goods or services',
  CORRECTION: 'Correction in invoice',
  CHANGE_POS: 'Change in place of supply',
  PROVISIONAL: 'Finalisation of provisional assessment',
  OTHERS: 'Others',
} as const;
export type NoteReason = keyof typeof NOTE_REASONS;

export interface NoteDetails {
  reason: NoteReason;
  originalDate?: Date;        // date of the invoice / bill the note adjusts
  rateDiff?: { quantity: number; billedRate: number; actualRate: number };
  partyNoteNo?: string;       // the other party's note: the customer's debit note, or the supplier's credit note
  partyNoteDate?: Date;
  itcDate?: Date;             // when the input credit is reversed (debit notes on purchases)
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const blank = (v: any) => v === undefined || v === null || String(v).trim() === '';
const day = (d: Date) => new Date(d.toISOString().slice(0, 10));

function dateOf(v: any, what: string) {
  if (blank(v)) return undefined;
  const d = new Date(v);
  if (isNaN(d.getTime())) throw new HttpError(400, `${what} is not a valid date.`);
  if (d.getTime() > Date.now() + 86400000) throw new HttpError(400, `${what} cannot be in the future.`);
  return d;
}

/**
 * Checks the GST details sent with a credit / debit note against the invoice it adjusts. A rate difference sets the
 * taxable value (quantity x (billed rate - actual rate)). Returns the details to keep and the taxable value to use.
 */
export function noteDetails(type: 'CREDIT_NOTE' | 'DEBIT_NOTE', b: any, invoice: { date?: any; invoiceNumber?: string } | null) {
  const raw = b.noteReason ?? b.noteDetails?.reason;
  if (blank(raw)) throw new HttpError(400, `Choose the reason for issuing this ${type === 'CREDIT_NOTE' ? 'credit' : 'debit'} note.`);
  const v = String(raw).trim();
  const reason = (Object.keys(NOTE_REASONS) as NoteReason[]).find(k => k === v.toUpperCase() || NOTE_REASONS[k].toLowerCase() === v.toLowerCase());
  if (!reason) throw new HttpError(400, `Reason must be one of ${Object.values(NOTE_REASONS).join(', ')}.`);

  const out: NoteDetails = { reason };
  const noteDate = b.date ? new Date(b.date) : new Date();
  if (invoice?.date) {
    out.originalDate = new Date(invoice.date);
    if (day(noteDate) < day(out.originalDate)) throw new HttpError(400, `The note cannot be dated before the invoice it adjusts (${[invoice.invoiceNumber, `dated ${out.originalDate.toISOString().slice(0, 10)}`].filter(Boolean).join(' ')}).`);
  }

  let taxableAmount = Number(b.taxableAmount);
  const rd = b.rateDiff;
  if (rd && !(blank(rd.quantity) && blank(rd.billedRate) && blank(rd.actualRate))) {
    const quantity = Number(rd.quantity), billedRate = Number(rd.billedRate), actualRate = Number(rd.actualRate);
    if (!(quantity > 0)) throw new HttpError(400, 'Rate difference: enter the quantity it applies to.');
    if (!(billedRate >= 0) || !(actualRate >= 0)) throw new HttpError(400, 'Rate difference: enter the billed rate and the actual rate.');
    // a credit note gives the customer back what was over-billed; a debit note recovers from the supplier what they over-billed
    if (!(actualRate < billedRate)) throw new HttpError(400, 'Rate difference: the actual rate must be below the billed rate.');
    const diff = r2(quantity * (billedRate - actualRate));
    if (!blank(b.taxableAmount) && Math.abs(diff - taxableAmount) > 0.01) throw new HttpError(400, `Rate difference works out to ${diff}, but the taxable value says ${taxableAmount}.`);
    taxableAmount = diff;
    out.rateDiff = { quantity, billedRate, actualRate };
  } else if (reason === 'RATE_DIFFERENCE') throw new HttpError(400, 'Enter the quantity, billed rate and actual rate for a rate-difference note.');

  if (!blank(b.partyNoteNo)) {
    out.partyNoteNo = String(b.partyNoteNo).trim();
    if (out.partyNoteNo.length > 40) throw new HttpError(400, "Party's note number: keep it under 40 characters.");
  }
  out.partyNoteDate = dateOf(b.partyNoteDate, "Party's note date");
  out.itcDate = dateOf(b.itcDate, 'ITC date');
  if (out.itcDate && type !== 'DEBIT_NOTE') throw new HttpError(400, 'An ITC date applies to debit notes on purchases.');
  if (out.itcDate && out.originalDate && day(out.itcDate) < day(out.originalDate)) throw new HttpError(400, 'The ITC date cannot be before the bill date.');
  return { details: out, taxableAmount };
}
