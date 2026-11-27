import Product from '@/models/Product';

// What the approver of a sales order sees: each line's price against the product's minimum selling price (MSP)
// and its standard cost (purchase price), so a margin below MSP is approved knowingly.
export const MSP_OVERRIDE_ROLES = ['ADMIN', 'MANAGER'];

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function marginLines(so: any) {
  const ids = (so.items || []).map((i: any) => i.product?._id || i.product);
  const products: any[] = await Product.find({ _id: { $in: ids } }).select('sku name minSellingPrice purchasePrice').lean();
  return (so.items || []).map((i: any) => {
    const p = products.find(x => String(x._id) === String(i.product?._id || i.product));
    const msp = Number(p?.minSellingPrice) > 0 ? Number(p.minSellingPrice) : undefined;
    const cost = Number(p?.purchasePrice) > 0 ? Number(p.purchasePrice) : undefined;
    return {
      lineNo: i.lineNo, sku: p?.sku, name: p?.name, quantity: i.quantity, unitPrice: i.unitPrice,
      minSellingPrice: msp,
      belowMsp: msp !== undefined && i.unitPrice < msp - 1e-9,
      shortfallVsMsp: msp !== undefined ? r2(Math.max(0, msp - i.unitPrice) * i.quantity) : 0,
      marginPercent: cost !== undefined && i.unitPrice > 0 ? r2(((i.unitPrice - cost) / i.unitPrice) * 100) : undefined,
    };
  });
}
