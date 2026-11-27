import SalesOrder from '@/models/SalesOrder';
import { HttpError } from '@/lib/httpError';
import { logAuditEvent } from '@/lib/audit';

// A sales manager can put an order on hold (stop it being approved, reserved, planned, proformed or dispatched) and release it.
// Stock already reserved stays reserved while the order is held. Release returns the order to the state it was held in.
export const HOLD_ROLES = ['ADMIN', 'MANAGER'];
export const HOLDABLE = ['DRAFT', 'APPROVED', 'IN_FULFILLMENT'];

type Actor = { id?: string; name: string; role: string };

export async function holdSalesOrder(id: string, reason: string, user: Actor) {
  if (!HOLD_ROLES.includes(user.role)) throw new HttpError(403, 'Only a Manager or Admin can put an order on hold.');
  if (String(reason || '').trim().length < 5) throw new HttpError(400, 'Give a reason for the hold (at least 5 characters).');
  const so: any = await SalesOrder.findById(id).lean();
  if (!so) throw new HttpError(404, 'Sales Order not found');
  if (so.status === 'ON_HOLD') throw new HttpError(409, `${so.soNumber} is already on hold.`);
  if (!HOLDABLE.includes(so.status)) throw new HttpError(409, `A ${String(so.status).replace('_', ' ').toLowerCase()} sales order cannot be put on hold.`);
  if (so.approvalPending) throw new HttpError(409, 'This order is waiting for an approval decision; decide that first.');

  const at = new Date();
  const entry = { reason: reason.trim(), by: user.name, role: user.role, at };
  // claimed against the state we read, so a hold cannot cross an approval or dispatch happening at the same moment
  const held = await SalesOrder.findOneAndUpdate(
    { _id: so._id, status: so.status, approvalPending: { $ne: true }, updatedAt: so.updatedAt },
    { $set: { status: 'ON_HOLD', hold: { fromStatus: so.status, ...entry } }, $push: { holdHistory: { action: 'HOLD', ...entry } } },
    { new: true },
  );
  if (!held) throw new HttpError(409, 'The order was changed by someone else. Reload and try again.');
  await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'EDIT', resource: 'SALES_ORDER', resourceId: String(so._id), resourceName: so.soNumber, details: `Put on hold (was ${so.status}).`, reason: entry.reason }).catch(() => {});
  return held;
}

export async function releaseSalesOrder(id: string, remarks: string, user: Actor) {
  if (!HOLD_ROLES.includes(user.role)) throw new HttpError(403, 'Only a Manager or Admin can release an order from hold.');
  const so: any = await SalesOrder.findById(id).lean();
  if (!so) throw new HttpError(404, 'Sales Order not found');
  if (so.status !== 'ON_HOLD' || !so.hold?.fromStatus) throw new HttpError(409, `${so.soNumber} is not on hold.`);

  const entry = { reason: String(remarks || '').trim() || undefined, by: user.name, role: user.role, at: new Date() };
  const released = await SalesOrder.findOneAndUpdate(
    { _id: so._id, status: 'ON_HOLD', updatedAt: so.updatedAt },
    { $set: { status: so.hold.fromStatus }, $unset: { hold: 1 }, $push: { holdHistory: { action: 'RELEASE', ...entry } } },
    { new: true },
  );
  if (!released) throw new HttpError(409, 'The order was changed by someone else. Reload and try again.');
  await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'APPROVE', resource: 'SALES_ORDER', resourceId: String(so._id), resourceName: so.soNumber, details: `Released from hold back to ${so.hold.fromStatus}.`, reason: entry.reason }).catch(() => {});
  return released;
}
