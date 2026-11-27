// ITC-04 rule: inputs must return within 1 year, capital goods within 3 years of being sent for job work.
export function returnDeadline(goodsType: 'INPUT' | 'CAPITAL', sentOn: Date) {
  const d = new Date(sentOn);
  d.setFullYear(d.getFullYear() + (goodsType === 'CAPITAL' ? 3 : 1));
  return d;
}

export const heldQty = (i: { quantity: number; consumed: number; returned: number; scrap: number }) =>
  Math.round((i.quantity - i.consumed - i.returned - i.scrap) * 10000) / 10000;

export type Itc04Status = 'CLOSED' | 'OVERDUE' | 'DUE_SOON' | 'ON_TRACK';

export function itc04Status(order: { status: string; dueDate?: Date | string; items: any[] }, now = new Date()): { status: Itc04Status; daysToDue: number | null } {
  if (order.status === 'CLOSED' || order.items.every(heldQty0)) return { status: 'CLOSED', daysToDue: null };
  if (!order.dueDate) return { status: 'ON_TRACK', daysToDue: null };
  const days = Math.ceil((new Date(order.dueDate).getTime() - now.getTime()) / 86400000);
  return { status: days < 0 ? 'OVERDUE' : days <= 60 ? 'DUE_SOON' : 'ON_TRACK', daysToDue: days };
}
const heldQty0 = (i: any) => heldQty(i) <= 0;

// ITC-04 is filed quarterly (Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar); returns the FY quarter label for a date
export function itc04Quarter(d: Date) {
  const m = d.getMonth();
  const fyStart = m >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const q = m >= 3 && m <= 5 ? 1 : m >= 6 && m <= 8 ? 2 : m >= 9 ? 3 : 4;
  return `${fyStart}-${String(fyStart + 1).slice(-2)} Q${q}`;
}
