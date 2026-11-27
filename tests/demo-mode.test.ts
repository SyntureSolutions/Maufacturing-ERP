import { describe, it, expect, afterEach } from 'vitest';
import { demoMode, demoOrThrow } from '@/lib/demoMode';

describe('demo mode', () => {
  afterEach(() => { delete process.env.DEMO_MODE; });

  it('is off unless DEMO_MODE is exactly "true"', () => {
    expect(demoMode()).toBe(false);
    for (const v of ['1', 'yes', 'TRUE', 'false', '']) { process.env.DEMO_MODE = v; expect(demoMode(), v).toBe(false); }
    process.env.DEMO_MODE = 'true';
    expect(demoMode()).toBe(true);
  });

  it('rethrows the real error when off and lets the fallback run when on', () => {
    const err = new Error('db down');
    expect(() => demoOrThrow(err)).toThrow('db down');
    process.env.DEMO_MODE = 'true';
    expect(() => demoOrThrow(err)).not.toThrow();
  });

  it('a gated route returns an error, not sample data, when the database is unavailable', async () => {
    const { GET } = await import('@/app/api/supply-chain/route');
    const { NextRequest } = await import('next/server');
    const authModule = await import('@/lib/auth');
    const { vi } = await import('vitest');
    vi.spyOn(authModule, 'verifyAuth').mockResolvedValue({ id: 'u', name: 'A', role: 'ADMIN' } as any);
    const res: any = await GET(new NextRequest('http://localhost/api/supply-chain?type=shipments'));
    expect(res.status).toBeGreaterThanOrEqual(500);
    vi.restoreAllMocks();
  });
});
