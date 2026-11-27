import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import MachineRun from '@/models/MachineRun';
import '@/models/Machine';
import { verifyAuth } from '@/lib/auth';
import { aggregate, categoryLabel, isPlanned, runFigures, RunFigures } from '@/lib/oee';

// GET /api/oee?from=YYYY-MM-DD&to=YYYY-MM-DD[&machine=id]
// Returns overall OEE, per-machine OEE, a daily trend, a loss breakdown (time lost at each stage) and a downtime Pareto.
export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const q = req.nextUrl.searchParams;
    const from = q.get('from'), to = q.get('to');
    const filter: any = {};
    if (from || to) filter.day = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    if (q.get('machine') && mongoose.isValidObjectId(q.get('machine'))) filter.machine = q.get('machine');

    await dbConnect();
    const runs = await MachineRun.find(filter).populate('machine', 'name code').lean() as any[];
    const withFigs = runs.map(r => ({ run: r, f: runFigures(r) as RunFigures }));

    const overall = aggregate(withFigs.map(x => x.f));

    const byMachine = new Map<string, { name: string; code?: string; figs: RunFigures[] }>();
    for (const { run, f } of withFigs) {
      const key = String(run.machine?._id || run.machine);
      const cur: { name: string; code?: string; figs: RunFigures[] } = byMachine.get(key) || { name: run.machine?.name || 'Unknown', code: run.machine?.code, figs: [] };
      cur.figs.push(f); byMachine.set(key, cur);
    }
    const machines = [...byMachine.entries()].map(([id, m]) => ({ machine: id, name: m.name, code: m.code, ...aggregate(m.figs)!, downtimeMinutes: m.figs.reduce((s, x) => s + x.unplannedStops, 0) })).sort((a, b) => a.oee - b.oee);

    const byDay = new Map<string, RunFigures[]>();
    for (const { run, f } of withFigs) byDay.set(run.day, [...(byDay.get(run.day) || []), f]);
    const trend = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, figs]) => ({ day, ...aggregate(figs)! }));

    const sum = (fn: (f: RunFigures) => number) => Math.round(withFigs.reduce((s, x) => s + fn(x.f), 0));
    const losses = overall ? [
      { key: 'scheduled', label: 'Scheduled time', minutes: sum(f => f.scheduled) },
      { key: 'planned', label: 'Planned stops (breaks, maintenance)', minutes: sum(f => f.plannedStops) },
      { key: 'downtime', label: 'Unplanned downtime', minutes: sum(f => f.unplannedStops) },
      { key: 'speed', label: 'Speed loss (slower than ideal rate)', minutes: sum(f => f.speedLossMinutes) },
      { key: 'quality', label: 'Quality loss (rejects)', minutes: sum(f => f.qualityLossMinutes) },
      { key: 'productive', label: 'Fully productive time', minutes: sum(f => f.fullyProductiveMinutes) },
    ] : [];

    const pareto = new Map<string, number>();
    for (const { run } of withFigs) for (const d of run.downtimes || []) pareto.set(d.category, (pareto.get(d.category) || 0) + d.minutes);
    const downtime = [...pareto.entries()].map(([category, minutes]) => ({ category, label: categoryLabel(category), minutes, planned: isPlanned(category) })).sort((a, b) => b.minutes - a.minutes);

    return NextResponse.json({ overall, machines, trend, losses, downtime });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
