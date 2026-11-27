import { describe, it, expect } from 'vitest';
import { buildGs1, serialRange, FNC1 } from '@/lib/labels';

describe('GS1-128 label data', () => {
  const base = { sku: 'BIK-URB-001', batchNo: 'FG-WO1-1', serialNo: 'S0001', mfgDate: new Date(2026, 9, 14), mrp: 18500 };

  it('uses AI 01 for a numeric GTIN and separates variable fields with FNC1', () => {
    const { encoded, human } = buildGs1({ ...base, gtin: '8901234567890' });
    expect(encoded).toBe(`${FNC1}010890123456789011261014` + `10FG-WO1-1${FNC1}392018500${FNC1}21S0001`);
    expect(human).toContain('(01)08901234567890');
  });

  it('falls back to AI 91 (internal SKU) when there is no GTIN', () => {
    const { encoded } = buildGs1(base);
    expect(encoded.startsWith(`${FNC1}11261014`)).toBe(true);
    expect(encoded).toContain('91BIK-URB-001');
  });

  it('generates sequential zero-padded serials', () => {
    expect(serialRange('S', 8, 3)).toEqual(['S0008', 'S0009', 'S0010']);
  });
});
