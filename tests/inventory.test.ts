import { describe, it, expect, vi, beforeEach } from 'vitest';
import { allocateStock } from '@/lib/allocation';
import Batch from '@/models/Batch';

// Mock the Batch model
vi.mock('@/models/Batch', () => ({
  default: {
    find: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

describe('Inventory FEFO Allocation', () => {
  const productId = 'prod_123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allocate from the earliest expiry batch first', async () => {
    const mockBatches = [
      {
        _id: 'batch_old',
        product: productId,
        expiryDate: new Date('2026-05-01'),
        currentQuantity: 50,
        allocatedQuantity: 0,
      },
      {
        _id: 'batch_new',
        product: productId,
        expiryDate: new Date('2026-06-01'),
        currentQuantity: 100,
        allocatedQuantity: 0,
      },
    ];

    // Mock Batch.find to return sorted batches
    (Batch.find as any).mockReturnValue({
      sort: vi.fn().mockResolvedValue(mockBatches),
    });

    // Mock Batch.findByIdAndUpdate
    (Batch.findByIdAndUpdate as any).mockResolvedValue({});

    const allocations = await allocateStock(productId, 60);

    // Should take 50 from batch_old and 10 from batch_new
    expect(allocations).toHaveLength(2);
    expect(allocations[0]).toEqual({ batchId: 'batch_old', quantity: 50 });
    expect(allocations[1]).toEqual({ batchId: 'batch_new', quantity: 10 });

    // Verify DB updates
    expect(Batch.findByIdAndUpdate).toHaveBeenCalledWith('batch_old', {
      $inc: { allocatedQuantity: 50 },
    });
    expect(Batch.findByIdAndUpdate).toHaveBeenCalledWith('batch_new', {
      $inc: { allocatedQuantity: 10 },
    });
  });

  it('should throw an error and rollback if stock is insufficient', async () => {
    const mockBatches = [
      {
        _id: 'batch_old',
        product: productId,
        expiryDate: new Date('2026-05-01'),
        currentQuantity: 10,
        allocatedQuantity: 0,
      },
    ];

    (Batch.find as any).mockReturnValue({
      sort: vi.fn().mockResolvedValue(mockBatches),
    });

    // We try to allocate 20 but only have 10
    await expect(allocateStock(productId, 20)).rejects.toThrow(/Insufficient stock/);

    // Verify rollback (it should increment then decrement)
    expect(Batch.findByIdAndUpdate).toHaveBeenCalledWith('batch_old', {
      $inc: { allocatedQuantity: 10 },
    });
    expect(Batch.findByIdAndUpdate).toHaveBeenCalledWith('batch_old', {
      $inc: { allocatedQuantity: -10 },
    });
  });
});
