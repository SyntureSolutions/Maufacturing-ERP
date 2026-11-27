import Invoice from '@/models/Invoice';
import SalesOrder from '@/models/SalesOrder';
import Customer from '@/models/Customer';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Roles that may knowingly let an order through over a customer's credit limit. */
export const CREDIT_OVERRIDE_ROLES = ['ADMIN', 'MANAGER', 'FINANCE_MANAGER'];

/**
 * What a customer already owes or is about to owe:
 *  - receivable: issued sales invoices not yet paid, less credit notes
 *  - openOrders: approved orders that have not been invoiced yet (orders part-way invoiced are not counted, so this errs on the low side)
 */
export async function creditExposure(customerId: any) {
  const invoices: any[] = await Invoice.find({ type: 'SALES', customer: customerId, status: { $in: ['ISSUED', 'PARTIAL'] } }).select('totalAmount amountPaid creditedAmount').lean();
  const receivable = r2(invoices.reduce((s, i) => s + Math.max(0, (i.totalAmount || 0) - (i.amountPaid || 0) - (i.creditedAmount || 0)), 0));
  const orders: any[] = await SalesOrder.find({ customer: customerId, $or: [{ status: { $in: ['APPROVED', 'IN_FULFILLMENT'] } }, { status: 'ON_HOLD', 'hold.fromStatus': { $in: ['APPROVED', 'IN_FULFILLMENT'] } }], taxInvoiceStatus: { $in: ['UNINVOICED', 'REQUESTED', null] } }).select('totalAmount').lean();
  const openOrders = r2(orders.reduce((s, o) => s + (o.totalAmount || 0), 0));
  return { receivable, openOrders, total: r2(receivable + openOrders) };
}

/** Would adding `amount` take the customer over their limit? A customer with no limit set is never blocked. */
export async function checkCredit(customerId: any, amount: number) {
  const customer: any = await Customer.findById(customerId).select('creditLimit name').lean();
  if (!customer || !customer.creditLimit) return { limited: false as const, over: false, limit: 0, exposure: 0, newTotal: 0, receivable: 0, openOrders: 0 };
  const e = await creditExposure(customerId);
  const newTotal = r2(e.total + (amount || 0));
  return { limited: true as const, over: newTotal > customer.creditLimit, limit: customer.creditLimit as number, exposure: e.total, newTotal, receivable: e.receivable, openOrders: e.openOrders };
}
