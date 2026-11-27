import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as financeInvoicePOST } from '@/app/api/finance/invoices/route';
import { POST as salesProformaPOST } from '@/app/api/sales/proforma/route';
import { memorySalesOrders } from '@/lib/salesStore';
import * as authModule from '@/lib/auth';

describe('Separation of Quote vs. Tax Invoice Compliance', () => {
  // This suite runs without a database and relies on the sample-data fallback, which is opt-in
  beforeAll(() => { process.env.DEMO_MODE = 'true'; });
  afterAll(() => { delete process.env.DEMO_MODE; });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. RBAC Gate: Statutory Tax Invoicing Centralization', () => {
    it('strictly blocks SALES role from generating legal GST Tax Invoices (403 Forbidden)', async () => {
      // Mock authenticated session as SALES role
      vi.spyOn(authModule, 'verifyAuth').mockResolvedValue({
        id: 'u-sales-1',
        name: 'Alex Rivera',
        email: 'sales@inventorypro.com',
        role: 'SALES',
      } as any);

      const request = new NextRequest('http://localhost:3000/api/finance/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'SALES',
          customerName: 'Direct Client',
          totalAmount: 250000,
        }),
      });

      const response = await financeInvoicePOST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Forbidden: Sales role cannot issue legal GST Tax Invoices');
    });

    it('blocks WAREHOUSE / PRODUCTION staff from generating GST Tax Invoices (403 Forbidden)', async () => {
      vi.spyOn(authModule, 'verifyAuth').mockResolvedValue({
        id: 'u-prod-1',
        name: 'Marcus Vance',
        email: 'production@inventorypro.com',
        role: 'PRODUCTION',
      } as any);

      const request = new NextRequest('http://localhost:3000/api/finance/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'SALES',
          customerName: 'Direct Client',
          totalAmount: 180000,
        }),
      });

      const response = await financeInvoicePOST(request);
      expect(response.status).toBe(403);
    });

    it('permits FINANCE_MANAGER to issue statutory GST Tax Invoices (201 Created)', async () => {
      vi.spyOn(authModule, 'verifyAuth').mockResolvedValue({
        id: 'u-fin-1',
        name: 'Elena Rostova',
        email: 'finance@inventorypro.com',
        role: 'FINANCE_MANAGER',
      } as any);

      const request = new NextRequest('http://localhost:3000/api/finance/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'SALES',
          customerName: 'ProBike Wholesale Chain',
          totalAmount: 555000,
          subTotal: 470339,
          totalCGST: 42330,
          totalSGST: 42330,
          hsnCode: '87120010',
        }),
      });

      const response = await financeInvoicePOST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.invoiceNumber).toMatch(/^INV-2026-\d+/);
      expect(data.issuedByRole).toBe('FINANCE_MANAGER');
    });
  });

  describe('2. Sales Department: Commercial Pro-Forma Invoice Generation', () => {
    it('allows SALES to generate a non-fiscal Pro-Forma Invoice for an order', async () => {
      vi.spyOn(authModule, 'verifyAuth').mockResolvedValue({
        id: 'u-sales-1',
        name: 'Alex Rivera',
        email: 'sales@inventorypro.com',
        role: 'SALES',
      } as any);

      const request = new NextRequest('http://localhost:3000/api/sales/proforma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'GENERATE_PROFORMA',
          salesOrderId: 'so-202',
        }),
      });

      const response = await salesProformaPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.proformaNumber).toMatch(/^PI-2026-\d+/);
      expect(data.watermark).toBe('PRO-FORMA INVOICE (NOT A TAX INVOICE)');

      // Verify that the order in memory store received the proforma number
      const order = memorySalesOrders.find(o => o._id === 'so-202');
      expect(order?.proformaNumber).toBe(data.proformaNumber);
    });

    it('allows SALES to submit a billing request to Finance Central Queue', async () => {
      vi.spyOn(authModule, 'verifyAuth').mockResolvedValue({
        id: 'u-sales-1',
        name: 'Alex Rivera',
        email: 'sales@inventorypro.com',
        role: 'SALES',
      } as any);

      const request = new NextRequest('http://localhost:3000/api/sales/proforma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REQUEST_TAX_INVOICE',
          salesOrderId: 'so-202',
        }),
      });

      const response = await salesProformaPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('Finance Central Billing Queue');

      // Order should now have taxInvoiceStatus: 'REQUESTED'
      const order = memorySalesOrders.find(o => o._id === 'so-202');
      expect(order?.taxInvoiceStatus).toBe('REQUESTED');
    });
  });

  describe('3. Finance Fulfillment: Converting Sales Order to Official GST Tax Invoice', () => {
    it('converts a requested sales order into an issued Tax Invoice and updates order status to INVOICED', async () => {
      vi.spyOn(authModule, 'verifyAuth').mockResolvedValue({
        id: 'u-fin-1',
        name: 'Elena Rostova',
        email: 'finance@inventorypro.com',
        role: 'FINANCE_MANAGER',
      } as any);

      const request = new NextRequest('http://localhost:3000/api/finance/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'SALES',
          salesOrderId: 'so-202',
          soNumber: 'SO-2026-002',
          proformaRef: 'PI-2026-090',
          customerName: 'Decathlon Retail India',
          totalAmount: 925000,
          subTotal: 783898,
          totalCGST: 70551,
          totalSGST: 70551,
        }),
      });

      const response = await financeInvoicePOST(request);
      const invoiceData = await response.json();

      expect(response.status).toBe(201);
      expect(invoiceData.invoiceNumber).toMatch(/^INV-2026-\d+/);

      // Verify that the sales order is linked and marked INVOICED
      const updatedOrder = memorySalesOrders.find(o => o._id === 'so-202');
      expect(updatedOrder?.taxInvoiceStatus).toBe('INVOICED');
      expect(updatedOrder?.taxInvoiceNumber).toBe(invoiceData.invoiceNumber);
    });
  });
});
