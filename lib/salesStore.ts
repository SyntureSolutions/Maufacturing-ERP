export interface ISampleSalesOrder {
  _id: string;
  soNumber: string;
  quotationRef?: string;
  poNumber?: string;
  customerName: string;
  totalAmount: number;
  status: 'DRAFT' | 'APPROVED' | 'IN_FULFILLMENT' | 'FULFILLED' | 'CANCELLED';
  creditCheckPassed: boolean;
  proformaNumber?: string;
  proformaIssuedAt?: string;
  taxInvoiceStatus: 'UNINVOICED' | 'REQUESTED' | 'INVOICED';
  taxInvoiceNumber?: string;
  taxInvoiceId?: string;
  createdAt: string;
  items: {
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    hsnCode?: string;
  }[];
}

export const memorySalesOrders: ISampleSalesOrder[] = [
  {
    _id: 'so-201',
    soNumber: 'SO-2026-001',
    quotationRef: 'QT-2026-104',
    poNumber: 'PO-PB-2026-88',
    customerName: 'ProBike Wholesale Chain',
    totalAmount: 555000,
    status: 'APPROVED',
    creditCheckPassed: true,
    proformaNumber: 'PI-2026-104',
    proformaIssuedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    taxInvoiceStatus: 'REQUESTED', // Billing requested by Sales team
    createdAt: new Date('2026-04-01T10:00:00Z').toISOString(),
    items: [
      { productName: 'Apex Urban Commuter Bicycle', quantity: 30, unitPrice: 18500, totalPrice: 555000, hsnCode: '87120010' }
    ],
  },
  {
    _id: 'so-202',
    soNumber: 'SO-2026-002',
    quotationRef: 'QT-2026-090',
    poNumber: 'PO-DEC-8841',
    customerName: 'Decathlon Retail India',
    totalAmount: 925000,
    status: 'APPROVED',
    creditCheckPassed: true,
    proformaNumber: 'PI-2026-090',
    proformaIssuedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    taxInvoiceStatus: 'UNINVOICED',
    createdAt: new Date('2026-03-29T14:20:00Z').toISOString(),
    items: [
      { productName: 'Apex Urban Commuter Bicycle', quantity: 50, unitPrice: 18500, totalPrice: 925000, hsnCode: '87120010' }
    ],
  },
  {
    _id: 'so-203',
    soNumber: 'SO-2026-003',
    quotationRef: 'QT-2026-085',
    poNumber: 'PO-MW-5512',
    customerName: 'Metro Wheels & Distributors',
    totalAmount: 1120000,
    status: 'IN_FULFILLMENT',
    creditCheckPassed: true,
    proformaNumber: 'PI-2026-085',
    proformaIssuedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    taxInvoiceStatus: 'INVOICED',
    taxInvoiceNumber: 'INV-2026-001',
    taxInvoiceId: 'inv-101',
    createdAt: new Date('2026-03-25T09:10:00Z').toISOString(),
    items: [
      { productName: 'Velocity Trail Mountain Bike 29er', quantity: 20, unitPrice: 32000, totalPrice: 640000, hsnCode: '87120010' },
      { productName: 'E-Glide Electric Hybrid Bike 250W', quantity: 10, unitPrice: 48000, totalPrice: 480000, hsnCode: '87116010' }
    ],
  },
];
