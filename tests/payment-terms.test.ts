import { describe, it, expect } from 'vitest';
import { termDays } from '@/lib/paymentTerms';

describe('payment term days', () => {
  it('reads the Net days, including with an early-payment discount', () => {
    expect(termDays('Net 30')).toBe(30);
    expect(termDays('NET 45')).toBe(45);
    expect(termDays('Net 60')).toBe(60);
    expect(termDays('2% 10 Net 30')).toBe(30); // not the 2 or the 10
  });

  it('treats cash and advance terms as due at once', () => {
    expect(termDays('COD')).toBe(0);
    expect(termDays('Pay in Advance')).toBe(0);
    expect(termDays('Immediate')).toBe(0);
  });

  it('reads plain day counts and falls back to 30', () => {
    expect(termDays('45 days')).toBe(45);
    expect(termDays('')).toBe(30);
    expect(termDays(undefined)).toBe(30);
    expect(termDays('On agreement')).toBe(30);
  });
});
