import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startDb, stopDb, call, asRole, asAdmin, id } from './harness';
import { pivot } from '@/lib/pivot';

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

describe('machine runtime capture and OEE', () => {
  const m: any = {}, r: any = {}, d: any = {};
  const log = (b: any) => call(r.runs.POST, 'POST', { day: daysAgo(1), shift: 'A', scheduledMinutes: 480, totalCount: 300, rejectCount: 15, ...b });

  beforeAll(async () => {
    await startDb();
    m.Machine = (await import('@/models/Machine')).default;
    r.runs = await import('@/app/api/machine-runs/route');
    r.run = await import('@/app/api/machine-runs/[id]/route');
    r.oee = await import('@/app/api/oee/route');
    r.bi = await import('@/app/api/bi/route');
    d.m1 = await m.Machine.create({ name: 'Weld Cell 1', code: 'W1', type: 'WELD', capacity: 60 });
    d.m2 = await m.Machine.create({ name: 'Paint Line', code: 'P1', type: 'PAINT' }); // no default capacity
    asAdmin();
  }, 120000);

  afterAll(stopDb);

  it('validates shift entries', async () => {
    const base = { machine: id(d.m1) };
    asRole('VIEWER');
    expect((await log(base)).status).toBe(403);
    asRole('PRODUCTION_MANAGER');
    expect((await log({ machine: 'nope' })).status).toBe(400);
    expect((await log({ ...base, day: 'yesterday' })).status).toBe(400);
    expect((await log({ ...base, day: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) })).json.error).toContain('future');
    expect((await log({ ...base, shift: '' })).status).toBe(400);
    expect((await log({ ...base, rejectCount: 999 })).json.error).toContain('exceed');
    expect((await log({ ...base, downtimes: [{ category: 'BREAKDOWN', minutes: 600 }] })).json.error).toContain('longer');
    expect((await log({ ...base, downtimes: [{ category: 'LUNCH', minutes: 10 }] })).json.error).toContain('Unknown downtime');
    expect((await log({ machine: id(d.m2) })).json.error).toContain('Ideal rate'); // machine has no capacity to default from
  });

  it('records a run, defaulting the ideal rate from the machine capacity, and returns the derived figures', async () => {
    const ok = await log({ machine: id(d.m1), downtimes: [{ category: 'PLANNED_BREAK', minutes: 60 }, { category: 'BREAKDOWN', minutes: 40 }, { category: 'SETUP_CHANGEOVER', minutes: 20 }] });
    expect(ok.status).toBe(201);
    expect(ok.json.idealRatePerHour).toBe(60); // from Machine.capacity
    expect(ok.json.figures.plannedProduction).toBe(420);
    expect(ok.json.figures.runtime).toBe(360);
    d.firstRun = id(ok.json);
  });

  it('refuses a second record for the same machine, date and shift', async () => {
    const dup = await log({ machine: id(d.m1) });
    expect(dup.status).toBe(409);
    expect((await log({ machine: id(d.m1), shift: 'B' })).status).toBe(201); // another shift is fine
  });

  it('reports availability, performance, quality and OEE with a loss breakdown', async () => {
    await log({ machine: id(d.m2), idealRatePerHour: 100, day: daysAgo(2), scheduledMinutes: 480, totalCount: 600, rejectCount: 60, downtimes: [{ category: 'BREAKDOWN', minutes: 120 }] });
    const res = await call(r.oee.GET, 'GET', undefined, undefined, `?from=${daysAgo(7)}&to=${today}`);
    expect(res.status).toBe(200);
    const { overall, machines, trend, losses, downtime } = res.json;

    expect(overall.runs).toBe(3);
    expect(overall.oee).toBeCloseTo(overall.availability * overall.performance * overall.quality, 3);
    expect(machines.map((x: any) => x.name)).toEqual(expect.arrayContaining(['Weld Cell 1', 'Paint Line']));
    expect(machines[0].oee).toBeLessThanOrEqual(machines[machines.length - 1].oee); // worst first
    const paint = machines.find((x: any) => x.name === 'Paint Line');
    expect(paint.availability).toBeCloseTo(360 / 480, 4);
    expect(paint.performance).toBeCloseTo(600 / 600, 4);   // 6 h x 100/h = 600 -> exactly ideal
    expect(paint.quality).toBeCloseTo(540 / 600, 4);
    expect(trend.length).toBe(2); // two distinct days
    expect(trend[0].day < trend[1].day).toBe(true);

    const byKey = Object.fromEntries(losses.map((l: any) => [l.key, l.minutes]));
    expect(byKey.scheduled).toBe(480 * 3);
    expect(byKey.planned).toBe(60);
    expect(byKey.downtime).toBe(60 + 120 + 0);
    // everything scheduled is accounted for: productive + losses = scheduled
    expect(byKey.productive + byKey.speed + byKey.quality + byKey.downtime + byKey.planned).toBeCloseTo(byKey.scheduled, -1);
    expect(downtime[0].category).toBe('BREAKDOWN'); // largest first
    expect(downtime[0].minutes).toBe(160);
    expect(downtime.find((x: any) => x.category === 'PLANNED_BREAK').planned).toBe(true);
  });

  it('filters by machine and date range, and is empty for a quiet period', async () => {
    const one = await call(r.oee.GET, 'GET', undefined, undefined, `?from=${daysAgo(7)}&to=${today}&machine=${id(d.m2)}`);
    expect(one.json.overall.runs).toBe(1);
    const none = await call(r.oee.GET, 'GET', undefined, undefined, `?from=2001-01-01&to=2001-01-31`);
    expect(none.json.overall).toBeNull();
    expect(none.json.machines).toEqual([]);
  });

  it('the report builder dataset gives the same OEE as the dashboard', async () => {
    const cat = await call(r.bi.GET, 'GET');
    expect(cat.json.map((s: any) => s.key)).toContain('oee');
    const ds = await call(r.bi.GET, 'GET', undefined, undefined, '?source=oee');
    expect(ds.status).toBe(200);
    expect(ds.json.rows).toHaveLength(3);
    const oeeMetric = ds.json.metrics.find((x: any) => x.key === 'oee');
    const overall = pivot(ds.json.rows, [], null, oeeMetric).grandTotal;
    const api = (await call(r.oee.GET, 'GET', undefined, undefined, `?from=2000-01-01&to=${today}`)).json.overall.oee;
    expect(overall).toBeCloseTo(api, 3);

    // per machine, from the pivot
    const perMachine = pivot(ds.json.rows, ['machine'], null, oeeMetric);
    const apiMachines = (await call(r.oee.GET, 'GET', undefined, undefined, `?from=2000-01-01&to=${today}`)).json.machines;
    for (const am of apiMachines) expect(perMachine.rowTotals[am.name]).toBeCloseTo(am.oee, 3);

    // the three component metrics multiply back to OEE for a single machine
    const metric = (k: string) => ds.json.metrics.find((x: any) => x.key === k);
    const rows = ds.json.rows.filter((x: any) => x.machine === 'Paint Line');
    const A = pivot(rows, [], null, metric('availability')).grandTotal!, P = pivot(rows, [], null, metric('performance')).grandTotal!, Q = pivot(rows, [], null, metric('quality')).grandTotal!;
    expect(A * P * Q).toBeCloseTo(pivot(rows, [], null, oeeMetric).grandTotal!, 3);
  });

  it('deleting a run changes the figures; only managers can delete', async () => {
    asRole('STAFF');
    expect((await call(r.run.DELETE, 'DELETE', undefined, { id: d.firstRun })).status).toBe(403);
    asRole('PRODUCTION_MANAGER');
    expect((await call(r.run.DELETE, 'DELETE', undefined, { id: d.firstRun })).status).toBe(200);
    expect((await call(r.run.DELETE, 'DELETE', undefined, { id: d.firstRun })).status).toBe(404);
    expect((await call(r.oee.GET, 'GET', undefined, undefined, `?from=${daysAgo(7)}&to=${today}`)).json.overall.runs).toBe(2);
  });
});
