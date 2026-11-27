export const LOCATION_WRITE_ROLES = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER'];

const list = (v: any) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x: any) => String(x).trim().toUpperCase()).filter(Boolean);

/** Storage location fields from a request. On an update (`partial`) only the fields sent are returned. */
export function locationFields(b: any, partial = false) {
  const out: Record<string, any> = {};
  if (!partial || b.name !== undefined) out.name = b.name;
  if (b.plant !== undefined) out.plant = b.plant;
  for (const k of ['zones', 'racks', 'bins'] as const) if (!partial || b[k] !== undefined) out[k] = [...new Set(list(b[k]))];
  return out;
}
