import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Quality Control (QC) Hard Gate Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Production Work Order Closure Gate', () => {
    function evaluateWorkOrderClosure(wo: {
      woNumber: string;
      status: string;
      qcStatus?: string;
      qualityChecks?: { status: string }[];
    }, options?: { overrideQcGate?: boolean; userRole?: string; overrideReason?: string }) {
      const failedChecks = (wo.qualityChecks || []).filter(q => q.status === 'FAILED');
      const pendingChecks = (wo.qualityChecks || []).filter(q => q.status === 'PENDING');

      const isFailed = failedChecks.length > 0 || wo.qcStatus === 'FAILED';
      const isPending = pendingChecks.length > 0 || wo.qcStatus === 'PENDING';

      if (options?.overrideQcGate) {
        if (!['ADMIN', 'QUALITY_INSPECTOR'].includes(options.userRole || '')) {
          return { allowed: false, status: 403, error: 'Forbidden: Only Quality Inspector or Super Admin can override QC Gate' };
        }
        return { allowed: true, status: 200, closed: true, overridden: true };
      }

      if (isFailed) {
        return {
          allowed: false,
          status: 422,
          reason: 'QC_FAILED',
          error: `QC Hard Gate Blocked: Work Order ${wo.woNumber} has FAILED Quality Check(s). Production cannot close this order until defects are resolved.`
        };
      }

      if (isPending) {
        return {
          allowed: false,
          status: 422,
          reason: 'QC_PENDING',
          error: `QC Hard Gate Blocked: Work Order ${wo.woNumber} has mandatory Quality Checks that are still PENDING sign-off.`
        };
      }

      return { allowed: true, status: 200, closed: true };
    }

    it('blocks closure of Work Order with FAILED inspection', () => {
      const wo = {
        woNumber: 'WO-BIK-2026-002',
        status: 'IN_PROGRESS',
        qcStatus: 'FAILED',
        qualityChecks: [{ status: 'FAILED' }]
      };
      const res = evaluateWorkOrderClosure(wo);
      expect(res.allowed).toBe(false);
      expect(res.status).toBe(422);
      expect(res.reason).toBe('QC_FAILED');
      expect(res.error).toContain('FAILED Quality Check');
    });

    it('blocks closure of Work Order with PENDING mandatory QC inspection', () => {
      const wo = {
        woNumber: 'WO-BIK-2026-001',
        status: 'IN_PROGRESS',
        qcStatus: 'PENDING',
        qualityChecks: [{ status: 'PENDING' }]
      };
      const res = evaluateWorkOrderClosure(wo);
      expect(res.allowed).toBe(false);
      expect(res.status).toBe(422);
      expect(res.reason).toBe('QC_PENDING');
      expect(res.error).toContain('PENDING sign-off');
    });

    it('allows closure of Work Order when all QC inspections have PASSED', () => {
      const wo = {
        woNumber: 'WO-BIK-2026-004',
        status: 'IN_PROGRESS',
        qcStatus: 'PASSED',
        qualityChecks: [{ status: 'PASSED' }]
      };
      const res = evaluateWorkOrderClosure(wo);
      expect(res.allowed).toBe(true);
      expect(res.status).toBe(200);
      expect(res.closed).toBe(true);
    });

    it('permits authorized Quality Inspector or Super Admin to override gate with audit note', () => {
      const wo = {
        woNumber: 'WO-BIK-2026-002',
        status: 'IN_PROGRESS',
        qcStatus: 'FAILED'
      };
      const inspectorOverride = evaluateWorkOrderClosure(wo, {
        overrideQcGate: true,
        userRole: 'QUALITY_INSPECTOR',
        overrideReason: 'Concession granted per engineering approval'
      });
      expect(inspectorOverride.allowed).toBe(true);
      expect(inspectorOverride.overridden).toBe(true);

      const adminOverride = evaluateWorkOrderClosure(wo, {
        overrideQcGate: true,
        userRole: 'ADMIN',
        overrideReason: 'Executive sign-off'
      });
      expect(adminOverride.allowed).toBe(true);
    });

    it('denies non-quality roles from overriding a QC gate block', () => {
      const wo = {
        woNumber: 'WO-BIK-2026-002',
        status: 'IN_PROGRESS',
        qcStatus: 'FAILED'
      };
      const unauthorizedOverride = evaluateWorkOrderClosure(wo, {
        overrideQcGate: true,
        userRole: 'PRODUCTION_MANAGER',
        overrideReason: 'Rush deadline'
      });
      expect(unauthorizedOverride.allowed).toBe(false);
      expect(unauthorizedOverride.status).toBe(403);
    });
  });

  describe('2. Inventory FEFO Stock Allocation Gate', () => {
    function filterEligibleBatches(batches: Array<{
      batchNumber: string;
      expiryDate: Date;
      currentQuantity: number;
      allocatedQuantity: number;
      qualityStatus?: string;
    }>) {
      const now = new Date();
      return batches
        .filter(b => b.expiryDate > now)
        // Hard Gate: Exclude REJECTED, ON_HOLD, PENDING_QC
        .filter(b => !['REJECTED', 'ON_HOLD', 'PENDING_QC'].includes(b.qualityStatus || ''))
        .filter(b => (b.currentQuantity - b.allocatedQuantity) > 0)
        .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());
    }

    it('strictly excludes quarantined and rejected batches from stock allocation', () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const testBatches = [
        { batchNumber: 'BN-01', expiryDate: futureDate, currentQuantity: 100, allocatedQuantity: 0, qualityStatus: 'REJECTED' },
        { batchNumber: 'BN-02', expiryDate: futureDate, currentQuantity: 100, allocatedQuantity: 0, qualityStatus: 'ON_HOLD' },
        { batchNumber: 'BN-03', expiryDate: futureDate, currentQuantity: 100, allocatedQuantity: 0, qualityStatus: 'PENDING_QC' },
        { batchNumber: 'BN-04', expiryDate: futureDate, currentQuantity: 100, allocatedQuantity: 0, qualityStatus: 'APPROVED' }
      ];

      const eligible = filterEligibleBatches(testBatches);
      expect(eligible).toHaveLength(1);
      expect(eligible[0].batchNumber).toBe('BN-04');
    });
  });

  describe('3. Warehouse Shipping & Dispatch Gate', () => {
    function evaluateOrderDispatch(order: {
      orderNumber: string;
      allocations: Array<{
        batch: { batchNumber: string; qualityStatus?: string };
        quantity: number;
      }>;
    }, options?: { overrideQcGate?: boolean; userRole?: string }) {
      const quarantined = order.allocations.filter(a =>
        ['REJECTED', 'ON_HOLD', 'PENDING_QC'].includes(a.batch?.qualityStatus || '')
      );

      if (quarantined.length > 0 && !options?.overrideQcGate) {
        return {
          allowed: false,
          status: 422,
          reason: 'BATCH_QUARANTINED',
          error: `QC Dispatch Hard Gate Blocked: Cannot ship Order ${order.orderNumber}. Allocated batch(es) are QUARANTINED or REJECTED by Quality Control.`
        };
      }

      if (options?.overrideQcGate && !['ADMIN', 'QUALITY_INSPECTOR'].includes(options.userRole || '')) {
        return { allowed: false, status: 403, error: 'Forbidden' };
      }

      return { allowed: true, status: 200, shipped: true };
    }

    it('hard-blocks order dispatch when an allocated batch is QUARANTINED (ON_HOLD)', () => {
      const order = {
        orderNumber: 'ORD-20260405-002',
        allocations: [
          { batch: { batchNumber: 'BAT-MTB-202603-02', qualityStatus: 'ON_HOLD' }, quantity: 20 },
          { batch: { batchNumber: 'BAT-ELE-202603-03', qualityStatus: 'APPROVED' }, quantity: 10 }
        ]
      };

      const result = evaluateOrderDispatch(order);
      expect(result.allowed).toBe(false);
      expect(result.status).toBe(422);
      expect(result.reason).toBe('BATCH_QUARANTINED');
      expect(result.error).toContain('QUARANTINED or REJECTED');
    });

    it('hard-blocks order dispatch when an allocated batch is REJECTED', () => {
      const order = {
        orderNumber: 'ORD-20260405-009',
        allocations: [
          { batch: { batchNumber: 'BAT-BAD-01', qualityStatus: 'REJECTED' }, quantity: 5 }
        ]
      };

      const result = evaluateOrderDispatch(order);
      expect(result.allowed).toBe(false);
      expect(result.status).toBe(422);
    });

    it('allows warehouse dispatch when all allocated batches are QC APPROVED', () => {
      const order = {
        orderNumber: 'ORD-20260405-001',
        allocations: [
          { batch: { batchNumber: 'BAT-BIK-202603-01', qualityStatus: 'APPROVED' }, quantity: 50 }
        ]
      };

      const result = evaluateOrderDispatch(order);
      expect(result.allowed).toBe(true);
      expect(result.status).toBe(200);
      expect(result.shipped).toBe(true);
    });
  });

  describe('4. Quality Status Synchronization', () => {
    it('propagates inspection failure into batch rejection and work order quarantine', () => {
      const check = {
        checkNumber: 'QC-20260408-001',
        status: 'FAILED',
        batchId: 'bn-123',
        workOrderId: 'wo-456'
      };

      const batchUpdate = {
        qualityStatus: check.status === 'PASSED' ? 'APPROVED' : 'REJECTED'
      };
      const workOrderUpdate = {
        qcStatus: check.status === 'PASSED' ? 'PASSED' : 'FAILED',
        qcGatePassed: check.status === 'PASSED',
        status: check.status === 'PASSED' ? 'IN_PROGRESS' : 'ON_HOLD'
      };

      expect(batchUpdate.qualityStatus).toBe('REJECTED');
      expect(workOrderUpdate.qcStatus).toBe('FAILED');
      expect(workOrderUpdate.qcGatePassed).toBe(false);
      expect(workOrderUpdate.status).toBe('ON_HOLD');
    });

    it('propagates inspection clearance into batch approval and work order gate release', () => {
      const check = {
        checkNumber: 'QC-20260408-002',
        status: 'PASSED',
        batchId: 'bn-123',
        workOrderId: 'wo-456'
      };

      const batchUpdate = {
        qualityStatus: check.status === 'PASSED' ? 'APPROVED' : 'REJECTED'
      };
      const workOrderUpdate = {
        qcStatus: check.status === 'PASSED' ? 'PASSED' : 'FAILED',
        qcGatePassed: check.status === 'PASSED'
      };

      expect(batchUpdate.qualityStatus).toBe('APPROVED');
      expect(workOrderUpdate.qcStatus).toBe('PASSED');
      expect(workOrderUpdate.qcGatePassed).toBe(true);
    });
  });
});
