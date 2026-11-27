
export type ValuationMethod = 'FIFO' | 'WEIGHTED_AVERAGE' | 'LIFO';

export interface BatchCostItem {
  batchNumber: string;
  quantity: number;
  unitCost: number;
  createdAt?: string | Date;
}

export interface ValuationResult {
  method: ValuationMethod;
  totalQuantity: number;
  totalValuation: number;
  averageUnitCost: number;
  consumedCost?: number;
  costBreakdown?: {
    batchNumber: string;
    consumedQty: number;
    unitCost: number;
    costTotal: number;
  }[];
}

/**
 * Calculate inventory valuation under FIFO, Weighted Average, or LIFO
 */
export function calculateInventoryValuation(
  batches: BatchCostItem[],
  method: ValuationMethod = 'FIFO',
  consumeQty: number = 0
): ValuationResult {
  const safeBatches = [...batches].filter(b => b.quantity > 0);
  const totalQuantity = safeBatches.reduce((sum, b) => sum + b.quantity, 0);

  if (totalQuantity === 0) {
    return {
      method,
      totalQuantity: 0,
      totalValuation: 0,
      averageUnitCost: 0,
      consumedCost: 0,
      costBreakdown: []
    };
  }

  // Calculate Weighted Average Cost (WAC)
  const totalValuationWAC = safeBatches.reduce((sum, b) => sum + b.quantity * b.unitCost, 0);
  const weightedAverageUnitCost = Math.round((totalValuationWAC / totalQuantity) * 100) / 100;

  if (method === 'WEIGHTED_AVERAGE') {
    const consumedCost = Math.round(consumeQty * weightedAverageUnitCost);
    return {
      method: 'WEIGHTED_AVERAGE',
      totalQuantity,
      totalValuation: totalValuationWAC,
      averageUnitCost: weightedAverageUnitCost,
      consumedCost,
      costBreakdown: [
        {
          batchNumber: 'BLENDED_AVERAGE',
          consumedQty: consumeQty,
          unitCost: weightedAverageUnitCost,
          costTotal: consumedCost
        }
      ]
    };
  }

  // Sort order: FIFO (Oldest first), LIFO (Newest first)
  const sortedBatches = [...safeBatches].sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return method === 'FIFO' ? timeA - timeB : timeB - timeA;
  });

  let remainingToConsume = consumeQty;
  let totalConsumedCost = 0;
  const breakdown: { batchNumber: string; consumedQty: number; unitCost: number; costTotal: number }[] = [];

  for (const b of sortedBatches) {
    if (remainingToConsume <= 0) break;
    const qtyToTake = Math.min(b.quantity, remainingToConsume);
    const cost = qtyToTake * b.unitCost;
    totalConsumedCost += cost;
    remainingToConsume -= qtyToTake;
    breakdown.push({
      batchNumber: b.batchNumber,
      consumedQty: qtyToTake,
      unitCost: b.unitCost,
      costTotal: cost
    });
  }

  // Total balance sheet valuation for the method
  const totalValuation = safeBatches.reduce((sum, b) => sum + b.quantity * b.unitCost, 0);

  return {
    method,
    totalQuantity,
    totalValuation,
    averageUnitCost: weightedAverageUnitCost,
    consumedCost: totalConsumedCost,
    costBreakdown: breakdown
  };
}
