import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { pdfSafe, wrapText } from '@/lib/documentPdf';
import QRCode from 'qrcode';
import { stateName } from '@/lib/gst';

// One A4 layout for every printed document, in the ruled style Indian business documents use: the page is one frame,
// divided into boxes. Title band; our company beside the document details (number first); the e-invoice strip; party
// boxes side by side; the item table, whose column rules run down to a totals row so the page is filled; extra tables
// (HSN summary, routing); then amount in words / bank / terms on the left with the totals box on the right; and the
// signature band. Long tables carry on over pages with the header repeated. Several copies (Original / Duplicate /
// Triplicate) are printed one after another, each with its copy label.

const W = 595.28, H = 841.89, M = 24;
const TOP = H - M, BOTTOM = 34;            // the frame; the footer sits below it
const NAVY = rgb(0.086, 0.141, 0.247);     // #16243f
const ORANGE = rgb(0.96, 0.416, 0.039);    // #f56a0a
const INK = rgb(0.1, 0.12, 0.16);
const RULE = rgb(0.32, 0.36, 0.42);
const MUTED = rgb(0.38, 0.43, 0.5);
const SHADE = rgb(0.93, 0.95, 0.975);
const PAD = 5;

export interface PrintColumn {
  key: string; label: string; width: number; align?: 'right' | 'center';
  sum?: 'qty' | 'money';                   // added up in the totals row under the table
}
export interface PrintParty { label: string; name?: string; lines?: (string | undefined | null | false)[] }
export interface PrintSpec {
  title: string;                           // e.g. PURCHASE ORDER
  number: string;
  numberLabel?: string;                    // e.g. "PO No."; the number is the first detail in the header
  copies?: string[];                       // copy labels; one set of pages each
  seller?: any;                            // the seller as recorded on an issued document (overrides today's company details)
  meta: [string, unknown][];               // document details beside our company: label, value (empty values are left out)
  einvoice?: { lines: [string, unknown][]; qr?: string }; // IRN / e-way bill strip, with the signed QR when there is one
  parties?: PrintParty[];                  // at most two, side by side
  columns: PrintColumn[];                  // widths are shares of the table width
  rows: Record<string, unknown>[];
  emptyText?: string;
  tables?: { title: string; columns: PrintColumn[]; rows: Record<string, unknown>[] }[]; // e.g. HSN summary, after the lines
  totals?: [string, string, boolean?][];   // label, value, bold (the last bold one is the final amount)
  notes?: { label: string; text?: string | null }[];
  signatures?: string[];
}

export const num = (n: unknown, dp = 2) => (n === undefined || n === null || n === '' ? '' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
export const qty = (n: unknown) => (n === undefined || n === null || n === '' ? '' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 }));
export const rs = (n: unknown) => `Rs. ${num(n || 0)}`;
export const day = (d: unknown) => (d ? new Date(d as string).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
/** Place of supply as "27-Maharashtra", whether it was saved as the bare code or already with the name */
export const placeLabel = (p?: string) => (!p ? '' : /^\d{2}$/.test(p) ? `${p}-${stateName(p)}` : p);
export const words = (s?: string) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());

/** Address lines of a customer, supplier or the company, as they are stored */
export function addressLines(p: any = {}): string[] {
  const place = [p.city, p.pincode].filter(Boolean).join(' - ');
  const st = p.stateCode ? stateName(p.stateCode) : '';
  return [p.billingAddress || p.address || [p.address1, p.address2].filter(Boolean).join(', '), [place, st].filter(Boolean).join(', '),
    p.gstin ? `GSTIN: ${p.gstin}` : '', [p.contactPerson, p.phone ? `Ph: ${p.phone}` : '', p.email].filter(Boolean).join('  |  ')].filter(Boolean);
}

