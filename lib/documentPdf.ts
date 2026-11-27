import { PDFFont } from 'pdf-lib';

// Text helpers for PDFs drawn with the standard fonts (Latin-1 only): the rupee sign becomes "Rs.", other characters
// outside Latin-1 become "?" instead of failing the document. The documents themselves are laid out by lib/printLayout.

export const pdfSafe = (v: unknown): string =>
  String(v ?? '').replace(/₹/g, 'Rs. ').replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

export const safeFileName = (base: unknown, ext = 'pdf'): string =>
  `${String(base ?? 'document').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'document'}.${ext}`;

export const money = (n: number): string =>
  `Rs. ${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtDate = (d?: any): string =>
  (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');

export function wrapText(font: PDFFont, size: number, text: string, maxWidth: number): string[] {
  const words = pdfSafe(text).split(' ').filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test;
      continue;
    }
    if (line) lines.push(line);
    let rest = w;
    while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
