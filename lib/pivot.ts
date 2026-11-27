export interface Metric {
  key: string;
  label: string;
  agg: 'sum' | 'avg' | 'count' | 'ratio' | 'oee';
  field?: string; // for sum / avg
  num?: string; // for ratio: sum(num) / sum(den)
  den?: string;
  format?: 'number' | 'percent' | 'currency';
}

export interface PivotResult {
  rowKeys: string[][];
  colKeys: string[];
  cells: Record<string, number | null>; // `${rowKey}||${colKey}`
  rowTotals: Record<string, number | null>;
  colTotals: Record<string, number | null>;
  grandTotal: number | null;
}

interface Acc { sum: number; n: number; num: number; den: number; parts: Record<string, number> }
const blank = (): Acc => ({ sum: 0, n: 0, num: 0, den: 0, parts: {} });
// OEE needs six sums: run time, planned production time, ideal and counted output, good and total units
const OEE_FIELDS = ['runtime', 'planned', 'ideal', 'eff', 'count', 'good'];

function add(acc: Acc, m: Metric, row: Record<string, any>) {
  if (m.agg === 'count') acc.n += 1;
  else if (m.agg === 'oee') { for (const k of OEE_FIELDS) acc.parts[k] = (acc.parts[k] || 0) + (Number(row[k]) || 0); }
  else if (m.agg === 'ratio') { acc.num += Number(row[m.num!]) || 0; acc.den += Number(row[m.den!]) || 0; }
  else { acc.sum += Number(row[m.field!]) || 0; acc.n += 1; }
}

function value(acc: Acc | undefined, m: Metric): number | null {
  if (!acc) return null;
  const r = (n: number) => Math.round(n * 100) / 100;
  if (m.agg === 'count') return acc.n;
  if (m.agg === 'oee') {
    const p = acc.parts;
    if (!p.planned || !p.ideal || !p.count) return null;
    // availability x performance (counted units never exceed ideal, so <= 100%) x quality
    return Math.round((p.runtime / p.planned) * (p.eff / p.ideal) * (p.good / p.count) * 10000) / 10000;
  }
  if (m.agg === 'ratio') return acc.den ? Math.round((acc.num / acc.den) * 10000) / 10000 : null;
  if (m.agg === 'avg') return acc.n ? r(acc.sum / acc.n) : null;
  return r(acc.sum);
}

const label = (v: unknown) => (v === undefined || v === null || v === '' ? '(blank)' : String(v));

/** Groups rows by row dimensions (and an optional column dimension) and aggregates one metric. */
export function pivot(rows: Record<string, any>[], rowDims: string[], colDim: string | null, metric: Metric): PivotResult {
  const cells = new Map<string, Acc>(), rowT = new Map<string, Acc>(), colT = new Map<string, Acc>(), grand = blank();
  const rowKeys = new Map<string, string[]>(), colKeys = new Set<string>();
  for (const r of rows) {
    const rk = rowDims.map(d => label(r[d]));
    const rowKey = rk.join(' / ') || 'All';
    const colKey = colDim ? label(r[colDim]) : 'Value';
    rowKeys.set(rowKey, rk.length ? rk : ['All']); colKeys.add(colKey);
    for (const [map, key] of [[cells, `${rowKey}||${colKey}`], [rowT, rowKey], [colT, colKey]] as const) {
      if (!map.has(key)) map.set(key, blank());
      add(map.get(key)!, metric, r);
    }
    add(grand, metric, r);
  }
  const sortedRows = [...rowKeys.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const cols = [...colKeys].sort();
  const out: PivotResult = { rowKeys: sortedRows.map(([, v]) => v), colKeys: cols, cells: {}, rowTotals: {}, colTotals: {}, grandTotal: value(rows.length ? grand : undefined, metric) };
  for (const [rk] of sortedRows) {
    out.rowTotals[rk] = value(rowT.get(rk), metric);
    for (const c of cols) out.cells[`${rk}||${c}`] = value(cells.get(`${rk}||${c}`), metric);
  }
  for (const c of cols) out.colTotals[c] = value(colT.get(c), metric);
  return out;
}
