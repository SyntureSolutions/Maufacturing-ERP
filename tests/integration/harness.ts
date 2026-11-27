import { vi } from 'vitest';
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Integration harness: real route handlers + real Mongoose models against an in-memory MongoDB.
export const state = { user: { id: '65f011111111111111111100', name: 'Test Admin', role: 'ADMIN' } as any };
vi.mock('@/lib/auth', () => ({ verifyAuth: async () => state.user, getSession: async () => ({ user: state.user }) }));

let server: MongoMemoryServer;

export async function startDb() {
  server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri('prodexa_test');
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  // dbConnect() reuses this connection
  (global as any).mongoose = { conn: mongoose, promise: Promise.resolve(mongoose) };
}

export async function stopDb() {
  await mongoose.disconnect();
  await server?.stop();
}

export const asRole = (role: string, name = `Test ${role}`) => { state.user = { id: '65f0111111111111111111aa', name, role }; };
export const asAdmin = () => { state.user = { id: '65f011111111111111111100', name: 'Test Admin', role: 'ADMIN' }; };

/** Calls a route handler. `params` is passed as the dynamic-route context. */
export async function call(handler: Function, method: string, body?: any, params?: Record<string, string>, query = '') {
  const req = new NextRequest(`http://localhost/api/test${query}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const res: Response = await (params ? handler(req, { params: Promise.resolve(params) }) : handler(req));
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON (xml/csv) */ }
  return { status: res.status, json, text };
}

export const id = (doc: any) => String(doc._id || doc.id);

/**
 * Makes a pick list for a sales order and confirms it as planned, so a delivery challan can be issued for it.
 * Returns the list, or null when there is nothing to pick. With topUp, any stock the order is short of is first received
 * as an approved batch (the pick rule needs real stock; tests that are not about stock use this to get it).
 */
export async function pickAll(soId: string, topUp = false) {
  const list = await import('@/app/api/pick-lists/route');
  const one = await import('@/app/api/pick-lists/[id]/route');
  const prev = state.user;
  if (topUp) {
    const SO: any = (await import('@/models/SalesOrder')).default, Batch: any = (await import('@/models/Batch')).default;
    const so: any = await SO.findById(soId).lean();
    const need = new Map<string, number>();
    for (const it of so?.items || []) need.set(String(it.product), (need.get(String(it.product)) || 0) + Math.max(0, it.quantity - (it.dispatchedQty || 0)));
    for (const [product, qty] of need) {
      const have = (await Batch.find({ product, qualityStatus: 'APPROVED', store: { $nin: ['QUARANTINE', 'SCRAP'] } }).lean()).reduce((a: number, b: any) => a + Math.max(0, (b.currentQuantity || 0) - (b.allocatedQuantity || 0)), 0)
        + (so.allocatedBatches || []).filter((a: any) => String(a.product) === product).reduce((a: number, b: any) => a + (b.quantity || 0), 0);
      if (have < qty) await Batch.create({ batchNumber: `TOP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, product, initialQuantity: qty - have, currentQuantity: qty - have, allocatedQuantity: 0, purchasePrice: 0, expiryDate: new Date('2035-01-01'), qualityStatus: 'APPROVED' });
    }
  }
  asRole('SUPPLY_CHAIN_MANAGER');
  try {
    const made = await call(list.POST, 'POST', { salesOrderId: soId });
    if (made.status !== 201) return null;
    return (await call(one.PATCH, 'PATCH', { action: 'confirm', all: true }, { id: made.json._id })).json;
  } finally { state.user = prev; }
}
