import { describe, it, expect } from 'vitest';
import { normalizeCode, normalizeRate, readHsnSheet, mergeHsnSheets, parseCsv } from '@/lib/hsnImport';

describe('reading an HSN/SAC list', () => {
  it('cleans codes and gives Excel numbers their leading zero back', () => {
    expect(normalizeCode('8714')).toBe('8714');
    expect(normalizeCode(" '8714 10 ")).toBe('871410');
    expect(normalizeCode('8714.10')).toBe('871410');
    expect(normalizeCode(101)).toBe('0101'); // chapter 01 stored as a number
    expect(normalizeCode(10121)).toBe('010121');
    expect(normalizeCode('101')).toBe('101'); // typed as text: taken as written
    expect(normalizeCode('ABC')).toBeNull();
    expect(normalizeCode('1')).toBeNull();
    expect(normalizeCode('123456789')).toBeNull();
  });

  it('reads rates, including 18% and the 40% slab, and refuses anything else', () => {
    expect(normalizeRate('18%')).toBe(18);
    expect(normalizeRate(0.25)).toBe(0.25);
    expect(normalizeRate('40')).toBe(40);
    expect(normalizeRate('')).toBeNull();
    expect(normalizeRate('NA')).toBeNull();
    expect(normalizeRate('41')).toBeNaN();
    expect(normalizeRate('eighteen')).toBeNaN();
  });

  it('finds the columns of the GST portal sheets by their headers, below a title row', () => {
    const r = readHsnSheet('HSN', [['HSN master list'], ['HSN_CD', 'HSN_Description'], [8712, 'Bicycles and other cycles'], ['', ''], [101, 'Live horses']]);
    expect(r.issues).toEqual([]);
    expect(r.rows).toEqual([{ code: '8712', kind: 'HSN', description: 'Bicycles and other cycles' }, { code: '0101', kind: 'HSN', description: 'Live horses' }]);
    const sac = readHsnSheet('SAC', [['SAC_CD', 'SAC_Description'], [998314, 'IT design and development services']]);
    expect(sac.rows[0]).toEqual({ code: '998314', kind: 'SAC', description: 'IT design and development services' });
  });

  it('takes a rate column, ignores a cess column, and reports bad lines with their line number', () => {
    const r = readHsnSheet('Rates', [['Description', 'Cess', 'IGST Rate', 'HSN Code'], ['Bicycle parts', '0', '18%', '8714'], ['Odd', '', '18', 'X1'], ['Too high', '', '50', '8715']]);
    expect(r.rows).toEqual([{ code: '8714', kind: 'HSN', description: 'Bicycle parts', gstRate: 18 }]);
    expect(r.issues.map(i => i.line)).toEqual([3, 4]);
  });

  it('reads a file with no header as code, description, rate', () => {
    expect(readHsnSheet('CSV', [['8712', 'Bicycles', '5']]).rows).toEqual([{ code: '8712', kind: 'HSN', description: 'Bicycles', gstRate: 5 }]);
  });

  it('merges sheets: the last row of a repeated code wins but does not wipe a description or rate', () => {
    const m = mergeHsnSheets([
      { name: 'A', rows: [['Code', 'Description', 'GST'], ['8712', 'Bicycles', '12']] },
      { name: 'B', rows: [['Code', 'Description', 'GST'], ['8712', '', '5']] },
    ]);
    expect(m.rows).toEqual([{ code: '8712', kind: 'HSN', description: 'Bicycles', gstRate: 5 }]);
    expect(m.repeated).toBe(1);
  });

  it('parses CSV with quotes, commas and line breaks inside cells', () => {
    expect(parseCsv('﻿Code,Description\r\n8712,"Bicycles, not motorised"\n9983,"Line one\nline ""two"""\n')).toEqual([
      ['Code', 'Description'], ['8712', 'Bicycles, not motorised'], ['9983', 'Line one\nline "two"'],
    ]);
  });
});
