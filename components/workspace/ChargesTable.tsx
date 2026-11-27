'use client';

import { ListPlus, X } from 'lucide-react';
import { fmtNum } from '@/components/workspace/controls';
import { CHARGE_LABELS } from '@/lib/gst';

export interface ChargeRow { label: string; amount: string }

const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
export const chargeRows = (charges: any[] = []): ChargeRow[] => charges.map(c => ({ label: c.label, amount: String(c.amount) }));
/** The rows to send: blank rows dropped, amounts as numbers (the API checks them) */
export const chargesBody = (rows: ChargeRow[]) => rows.filter(c => c.label.trim() || c.amount.trim()).map(c => ({ label: c.label.trim(), amount: num(c.amount) }));
/** For the on-screen GST: amounts that are not numbers yet count as nothing */
export const chargesForTax = (rows: ChargeRow[]) => rows.map(c => ({ label: c.label, amount: Number.isFinite(num(c.amount)) ? num(c.amount) : 0 }));

/** Freight, packing & forwarding and the like on a document, typed as a small table. */
export function ChargesTable({ rows, editing, onChange, currency = '₹', what }: { rows: ChargeRow[]; editing: boolean; onChange: (rows: ChargeRow[]) => void; currency?: string; what: string }) {
  const set = (i: number, p: Partial<ChargeRow>) => onChange(rows.map((x, n) => (n === i ? { ...x, ...p } : x)));
  return (
    <div className="flex flex-col gap-3">
      <div className="px-note">Freight, packing & forwarding and other charges billed with the goods. They are spread over the lines by value, so each part takes its line&apos;s GST rate and HSN.</div>
      <div className="px-table-wrap" style={{ maxWidth: 560 }}>
        <table className="px-table">
          <thead><tr><th>Charge</th><th className="num" style={{ width: 160 }}>Amount ({currency})</th>{editing && <th style={{ width: 40 }} />}</tr></thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={i}>
                <td className={editing ? 'edit' : ''}>{editing ? <input list="doc-charge-labels" value={c.label} onChange={e => set(i, { label: e.target.value })} aria-label={`Charge ${i + 1}`} placeholder="e.g. Freight" /> : c.label}</td>
                <td className={editing ? 'edit' : 'num'}>{editing ? <input className="num" inputMode="decimal" value={c.amount} onChange={e => set(i, { amount: e.target.value })} aria-label={`Charge ${i + 1} amount`} /> : fmtNum(num(c.amount))}</td>
                {editing && <td className="ctr"><button onClick={() => onChange(rows.filter((_, n) => n !== i))} title="Remove charge" aria-label={`Remove charge ${i + 1}`}><X className="h-4 w-4 text-red-700" /></button></td>}
              </tr>))}
            {editing && <tr className="px-addrow"><td colSpan={3}><button className="px-btn" onClick={() => onChange([...rows, { label: rows.length ? '' : 'Freight', amount: '' }])}><ListPlus />Add charge</button></td></tr>}
          </tbody>
        </table>
        <datalist id="doc-charge-labels">{CHARGE_LABELS.map(l => <option key={l} value={l} />)}</datalist>
        {!editing && !rows.length && <div className="px-empty">No charges on this {what}.</div>}
      </div>
    </div>
  );
}
