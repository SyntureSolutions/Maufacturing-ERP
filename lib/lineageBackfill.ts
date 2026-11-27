import Enquiry from '@/models/Enquiry';
import Quotation from '@/models/Quotation';
import SalesOrder from '@/models/SalesOrder';
import WorkOrder from '@/models/WorkOrder';
import DeliveryChallan from '@/models/DeliveryChallan';
import Invoice from '@/models/Invoice';

export interface BackfillLine { link: string; checked: number; linked: number; unmatchedCount: number; unmatched: string[] }

type Spec = { link: string; model: any; filter: any; textField: string; targetModel: any; targetField: string; set: string; numberField: string };

// text document number on the child  ->  real reference to the parent
const SPECS: Spec[] = [
  { link: 'Quotation -> Enquiry', model: Quotation, filter: { enquiry: { $exists: false }, enquiryRef: { $exists: true, $ne: '' } }, textField: 'enquiryRef', targetModel: Enquiry, targetField: 'enquiryNumber', set: 'enquiry', numberField: 'quoteNumber' },
  { link: 'Sales order -> Quotation', model: SalesOrder, filter: { quotation: { $exists: false }, quotationRef: { $exists: true, $ne: '' } }, textField: 'quotationRef', targetModel: Quotation, targetField: 'quoteNumber', set: 'quotation', numberField: 'soNumber' },
  { link: 'Work order -> Sales order', model: WorkOrder, filter: { salesOrder: { $exists: false }, salesOrderRef: { $exists: true, $ne: '' } }, textField: 'salesOrderRef', targetModel: SalesOrder, targetField: 'soNumber', set: 'salesOrder', numberField: 'woNumber' },
  { link: 'Invoice -> Delivery challan', model: Invoice, filter: { type: 'SALES', deliveryChallan: { $exists: false }, dcRef: { $exists: true, $ne: '' } }, textField: 'dcRef', targetModel: DeliveryChallan, targetField: 'number', set: 'deliveryChallan', numberField: 'invoiceNumber' },
  { link: 'Invoice -> Sales order', model: Invoice, filter: { type: 'SALES', salesOrder: { $exists: false }, soNumber: { $exists: true, $ne: '' } }, textField: 'soNumber', targetModel: SalesOrder, targetField: 'soNumber', set: 'salesOrder', numberField: 'invoiceNumber' },
];

/**
 * Fills the new real references from the document numbers older records carry as text.
 * With `dryRun` nothing is written; either way the result lists what could not be matched so it can be fixed by hand.
 */
export async function backfillLineage(dryRun: boolean): Promise<BackfillLine[]> {
  const report: BackfillLine[] = [];
  for (const s of SPECS) {
    const rows: any[] = await s.model.find(s.filter).select(`${s.textField} ${s.numberField}`).lean();
    const line: BackfillLine = { link: s.link, checked: rows.length, linked: 0, unmatchedCount: 0, unmatched: [] };
    const numbers = [...new Set(rows.map(r => r[s.textField]))];
    const found: any[] = numbers.length ? await s.targetModel.find({ [s.targetField]: { $in: numbers } }).select(`_id ${s.targetField}`).lean() : [];
    const byNumber = new Map<string, any[]>();
    for (const f of found) byNumber.set(f[s.targetField], [...(byNumber.get(f[s.targetField]) || []), f]);
    for (const r of rows) {
      const parents = byNumber.get(r[s.textField]) || [];
      if (parents.length !== 1) { line.unmatchedCount++; if (line.unmatched.length < 100) line.unmatched.push(`${r[s.numberField]} (${r[s.textField]}${parents.length > 1 ? ', ambiguous' : ', not found'})`); continue; }
      if (!dryRun) await s.model.updateOne({ _id: r._id }, { $set: { [s.set]: parents[0]._id } });
      line.linked++;
    }
    report.push(line);
  }
  return report;
}
