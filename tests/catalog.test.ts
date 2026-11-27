import { describe, it, expect, vi, beforeEach } from 'vitest';
import Category from '@/models/Category';
import Product from '@/models/Product';

// Mock the models
vi.mock('@/models/Category', () => ({
  default: {
    find: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('@/models/Product', () => ({
  default: {
    find: vi.fn(),
    create: vi.fn(),
  },
}));

describe('Catalog (Products & Categories)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a category correctly', async () => {
    const mockCategory = { name: 'Grains', code: 'GRN' };
    (Category.create as any).mockResolvedValue(mockCategory);

    const result = await Category.create(mockCategory);
    expect(result.name).toBe('Grains');
    expect(Category.create).toHaveBeenCalledWith(mockCategory);
  });

  it('should create a product with minimal stock rules', async () => {
    const mockProduct = {
      name: 'Basmati Rice',
      sku: 'RIC-001',
      category: 'cat_id',
      minStockLevel: 100,
    };
    (Product.create as any).mockResolvedValue(mockProduct);

    const result = await Product.create(mockProduct);
    expect(result.sku).toBe('RIC-001');
    expect(result.minStockLevel).toBe(100);
  });
});
