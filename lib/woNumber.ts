import WorkOrder from '@/models/WorkOrder';

// Same format the production screen uses: WO-BIK-YYYYMMDD-001
export async function nextWoNumber(date: Date = new Date()) {
  const prefix = `WO-BIK-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const count = await WorkOrder.countDocuments({ woNumber: new RegExp(`^${prefix}`) });
  return `${prefix}-${String(count + 1).padStart(3, '0')}`;
}
