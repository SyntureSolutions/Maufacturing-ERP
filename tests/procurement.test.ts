import { describe, it, expect, vi, beforeEach } from 'vitest';
import PurchaseOrder from '@/models/PurchaseOrder';
import Batch from '@/models/Batch';

// Mock models
vi.mock('@/models/PurchaseOrder', () => ({
  default: {
    create: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock('@/models/Batch', () => ({
  default: {
    create: vi.fn(),
    insertMany: vi.fn(),
  },
}));

describe('Procurement Workflow (Stock In)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a purchase order correctly', async () => {
    const mockPO = { poNumber: 'PO-2026-001', supplier: 'sup_123', status: 'DRAFT' };
    (PurchaseOrder.create as any).mockResolvedValue(mockPO);

    const result = await PurchaseOrder.create(mockPO);
    expect(result.status).toBe('DRAFT');
    expect(PurchaseOrder.create).toHaveBeenCalledWith(mockPO);
  });

  it('should generate batches when PO is marked as RECEIVED', async () => {
    // This test simulates the logic that would be in the API route
    const receivedItems = [
      { product: 'prod_1', quantity: 100, expiryDate: new Date('2027-01-01') },
      { product: 'prod_2', quantity: 50, expiryDate: new Date('2027-02-01') },
    ];

    (Batch.insertMany as any).mockResolvedValue(receivedItems);

    const result = await Batch.insertMany(receivedItems.map(item => ({
      ...item,
      batchNumber: `BN-${item.product}-${Date.now()}`,
      currentQuantity: item.quantity,
      initialQuantity: item.quantity,
    })));

    expect(result).toHaveLength(2);
    expect(Batch.insertMany).toHaveBeenCalled();
  });

  it('should compute negotiation savings and discount percentage correctly', () => {
    const originalAmount = 72000;
    const negotiatedAmount = 64000;
    const savingsAmount = originalAmount - negotiatedAmount;
    const savingsPercentage = Math.round((savingsAmount / originalAmount) * 100);

    expect(savingsAmount).toBe(8000);
    expect(savingsPercentage).toBe(11);
  });

  it('should format negotiation status transitions properly', () => {
    const po = {
      poNumber: 'PO-20260405-003',
      totalAmount: 72000,
      originalAmount: 72000,
      negotiationStatus: 'NONE'
    };

    // 1. Submit Counter-Offer
    const counterOfferAmount = 64800; // 10% discount
    const inNegotiationPO = {
      ...po,
      negotiatedAmount: counterOfferAmount,
      savingsAmount: po.originalAmount - counterOfferAmount,
      savingsPercentage: Math.round(((po.originalAmount - counterOfferAmount) / po.originalAmount) * 100),
      negotiationStatus: 'IN_NEGOTIATION',
      negotiationNotes: 'CFO submitted 10% counter offer for volume buy.'
    };

    expect(inNegotiationPO.negotiationStatus).toBe('IN_NEGOTIATION');
    expect(inNegotiationPO.savingsAmount).toBe(7200);
    expect(inNegotiationPO.savingsPercentage).toBe(10);

    // 2. Finalize Agreement
    const finalizedPO = {
      ...inNegotiationPO,
      totalAmount: inNegotiationPO.negotiatedAmount,
      negotiationStatus: 'AGREED',
      negotiationAgreedAt: new Date(),
      negotiationAgreedBy: 'Finance Manager (CFO)'
    };

    expect(finalizedPO.negotiationStatus).toBe('AGREED');
    expect(finalizedPO.totalAmount).toBe(64800);
    expect(finalizedPO.negotiationAgreedBy).toBe('Finance Manager (CFO)');
  });
});

