export const WAREHOUSES = {
  W1: { name: 'Raw Material Store', zones: ['A', 'B', 'C'] },
  W2: { name: 'Fasteners Store', zones: ['A', 'B'] },
  W3: { name: 'Chemicals / Paint Store', zones: ['A', 'B'] },
} as const;

export type WarehouseCode = keyof typeof WAREHOUSES;

export const RACKS = Array.from({ length: 8 }, (_, i) => `R${i + 1}`);
export const BINS = Array.from({ length: 12 }, (_, i) => `B${i + 1}`);

export function validLocation(w: string, zone: string, rack: string, bin: string) {
  const wh = (WAREHOUSES as any)[w];
  return !!wh && (wh.zones as readonly string[]).includes(zone) && RACKS.includes(rack) && BINS.includes(bin);
}
