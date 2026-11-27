import StorageLocation from '@/models/StorageLocation';
import { WAREHOUSES, RACKS, BINS } from '@/lib/warehouses';

/** The three original warehouses are created on first use (never re-created once they exist, even if deactivated). */
export async function ensureDefaultLocations() {
  await StorageLocation.bulkWrite(Object.entries(WAREHOUSES).map(([code, w]) => ({
    updateOne: {
      filter: { code },
      update: { $setOnInsert: { code, name: w.name, zones: [...w.zones], racks: RACKS, bins: BINS, isActive: true } },
      upsert: true,
    },
  })));
}

/**
 * Whether stock may be put away at this place. The location must exist and be active; where it lists zones,
 * racks or bins, the value must be one of them (an empty list means that level is not used).
 */
export async function checkPlace(code: string, zone?: string, rack?: string, bin?: string): Promise<string | null> {
  await ensureDefaultLocations();
  const loc: any = await StorageLocation.findOne({ code: String(code || '').trim().toUpperCase() }).lean();
  if (!loc) return `Storage location ${code} does not exist.`;
  if (!loc.isActive) return `Storage location ${loc.code} is not in use.`;
  const level = (list: string[], v: string | undefined, what: string) => {
    if (!list?.length) return null;
    return list.includes(String(v || '').trim().toUpperCase()) ? null : `${what} ${v || '(blank)'} is not in ${loc.code}.`;
  };
  return level(loc.zones, zone, 'Zone') || level(loc.racks, rack, 'Rack') || level(loc.bins, bin, 'Bin');
}

/** Whether this storage location exists and is in use, for moves between locations. Returns the reason it is not, or null. */
export async function checkLocation(code: string): Promise<string | null> {
  await ensureDefaultLocations();
  const loc: any = await StorageLocation.findOne({ code: String(code || '').trim().toUpperCase() }).select('code isActive').lean();
  if (!loc) return `Storage location ${code} does not exist.`;
  return loc.isActive ? null : `Storage location ${loc.code} is not in use.`;
}