/** The number at the start of a cell ("1,250.00", "50 pcs") and what follows it */
function parseCell(v: unknown): { n: number; unit: string } | null {
  const m = String(v ?? '').trim().match(/^(-?[\d,]+(?:\.\d+)?)\s*(.*)$/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? { n, unit: m[2].replace(/\(.*\)$/, '').trim().toLowerCase() } : null;
}

/** The total of a column: money with two decimals; quantities only when every line is in the same unit */
function columnTotal(c: PrintColumn, rows: Record<string, unknown>[]) {
  const cells = rows.map(r => parseCell(r[c.key])).filter(Boolean) as { n: number; unit: string }[];
  if (!cells.length) return '';
  const total = cells.reduce((t, x) => t + x.n, 0);
  if (c.sum === 'money') return num(total);
  const units = new Set(cells.map(x => x.unit));
  return units.size > 1 ? '' : `${qty(total)}${[...units][0] ? ` ${[...units][0]}` : ''}`;
}

export async function buildPrintPdf(spec: PrintSpec, company: any = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  doc.setTitle(`${words(spec.title)} ${pdfSafe(spec.number)}`);
  doc.setProducer('Prodexa ERP');
  doc.setCreator('Prodexa ERP');

  if (spec.seller) company = { ...company, ...Object.fromEntries(Object.entries(spec.seller).filter(([, v]) => v)), legalName: spec.seller.name || spec.seller.legalName || company.legalName };
  const coName = company.legalName || company.tradeName || 'Company name not set';
  const X0 = M, X1 = W - M, FW = X1 - X0;
  const sized = (cs: PrintColumn[]) => { const shares = cs.reduce((s, c) => s + c.width, 0); return cs.map(c => ({ ...c, w: (c.width / shares) * FW })); };
  const qr = spec.einvoice?.qr ? await doc.embedPng(await QRCode.toBuffer(spec.einvoice.qr, { type: 'png', margin: 1, width: 360, errorCorrectionLevel: 'M' })) : null;
  const filled = (pairs: [string, unknown][]) => pairs.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
  const wrap = (f: PDFFont, size: number, s: unknown, w: number) => wrapText(f, size, String(s ?? ''), w);

  // ---- heights of the parts that follow the item table, so the table can fill the page down to them ----
  const notes = (spec.notes || []).filter(n => n.text && String(n.text).trim());
  const totals = spec.totals || [];
  const sigs = spec.signatures || [];
  const leftW = totals.length ? FW * 0.6 : FW, rightW = FW - leftW;
  const noteLines = notes.map(n => ({ label: n.label, lines: String(n.text).split(/\r?\n/).flatMap(l => wrap(font, 7.6, l, leftW - 2 * PAD)) }));
  const notesH = noteLines.reduce((h, n) => h + 11 + n.lines.length * 9.5 + 4, 0) + (notes.length ? 4 : 0);
  const totalsH = totals.length * 14 + (totals.some(t => t[2]) ? 4 : 0);
  const summaryH = Math.max(notesH, totalsH, notes.length || totals.length ? 30 : 0);
  const sigH = sigs.length ? 58 : 0;
  const rowCells = (cols: (PrintColumn & { w: number })[], r: Record<string, unknown>) => cols.map(c => (c.align ? [pdfSafe(r[c.key])] : wrap(font, 7.8, r[c.key], c.w - 2 * PAD)));
  const rowH = (cols: (PrintColumn & { w: number })[], r: Record<string, unknown>) => 5 + Math.max(1, ...rowCells(cols, r).map(c => c.length)) * 9.5;
  const extra = (spec.tables || []).filter(t => t.rows.length).map(t => ({ ...t, cols: sized(t.columns) }));
  const extraH = extra.reduce((h, t) => h + 14 + 15 + t.rows.reduce((s, r) => s + rowH(t.cols, r), 0), 0);
  const mainCols = sized(spec.columns);
  const sumRow = mainCols.some(c => c.sum);
  const TH = 16;                            // table header and totals row height
  const tail = (sumRow ? TH : 0) + extraH + summaryH + sigH; // everything below the table body on the last page

  for (const copy of spec.copies?.length ? spec.copies : ['']) {
    const first = doc.getPageCount();
    let page: PDFPage = doc.addPage([W, H]);
    let y = TOP;
    const text = (t: unknown, x: number, yy: number, o: { size?: number; font?: PDFFont; color?: any; right?: number; center?: number } = {}) => {
      const size = o.size ?? 8, f = o.font ?? font, s = pdfSafe(t);
      const tw = f.widthOfTextAtSize(s, size);
      const px = o.right !== undefined ? o.right - tw : o.center !== undefined ? o.center - tw / 2 : x;
      page.drawText(s, { x: px, y: yy, size, font: f, color: o.color ?? INK });
    };
    const hline = (yy: number, x0 = X0, x1 = X1, t = 0.6) => page.drawLine({ start: { x: x0, y: yy }, end: { x: x1, y: yy }, thickness: t, color: RULE });
    const vline = (x: number, y0: number, y1: number) => page.drawLine({ start: { x, y: y0 }, end: { x, y: y1 }, thickness: 0.6, color: RULE });
    const shade = (x: number, yy: number, w: number, h: number) => page.drawRectangle({ x, y: yy, width: w, height: h, color: SHADE });

    // title band: the document's name in the middle, the copy label on the right
    const titleBand = (cont = false) => {
      page.drawRectangle({ x: X0, y: BOTTOM, width: FW, height: TOP - BOTTOM, borderColor: RULE, borderWidth: 0.9 });
      text(cont ? `${spec.title} (continued)` : spec.title, 0, y - 15, { size: 12, font: bold, color: NAVY, center: W / 2 });
      if (copy) {
        const cw = italic.widthOfTextAtSize(copy, 7.2) + 12;
        page.drawRectangle({ x: X1 - cw - 6, y: y - 17, width: cw, height: 13, borderColor: RULE, borderWidth: 0.6 });
        text(copy, 0, y - 13, { size: 7.2, font: italic, color: MUTED, right: X1 - 12 });
      }
      y -= 22;
      hline(y, X0, X1, 0.9);
    };
    titleBand();

    // our company on the left; the document details as a grid of cells on the right (number first)
    const meta = filled([[spec.numberLabel || 'No.', spec.number], ...spec.meta]);
    const coW = FW * 0.5, gridX = X0 + coW, gridW = FW - coW, cellW = gridW / 2, cellH = 23;
    let cy = y - 15;
    page.drawRectangle({ x: X0 + PAD, y: cy - 2, width: 3, height: 14, color: ORANGE });
    for (const l of wrap(bold, 11.5, coName, coW - 18)) { text(l, X0 + PAD + 7, cy, { size: 11.5, font: bold, color: NAVY }); cy -= 13; }
    for (const l of addressLines(company)) for (const w of wrap(font, 7.4, l, coW - 2 * PAD - 7)) { text(w, X0 + PAD + 7, cy, { size: 7.4, color: INK }); cy -= 9.2; }
    const gridRows = Math.ceil(meta.length / 2);
    meta.forEach(([k, v], i) => {
      const cx = gridX + (i % 2) * cellW, top = y - Math.floor(i / 2) * cellH;
      text(k, cx + PAD, top - 8.5, { size: 6.6, font: bold, color: MUTED });
      text(wrap(bold, 8, v, cellW - 2 * PAD)[0], cx + PAD, top - 18.5, { size: 8, font: bold });
    });
    const headerH = Math.max(y - cy + 4, gridRows * cellH);
    for (let r = 1; r < gridRows; r++) hline(y - r * cellH, gridX, X1, 0.4);
    if (gridRows * cellH < headerH) hline(y - gridRows * cellH, gridX, X1, 0.4);
    vline(gridX, y, y - headerH);
    vline(gridX + cellW, y, y - Math.min(headerH, gridRows * cellH));
    y -= headerH;
    hline(y, X0, X1, 0.9);

    // e-invoice strip: IRN, acknowledgement and e-way bill, with the signed QR on the right
    const ein = filled(spec.einvoice?.lines || []);
    if (ein.length || qr) {
      const qs = qr ? 74 : 0, bh = Math.max(qs + 8, ein.length * 11 + 10);
      ein.forEach(([k, v], i) => {
        text(k, X0 + PAD, y - 12 - i * 11, { size: 7, font: bold, color: MUTED });
        text(wrap(font, 7.4, v, FW - qs - 110)[0], X0 + 92, y - 12 - i * 11, { size: 7.4 });
      });
      if (qr) page.drawImage(qr, { x: X1 - qs - 6, y: y - bh + 4, width: qs, height: qs });
      y -= bh;
      hline(y, X0, X1, 0.9);
    }

    // party boxes side by side
    const parties = (spec.parties || []).slice(0, 2);
    if (parties.length) {
      const pw = FW / parties.length;
      let low = y;
      parties.forEach((p, i) => {
        const px = X0 + i * pw;
        shade(px + 0.5, y - 13, pw - 1, 12.5);
        text(`${p.label}:`, px + PAD, y - 9.5, { size: 7.3, font: bold, color: NAVY });
        let py = y - 24;
        if (p.name) for (const l of wrap(bold, 8.8, p.name, pw - 2 * PAD)) { text(l, px + PAD, py, { size: 8.8, font: bold }); py -= 10.5; }
        for (const l of (p.lines || []).filter(Boolean) as string[]) for (const w of wrap(font, 7.4, l, pw - 2 * PAD)) { text(w, px + PAD, py, { size: 7.4 }); py -= 9.2; }
        low = Math.min(low, py - 2);
      });
      const ph = y - low;
      if (parties.length === 2) { page.drawRectangle({ x: X0 + pw - 0.3, y: low, width: 0.6, height: ph, color: RULE }); }
      hline(y - 13, X0, X1, 0.4);
      y = low;
      hline(y, X0, X1, 0.9);
    }

    // ---- the item table ----
    const tableHeader = (cols: (PrintColumn & { w: number })[]) => {
      shade(X0 + 0.5, y - TH, FW - 1, TH - 0.5);
      let x = X0;
      for (const c of cols) {
        const ly = y - 10.8;
        if (c.align === 'right') text(c.label, 0, ly, { size: 7.2, font: bold, right: x + c.w - PAD });
        else if (c.align === 'center') text(c.label, 0, ly, { size: 7.2, font: bold, center: x + c.w / 2 });
        else text(c.label, x + PAD, ly, { size: 7.2, font: bold });
        x += c.w;
      }
      y -= TH;
      hline(y);
    };
    const columnRules = (cols: (PrintColumn & { w: number })[], top: number, bottom: number) => {
      let x = X0;
      cols.slice(0, -1).forEach(c => { x += c.w; vline(x, top, bottom); });
    };
    const drawRow = (cols: (PrintColumn & { w: number })[], r: Record<string, unknown>, rh: number) => {
      const cells = rowCells(cols, r);
      let x = X0;
      cols.forEach((c, k) => {
        cells[k].forEach((l, n) => {
          const yy = y - 10.5 - n * 9.5;
          if (c.align === 'right') text(l, 0, yy, { size: 7.8, right: x + c.w - PAD });
          else if (c.align === 'center') text(l, 0, yy, { size: 7.8, center: x + c.w / 2 });
          else text(l, x + PAD, yy, { size: 7.8 });
        });
        x += c.w;
      });
      y -= rh;
    };
    const newPage = (cols: (PrintColumn & { w: number })[]) => {
      page = doc.addPage([W, H]);
      y = TOP;
      titleBand(true);
      text(`${spec.numberLabel || 'No.'} ${spec.number}`, X0 + PAD, y - 11, { size: 7.6, font: bold });
      y -= 16;
      hline(y, X0, X1, 0.9);
      tableHeader(cols);
    };

    tableHeader(mainCols);
    let bodyTop = y;
    if (!spec.rows.length) { text(spec.emptyText || 'No lines.', X0 + PAD, y - 11, { size: 7.8, font: italic, color: MUTED }); y -= 16; }
    for (const r of spec.rows) {
      const rh = rowH(mainCols, r);
      // a row that does not fit closes this page (its rules run to the bottom) and continues on the next
      if (y - rh < BOTTOM + 14) {
        columnRules(mainCols, bodyTop, BOTTOM + 14);
        hline(BOTTOM + 14);
        text('Continued on next page', 0, BOTTOM + 4.5, { size: 7, font: italic, color: MUTED, right: X1 - PAD });
        newPage(mainCols);
        bodyTop = y;
      }
      drawRow(mainCols, r, rh);
    }
    // the rest must fit below the table on this page; if not, the table carries on (empty) to the next page
    if (y - tail < BOTTOM) {
      columnRules(mainCols, bodyTop, BOTTOM + 14);
      hline(BOTTOM + 14);
      text('Continued on next page', 0, BOTTOM + 4.5, { size: 7, font: italic, color: MUTED, right: X1 - PAD });
      newPage(mainCols);
      bodyTop = y;
    }
    // the body stretches down to the totals, so the column rules fill the page
    y = BOTTOM + tail;
    columnRules(mainCols, bodyTop, y);
    hline(y);
    if (sumRow) {
      shade(X0 + 0.5, y - TH + 0.5, FW - 1, TH - 1);
      let x = X0;
      for (const c of mainCols) {
        const v = c.sum ? columnTotal(c, spec.rows) : '';
        if (v) text(v, 0, y - 10.8, { size: 7.8, font: bold, right: x + c.w - PAD });
        x += c.w;
      }
      // 'Total' sits at the right of the widest text column
      const labelCol = mainCols.reduce((best, c, i) => (!c.sum && !c.align && c.w > (mainCols[best]?.w || 0) ? i : best), 0);
      const lx = X0 + mainCols.slice(0, labelCol).reduce((s, c) => s + c.w, 0);
      text('Total', 0, y - 10.8, { size: 7.8, font: bold, right: lx + mainCols[labelCol].w - PAD });
      columnRules(mainCols, y, y - TH);
      y -= TH;
      hline(y, X0, X1, 0.9);
    } else hline(y, X0, X1, 0.9);

    // extra tables (HSN summary, routing...)
    for (const t of extra) {
      text(t.title.toUpperCase(), X0 + PAD, y - 10, { size: 7, font: bold, color: NAVY });
      y -= 14;
      hline(y, X0, X1, 0.4);
      const top = y;
      tableHeader(t.cols);
      for (const r of t.rows) drawRow(t.cols, r, rowH(t.cols, r));
      columnRules(t.cols, top, y);
      hline(y, X0, X1, 0.9);
    }

    // amount in words, bank, terms on the left; the totals box on the right
    if (summaryH) {
      const top = y;
      let ny = y - 4;
      for (const n of noteLines) {
        text(`${n.label}:`, X0 + PAD, ny - 7.5, { size: 7, font: bold, color: NAVY });
        ny -= 11;
        for (const l of n.lines) { text(l, X0 + PAD, ny - 7, { size: 7.6 }); ny -= 9.5; }
        ny -= 4;
      }
      if (totals.length) {
        const tx = X0 + leftW;
        vline(tx, top, top - summaryH);
        let ty = top;
        const lastStrong = totals.map(t => !!t[2]).lastIndexOf(true);
        totals.forEach(([k, v, strong], i) => {
          const final = i === lastStrong;
          if (final) { ty -= 4; shade(tx + 0.5, ty - 14, rightW - 1, 14); hline(ty, tx, X1, 0.6); }
          text(k, tx + PAD, ty - 10, { size: final ? 8.6 : 7.8, font: strong ? bold : font, color: final ? NAVY : INK });
          text(v, 0, ty - 10, { size: final ? 9 : 7.8, font: strong ? bold : font, color: final ? NAVY : INK, right: X1 - PAD });
          ty -= 14;
          if (final) hline(ty, tx, X1, 0.6);
        });
      }
      y = top - summaryH;
      hline(y, X0, X1, 0.9);
    }

    // signature band: "For <company>" above the last signature, the others along the bottom
    if (sigs.length) {
      text(`For ${coName}`, 0, y - 11, { size: 7.8, font: bold, right: X1 - PAD });
      const sw = FW / sigs.length;
      sigs.forEach((s, i) => {
        const sx = X0 + i * sw;
        const label = wrap(font, 7.4, s, sw - 2 * PAD)[0];
        if (i === sigs.length - 1) text(label, 0, BOTTOM + 7, { size: 7.4, font: bold, right: X1 - PAD });
        else text(label, sx + PAD, BOTTOM + 7, { size: 7.4, color: MUTED });
      });
    }

    // footer below the frame on each page of this copy
    const pages = doc.getPages().slice(first);
    pages.forEach((p, i) => {
      p.drawText(pdfSafe(spec.number), { x: X0, y: BOTTOM - 13, size: 6.8, font, color: MUTED });
      const mid = 'This is a computer-generated document.';
      p.drawText(mid, { x: W / 2 - font.widthOfTextAtSize(mid, 6.8) / 2, y: BOTTOM - 13, size: 6.8, font, color: MUTED });
      const l = `Page ${i + 1} of ${pages.length}`;
      p.drawText(l, { x: X1 - font.widthOfTextAtSize(l, 6.8), y: BOTTOM - 13, size: 6.8, font, color: MUTED });
    });
  }
  return doc.save({ useObjectStreams: false });
}
