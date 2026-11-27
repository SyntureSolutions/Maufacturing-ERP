// Reading an HSN/SAC list for bulk import. Works with the GST portal's HSN/SAC Excel (sheets with HSN_CD /
// HSN_Description and SAC_CD / SAC_Description columns), a rate sheet with a GST rate column, or a plain CSV.
// Columns are found by their header, on any sheet; a file with no header is read as code, description, rate.

export interface HsnRow { code: string; kind: 'HSN' | 'SAC'; description: string; gstRate?: number }
export interface HsnIssue { sheet: string; line: number; message: string }

const CODE_HEAD = /^(hsn|sac|hsn\s*\/\s*sac)?[\s_]*(cd|code|no|number)?$|^(hsn|sac)/i;
const DESC_HEAD = /desc/i;
const RATE_HEAD = /(gst|rate|tax)/i;
const KIND_HEAD = /^(type|kind)$/i;

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v)).replace(/ /g, ' ').trim();

/**
 * An HSN/SAC code from a cell. Excel stores codes as numbers and drops the leading zero of chapters 01–09
 * (0101 becomes 101), so a number with an odd count of digits gets its zero back.
 */
export function normalizeCode(v: unknown): string | null {
  const wasNumber = typeof v === 'number';
  const s = text(v).replace(/^'/, '').replace(/[\s.\-]/g, '');
  if (!/^\d+$/.test(s)) return null;
  const code = wasNumber && s.length % 2 === 1 ? `0${s}` : s;
  return code.length >= 2 && code.length <= 8 ? code : null;
}

/** A GST rate from "18", "18%" or 18; null when the cell is empty, NaN when it is not a rate. */
export function normalizeRate(v: unknown): number | null {
  const s = text(v).replace(/%$/, '').trim();
  if (s === '' || s === '-' || /^n\.?a\.?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 40 ? n : NaN;
}

/** Where the columns are: the first row (of the first 25) that has a code header and a description header. */
function findColumns(rows: unknown[][]) {
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const cells = rows[r].map(text);
    const code = cells.findIndex(c => c && CODE_HEAD.test(c) && !DESC_HEAD.test(c));
    const desc = cells.findIndex(c => DESC_HEAD.test(c));
    if (code >= 0 && desc >= 0) {
      const rate = cells.findIndex((c, i) => i !== code && i !== desc && RATE_HEAD.test(c) && !/cess|compensation/i.test(c));
      const kind = cells.findIndex(c => KIND_HEAD.test(c));
      return { header: r, code, desc, rate, kind };
    }
  }
  return { header: -1, code: 0, desc: 1, rate: 2, kind: -1 }; // no header: code, description, rate
}

/** Rows of one sheet → HSN rows and the lines that could not be read. Empty lines are skipped quietly. */
export function readHsnSheet(sheet: string, rows: unknown[][]): { rows: HsnRow[]; issues: HsnIssue[] } {
  const cols = findColumns(rows);
  const out: HsnRow[] = [];
  const issues: HsnIssue[] = [];
  for (let r = cols.header + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const rawCode = row[cols.code];
    const description = text(row[cols.desc]);
    if (!text(rawCode) && !description) continue;
    const line = r + 1;
    const code = normalizeCode(rawCode);
    if (!code) { issues.push({ sheet, line, message: `"${text(rawCode)}" is not an HSN or SAC code (2 to 8 digits).` }); continue; }
    const rate = cols.rate >= 0 ? normalizeRate(row[cols.rate]) : null;
    if (Number.isNaN(rate)) { issues.push({ sheet, line, message: `Code ${code}: GST rate "${text(row[cols.rate])}" is not a rate between 0 and 40.` }); continue; }
    const kindCell = cols.kind >= 0 ? text(row[cols.kind]).toUpperCase() : '';
    const kind = kindCell === 'SAC' || kindCell === 'HSN' ? kindCell : code.startsWith('99') ? 'SAC' : 'HSN';
    out.push({ code, kind, description, ...(rate === null ? {} : { gstRate: rate }) });
  }
  return { rows: out, issues };
}

/** Several sheets together; a code that appears twice keeps its last row, and the repeats are counted. */
export function mergeHsnSheets(sheets: { name: string; rows: unknown[][] }[]) {
  const byCode = new Map<string, HsnRow>();
  const issues: HsnIssue[] = [];
  let read = 0;
  for (const s of sheets) {
    const r = readHsnSheet(s.name, s.rows);
    issues.push(...r.issues);
    read += r.rows.length;
    for (const row of r.rows) {
      const prev = byCode.get(row.code);
      // a later row without a description or rate does not wipe what an earlier one gave
      byCode.set(row.code, prev ? { ...prev, ...row, description: row.description || prev.description, gstRate: row.gstRate ?? prev.gstRate } : row);
    }
  }
  return { rows: [...byCode.values()], issues, read, repeated: read - byCode.size };
}

/** CSV text → rows (quotes, doubled quotes and line breaks inside quotes are handled). */
export function parseCsv(input: string): string[][] {
  const s = input.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** An uploaded .xlsx or .csv file → its sheets as rows of cell values. */
export async function readSpreadsheet(fileName: string, data: ArrayBuffer): Promise<{ name: string; rows: unknown[][] }[]> {
  if (/\.csv$/i.test(fileName)) return [{ name: 'CSV', rows: parseCsv(new TextDecoder('utf-8').decode(data)) }];
  if (!/\.xlsx$/i.test(fileName)) throw new Error('Upload an Excel .xlsx file or a .csv file. (An old .xls file can be saved as .xlsx from Excel.)');
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as any);
  return wb.worksheets.map(ws => {
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (r, n) => {
      const cells: unknown[] = [];
      r.eachCell({ includeEmpty: true }, (c, col) => {
        const v: any = c.value;
        // rich text, formulas and hyperlinks carry the shown value inside
        cells[col - 1] = v && typeof v === 'object' ? (v.richText ? v.richText.map((t: any) => t.text).join('') : v.result ?? v.text ?? '') : v;
      });
      rows[n - 1] = cells;
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    return { name: ws.name, rows };
  });
}
