// OEE = Availability x Performance x Quality
//   Availability = run time / planned production time
//   Performance  = units made / units the machine could make in that run time at its ideal rate (capped at 100%)
//   Quality      = good units / total units
// Planned production time = scheduled time minus PLANNED stops (breaks, scheduled maintenance).
// Unplanned stops (breakdowns, changeovers, waiting for material...) reduce run time.

export const DOWNTIME_CATEGORIES = [
  { key: 'BREAKDOWN', label: 'Breakdown', planned: false },
  { key: 'SETUP_CHANGEOVER', label: 'Setup / changeover', planned: false },
  { key: 'NO_MATERIAL', label: 'Waiting for material', planned: false },
  { key: 'NO_OPERATOR', label: 'No operator', planned: false },
  { key: 'QUALITY_HOLD', label: 'Quality hold', planned: false },
  { key: 'MINOR_STOP', label: 'Minor stops / jams', planned: false },
  { key: 'PLANNED_MAINTENANCE', label: 'Planned maintenance', planned: true },
  { key: 'PLANNED_BREAK', label: 'Planned break', planned: true },
  { key: 'OTHER', label: 'Other', planned: false },
] as const;

export type DowntimeCategory = (typeof DOWNTIME_CATEGORIES)[number]['key'];
export const isPlanned = (c: string) => DOWNTIME_CATEGORIES.find(d => d.key === c)?.planned === true;
export const categoryLabel = (c: string) => DOWNTIME_CATEGORIES.find(d => d.key === c)?.label || c;
export const WORLD_CLASS_OEE = 0.85;

export interface RunInput {
  scheduledMinutes: number;
  downtimes: { category: string; minutes: number }[];
  totalCount: number;
  rejectCount: number;
  idealRatePerHour: number;
}

export interface RunFigures {
  scheduled: number;
  plannedStops: number;
  unplannedStops: number;
  plannedProduction: number;
  runtime: number;
  ideal: number;      // units possible in the run time at the ideal rate
  effCount: number;   // units counted towards performance (never above ideal)
  count: number;
  good: number;
  rejected: number;
  speedLossMinutes: number;
  qualityLossMinutes: number;
  fullyProductiveMinutes: number;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function validateRun(r: RunInput): string[] {
  const e: string[] = [];
  if (!(r.scheduledMinutes > 0) || r.scheduledMinutes > 1440) e.push('Scheduled time must be between 1 and 1440 minutes.');
  if (!(r.idealRatePerHour > 0)) e.push('Ideal rate (units per hour) must be greater than zero.');
  if (!(r.totalCount >= 0) || !Number.isFinite(r.totalCount)) e.push('Total count cannot be negative.');
  if (!(r.rejectCount >= 0)) e.push('Reject count cannot be negative.');
  if (r.rejectCount > r.totalCount) e.push('Rejects cannot exceed the total count.');
  if (r.downtimes.some(d => !(d.minutes >= 0))) e.push('Downtime minutes cannot be negative.');
  const stops = r.downtimes.reduce((s, d) => s + (d.minutes || 0), 0);
  if (stops > r.scheduledMinutes) e.push('Total downtime is longer than the scheduled time.');
  else {
    const f = runFigures(r);
    if (f.runtime <= 0 && r.totalCount > 0) e.push('Units were counted but the machine had no run time.');
  }
  return e;
}

export function runFigures(r: RunInput): RunFigures {
  const plannedStops = r.downtimes.filter(d => isPlanned(d.category)).reduce((s, d) => s + (d.minutes || 0), 0);
  const unplannedStops = r.downtimes.filter(d => !isPlanned(d.category)).reduce((s, d) => s + (d.minutes || 0), 0);
  const plannedProduction = Math.max(0, r.scheduledMinutes - plannedStops);
  const runtime = Math.max(0, plannedProduction - unplannedStops);
  const ideal = (runtime / 60) * r.idealRatePerHour;
  const effCount = Math.min(r.totalCount, ideal);
  const good = Math.max(0, r.totalCount - r.rejectCount);
  const quality = r.totalCount > 0 ? good / r.totalCount : 0;
  const idealMinutesForCount = r.idealRatePerHour > 0 ? (effCount / r.idealRatePerHour) * 60 : 0;
  return {
    scheduled: r.scheduledMinutes, plannedStops, unplannedStops, plannedProduction, runtime,
    ideal: r2(ideal), effCount: r2(effCount), count: r.totalCount, good, rejected: r.rejectCount,
    speedLossMinutes: r2(Math.max(0, runtime - idealMinutesForCount)),
    qualityLossMinutes: r2(idealMinutesForCount * (1 - quality)),
    fullyProductiveMinutes: r2(idealMinutesForCount * quality),
  };
}

export interface OeeResult { availability: number; performance: number; quality: number; oee: number }

/** Aggregates runs by summing first, then dividing (so long runs weigh more than short ones). Null when there is nothing to measure. */
export function aggregate(figs: RunFigures[]): (OeeResult & { runs: number; plannedProduction: number; runtime: number; units: number; good: number }) | null {
  if (!figs.length) return null;
  const sum = (f: (x: RunFigures) => number) => figs.reduce((s, x) => s + f(x), 0);
  const plannedProduction = sum(x => x.plannedProduction), runtime = sum(x => x.runtime), ideal = sum(x => x.ideal), eff = sum(x => x.effCount), count = sum(x => x.count), good = sum(x => x.good);
  if (plannedProduction <= 0) return null;
  const availability = runtime / plannedProduction;
  const performance = ideal > 0 ? eff / ideal : 0;
  const quality = count > 0 ? good / count : 0;
  return { availability: r4(availability), performance: r4(performance), quality: r4(quality), oee: r4(availability * performance * quality), runs: figs.length, plannedProduction, runtime, units: count, good };
}

export type OeeBand = 'world-class' | 'acceptable' | 'low';
export const oeeBand = (oee: number): OeeBand => (oee >= WORLD_CLASS_OEE ? 'world-class' : oee >= 0.6 ? 'acceptable' : 'low');
