import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as overridePOST } from '@/app/api/operations/override/route';
import { GET as auditGET } from '@/app/api/audit/route';
import { POST as salesOrderPOST } from '@/app/api/sales-orders/route';
import { POST as purchasePOST } from '@/app/api/purchase/route';
import { PATCH as orderStatusPATCH } from '@/app/api/orders/[id]/route';
import { maskPhone, maskEmail, maskBankAccount, sanitizeForViewer } from '@/lib/pii';
import { logAuditEvent, getAuditLogs } from '@/lib/audit';
import * as authModule from '@/lib/auth';

describe('Governance, Role Boundaries & Audit Trail Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Executive Viewer: Strict Read-Only Gate & PII Masking', () => {
    it('masks personal phone numbers, emails, and bank accounts correctly', () => {
      expect(maskPhone('+91 9876543210')).toBe('+91 9****210');
      expect(maskPhone('9876543210')).toBe('98765****210');
      expect(maskEmail('john.doe@suppliercorp.com')).toBe('j***e@suppliercorp.com');
      expect(maskBankAccount('12345678901234')).toBe('******1234');
    });

    it('sanitizes customer/vendor records for VIEWER role while preserving data for ADMIN/MANAGER', () => {
      const record = {
        name: 'Apex Industrial Parts',
        contactPhone: '+91 9876543210',
        email: 'sales@apexindustrial.com',
        accountNumber: '12345678901234',
        balance: 50000,
      };

      const viewerData = sanitizeForViewer(record, 'VIEWER');
      expect(viewerData.contactPhone).toBe('+91 9****210');
      expect(viewerData.email).toBe('s***s@apexindustrial.com');
      expect(viewerData.accountNumber).toBe('******1234');
      expect(viewerData.balance).toBe(50000); // Business metrics preserved

      const adminData = sanitizeForViewer(record, 'ADMIN');
      expect(adminData.contactPhone).toBe('+91 9876543210');
      expect(adminData.email).toBe('sales@apexindustrial.com');
      expect(adminData.accountNumber).toBe('12345678901234');
    });

    it('blocks VIEWER from creating Sales Orders with 403 Forbidden', async () => {
      vi.spyOn(authModule, 'verifyAuth').mockResolvedValue({
        id: 'u-viewer',
        name: 'Board Observer',
        email: 'viewer@inventorypro.com',
        role: 'VIEWER',
      } as any);

      const req = new NextRequest('http://localhost:3000/api/sales-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: 'Test Corp',
          items: [{ name: 'Part A', quantity: 5, unitPrice: 100 }],
        }),
      });

      const res = await salesOrderPOST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Executive Viewer has read-only access');
    });

    it('blocks VIEWER from creating Purchase Orders with 403 Forbidden', async () => {
      vi.spyOn(authModule, 'verifyAuth').mockResolvedValue({
        id: 'u-viewer',
        name: 'Board Observer',
        email: 'viewer@inventorypro.com',
        role: 'VIEWER',
      } as any);

      const req = new NextRequest('http://localhost:3000/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ item: 'Steel Plates', quantity: 10, unitPrice: 500 }],
        }),
      });

      const res = await purchasePOST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Executive Viewer has read-only access');
    });

    it('blocks VIEWER from modifying order status with 403 Forbidden', async () => {
      vi.spyOn(authModule, 'verifyAuth').mockResolvedValue({
        id: 'u-viewer',
        name: 'Board Observer',
        email: 'viewer@inventorypro.com',
        role: 'VIEWER',
      } as any);

      const req = new NextRequest('http://localhost:3000/api/orders/ord-123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DELIVERED' }),
      });

      const res = await orderStatusPATCH(req, { params: Promise.resolve({ id: 'ord-123' }) });
      expect(res.status).toBe(403);
    });
  });

  describe('2. Operations vs Production Authority Boundaries', () => {
    it('permits Operations Manager (MANAGER) to override deadlock with an audited reason', async () => {
      vi.spyOn(authModule, 'verifyAuth').mockResolvedValue({
        id: 'u-ops-mgr',
        name: 'Elena Rostova',
        email: 'manager@inventorypro.com',
        role: 'MANAGER',
      } as any);

      const req = new NextRequest('http://localhost:3000/api/operations/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource: 'WORK_ORDER',
          resourceId: 'wo-deadlock-99',
          overrideType: 'QC_BYPASS',
          reason: 'Client expedited SLA approved by COO with secondary inspection scheduled.',
        }),
      });

      const res = await overridePOST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('Operations Manager');
      expect(data.record.overrideReason).toContain('Client expedited SLA');
    });

    it('denies Production Manager (PRODUCTION_MANAGER) from executing cross-department overrides (403)', async () => {
      vi.spyOn(authModule, 'verifyAuth').mockResolvedValue({
        id: 'u-prod-mgr',
        name: 'Dave Shopfloor',
        email: 'production@inventorypro.com',
        role: 'PRODUCTION_MANAGER',
      } as any);

      const req = new NextRequest('http://localhost:3000/api/operations/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource: 'WORK_ORDER',
          resourceId: 'wo-deadlock-100',
          overrideType: 'QC_BYPASS',
          reason: 'I want to bypass QC hold on this batch.',
        }),
      });

      const res = await overridePOST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Production Manager cannot execute cross-department overrides');
    });

    it('rejects override requests without a valid, substantive reason (400)', async () => {
      vi.spyOn(authModule, 'verifyAuth').mockResolvedValue({
        id: 'u-ops-mgr',
        name: 'Elena Rostova',
        email: 'manager@inventorypro.com',
        role: 'MANAGER',
      } as any);

      const req = new NextRequest('http://localhost:3000/api/operations/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource: 'WORK_ORDER',
          resourceId: 'wo-deadlock-101',
          overrideType: 'QC_BYPASS',
          reason: 'fast', // too short (< 10 chars)
        }),
      });

      const res = await overridePOST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Override reason must be detailed');
    });
  });

  describe('3. Universal Audit Trail: Immutability & Super Admin Review', () => {
    it('records an audit event and makes it queryable by Super Admin', async () => {
      await logAuditEvent({
        userId: 'u-admin-1',
        userName: 'Vikram Mehta',
        userRole: 'ADMIN',
        action: 'DELETE',
        resource: 'PURCHASE_ORDER',
        resourceId: 'PO-TEST-888',
        resourceName: 'Duplicate Supplier Order',
        details: 'Deleted duplicate supplier order.',
        reason: 'Duplicate requisition created in error',
      });

      vi.spyOn(authModule, 'verifyAuth').mockResolvedValue({
        id: 'u-admin-1',
        name: 'Vikram Mehta',
        email: 'admin@inventorypro.com',
        role: 'ADMIN',
      } as any);

      const req = new NextRequest('http://localhost:3000/api/audit?action=DELETE');
      const res = await auditGET(req);
      expect(res.status).toBe(200);

      const logs = await res.json();
      expect(Array.isArray(logs)).toBe(true);
      const found = logs.find((l: any) => l.resourceId === 'PO-TEST-888');
      expect(found).toBeDefined();
      expect(found.action).toBe('DELETE');
      expect(found.userName).toBe('Vikram Mehta');
      expect(found.reason).toBe('Duplicate requisition created in error');
    });

    it('forbids standard non-admin/manager roles from viewing the full audit trail', async () => {
      vi.spyOn(authModule, 'verifyAuth').mockResolvedValue({
        id: 'u-sales-1',
        name: 'Sales Rep',
        email: 'sales@inventorypro.com',
        role: 'SALES',
      } as any);

      const req = new NextRequest('http://localhost:3000/api/audit');
      const res = await auditGET(req);
      expect(res.status).toBe(403);
    });
  });
});
