import { describe, it, expect } from 'vitest';
import { aggregate, oeeBand, runFigures, validateRun, RunInput } from '@/lib/oee';

// Classic worked example: 480 min shift, 60 min breakdown + 30 min changeover, 47 min planned break
// ideal rate 60/h, 19,271 units... scaled down here: 7 h shift for easy mental arithmetic.
const run: RunInput = {
  scheduledMinutes: 480,
  downtimes: [{ category: 'PLANNED_BREAK', minutes: 60 }, { category: 'BREAKDOWN', minutes: 40 }, { category: 'SETUP_CHANGEOVER', minutes: 20 }],
  totalCount: 300, rejectCount: 15, idealRatePerHour: 60,
};

describe('OEE maths', () => {
  it('separates planned stops from unplanned downtime', () => {
    const f = runFigures(run);
    expect(f.plannedStops).toBe(60);
    expect(f.unplannedStops).toBe(60);
    expect(f.plannedProduction).toBe(420); // 480 - 60 planned
    expect(f.runtime).toBe(360);           // 420 - 60 unplanned
    expect(f.ideal).toBe(360);             // 6 h x 60/h
  });

  it('computes availability x performance x quality', () => {
    const a = aggregate([runFigures(run)])!;
    expect(a.availability).toBeCloseTo(360 / 420, 4);   // 85.71%
    expect(a.performance).toBeCloseTo(300 / 360, 4);    // 83.33%
    expect(a.quality).toBeCloseTo(285 / 300, 4);        // 95%
    expect(a.oee).toBeCloseTo((360 / 420) * (300 / 360) * (285 / 300), 4);
    expect(a.oee).toBeCloseTo(0.6786, 3);
  });

  it('loss minutes add up: planned production = productive + speed loss + quality loss + downtime', () => {
    const f = runFigures(run);
    const total = f.fullyProductiveMinutes + f.speedLossMinutes + f.qualityLossMinutes + f.unplannedStops;
    expect(total).toBeCloseTo(f.plannedProduction, 1);
    // fully productive time as a share of planned production equals OEE
    expect(f.fullyProductiveMinutes / f.plannedProduction).toBeCloseTo(aggregate([f])!.oee, 3);
  });

  it('caps performance at 100% when a run reports more units than the ideal rate allows', () => {
    const f = runFigures({ ...run, totalCount: 500 });
    const a = aggregate([f])!;
    expect(a.performance).toBe(1);
    expect(a.oee).toBeLessThanOrEqual(a.availability);
  });

  it('weights runs by their length when aggregating', () => {
    const long = runFigures({ scheduledMinutes: 480, downtimes: [], totalCount: 480, rejectCount: 0, idealRatePerHour: 60 });        // A 100%, P 60%, Q 100%
    const short = runFigures({ scheduledMinutes: 60, downtimes: [{ category: 'BREAKDOWN', minutes: 30 }], totalCount: 30, rejectCount: 0, idealRatePerHour: 60 }); // A 50%, P 100%
    const a = aggregate([long, short])!;
    expect(a.availability).toBeCloseTo(510 / 540, 4);
    expect(a.runs).toBe(2);
  });

  it('validates entries', () => {
    expect(validateRun(run)).toEqual([]);
    expect(validateRun({ ...run, scheduledMinutes: 0 })[0]).toContain('Scheduled');
    expect(validateRun({ ...run, rejectCount: 400 }).join()).toContain('exceed');
    expect(validateRun({ ...run, idealRatePerHour: 0 }).join()).toContain('Ideal rate');
    expect(validateRun({ ...run, downtimes: [{ category: 'BREAKDOWN', minutes: 600 }] }).join()).toContain('longer than the scheduled');
    expect(validateRun({ ...run, downtimes: [{ category: 'BREAKDOWN', minutes: 480 }] }).join()).toContain('no run time');
    expect(validateRun({ ...run, downtimes: [{ category: 'BREAKDOWN', minutes: -5 }] }).join()).toContain('negative');
  });

  it('returns null with nothing to measure and bands the result', () => {
    expect(aggregate([])).toBeNull();
    expect(oeeBand(0.9)).toBe('world-class');
    expect(oeeBand(0.7)).toBe('acceptable');
    expect(oeeBand(0.3)).toBe('low');
  });
});
