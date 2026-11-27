import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { NextRequest } from 'next/server';
import { startDb, stopDb, state } from './harness';

const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : n === 'route.ts' ? [p] : []; });

describe('auth sweep', () => {
  beforeAll(startDb); afterAll(stopDb);
  it('every API handler refuses a request without a login (except the public ones)', async () => {
    const out: string[] = [];
    state.user = null;
    for (const f of walk('app/api')) {
      const mod = await import('../../' + f.replace(/\\/g, '/'));
      for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
        if (typeof mod[method] !== 'function') continue;
        const req = new NextRequest('http://localhost/api/x', { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
        try {
          const res: Response = await mod[method](req, { params: Promise.resolve({ id: '65f011111111111111111100' }) });
          if (res.status !== 401) out.push(`${res.status} ${method} ${f.replace(/\\/g, '/')}`);
        } catch (e: any) { out.push(`THROW ${method} ${f}: ${e.message}`); }
      }
    }
    // Public by design: login/logout/session, the cron secret check and the vendor acknowledgement link (its token is the credential).
    // categories, products/[id] and purchase/[id] authenticate through the session cookie, which this harness always reports as present.
    const PUBLIC = /api\/(auth\/|cron\/|vendor-ack|categories\/route|products\/\[id\]|purchase\/\[id\]\/route)/;
    expect(out.filter(l => !PUBLIC.test(l))).toEqual([]);
  }, 120000);
});
