/**
 * Days until an invoice or bill is due under a payment term.
 * "Net 30", "NET 45", "2% 10 Net 30" -> the Net days; "COD", "Pay in Advance", "Immediate" -> 0;
 * "30 days" -> 30; anything else -> 30.
 */
export function termDays(terms?: string): number {
  const t = String(terms || '');
  const net = /net\s*(\d+)/i.exec(t);
  if (net) return Number(net[1]);
  if (/\b(cod|cash on delivery|advance|immediate)\b/i.test(t)) return 0;
  const days = /(\d+)\s*days?\b/i.exec(t);
  return days ? Number(days[1]) : 30;
}
