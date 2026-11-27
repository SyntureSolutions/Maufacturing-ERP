import { describe, it, expect } from 'vitest';
import { calculatePOTier } from '@/app/api/purchase/route';

describe('Value-Based Approval Tiering Engine', () => {
  const defaultThresholds = {
    poSupplyChainLimit: 50000,
    poFinanceLimit: 500000,
    discountSalesLimitPercent: 10,
    discountFinanceLimitPercent: 25,
    discountAmountLimit: 50000,
    writeOffFloorLimit: 15000,
    writeOffFinanceLimit: 100000
  };

  describe('Default PO Thresholds', () => {
    it('should assign Tier 1 (Supply Chain) and auto-order for amounts <= ₹50,000', () => {
      const result = calculatePOTier(35000, defaultThresholds);
      expect(result.tier).toBe('TIER_1_SUPPLY_CHAIN');
      expect(result.requiredRole).toBe('SUPPLY_CHAIN_MANAGER');
      expect(result.status).toBe('ORDERED');
    });

    it('should assign Tier 2 (Finance Manager) and require approval for amounts between ₹50,001 and ₹500,000', () => {
      const result = calculatePOTier(150000, defaultThresholds);
      expect(result.tier).toBe('TIER_2_FINANCE');
      expect(result.requiredRole).toBe('FINANCE_MANAGER');
      expect(result.status).toBe('PENDING_APPROVAL');
    });

    it('should assign Tier 3 (Super Admin Executive) for amounts > ₹500,000', () => {
      const result = calculatePOTier(750000, defaultThresholds);
      expect(result.tier).toBe('TIER_3_EXECUTIVE');
      expect(result.requiredRole).toBe('ADMIN');
      expect(result.status).toBe('PENDING_APPROVAL');
    });
  });

  describe('Dynamic Custom Configured Thresholds (Finance Mgr / Admin)', () => {
    const customThresholds = {
      poSupplyChainLimit: 120000, // Supply chain increased to 1.2 Lakh
      poFinanceLimit: 1000000,    // Finance limit increased to 10 Lakh
      discountSalesLimitPercent: 15,
      discountFinanceLimitPercent: 30,
      discountAmountLimit: 100000,
      writeOffFloorLimit: 25000,
      writeOffFinanceLimit: 200000
    };

    it('should respect custom higher Supply Chain limits without code change', () => {
      // Amount is 90,000 which was Tier 2 under defaults, but now Tier 1 under custom
      const result = calculatePOTier(90000, customThresholds);
      expect(result.tier).toBe('TIER_1_SUPPLY_CHAIN');
      expect(result.status).toBe('ORDERED');
    });

    it('should route ₹600,000 to Finance Manager under custom limit (which was Admin under default)', () => {
      const result = calculatePOTier(600000, customThresholds);
      expect(result.tier).toBe('TIER_2_FINANCE');
      expect(result.requiredRole).toBe('FINANCE_MANAGER');
      expect(result.status).toBe('PENDING_APPROVAL');
    });

    it('should route > ₹1,000,000 to Super Admin under custom thresholds', () => {
      const result = calculatePOTier(1500000, customThresholds);
      expect(result.tier).toBe('TIER_3_EXECUTIVE');
      expect(result.requiredRole).toBe('ADMIN');
      expect(result.status).toBe('PENDING_APPROVAL');
    });
  });

  describe('Role-Based Authorization Validation', () => {
    function authorizePOApproval(poAmount: number, userRole: string, thresholds: any) {
      const tierInfo = calculatePOTier(poAmount, thresholds);
      if (tierInfo.requiredRole === 'ADMIN') {
        if (userRole !== 'ADMIN') {
          return { authorized: false, error: 'Requires Super Admin Executive approval' };
        }
      } else if (tierInfo.requiredRole === 'FINANCE_MANAGER') {
        if (!['ADMIN', 'FINANCE_MANAGER'].includes(userRole)) {
          return { authorized: false, error: 'Requires Finance Manager (CFO) sign-off' };
        }
      }
      return { authorized: true, approvedByRole: userRole };
    }

    it('denies Operator or Inventory Clerk from approving Tier 2 or Tier 3 POs', () => {
      const auth = authorizePOApproval(75000, 'INVENTORY_CLERK', defaultThresholds);
      expect(auth.authorized).toBe(false);
      expect(auth.error).toContain('Finance Manager');
    });

    it('permits Finance Manager to approve Tier 2 POs', () => {
      const auth = authorizePOApproval(75000, 'FINANCE_MANAGER', defaultThresholds);
      expect(auth.authorized).toBe(true);
      expect(auth.approvedByRole).toBe('FINANCE_MANAGER');
    });

    it('denies Finance Manager from approving Tier 3 PO (> ₹500,000) that requires Super Admin', () => {
      const auth = authorizePOApproval(650000, 'FINANCE_MANAGER', defaultThresholds);
      expect(auth.authorized).toBe(false);
      expect(auth.error).toContain('Super Admin');
    });

    it('permits Super Admin to approve all tiers', () => {
      const authTier2 = authorizePOApproval(75000, 'ADMIN', defaultThresholds);
      const authTier3 = authorizePOApproval(650000, 'ADMIN', defaultThresholds);
      expect(authTier2.authorized).toBe(true);
      expect(authTier3.authorized).toBe(true);
    });
  });

  describe('Sales Discount & Inventory Write-Off Policy Tiering', () => {
    function evaluateDiscountApproval(discountPct: number, discountAmt: number, thresholds: any) {
      if (discountPct > thresholds.discountFinanceLimitPercent || discountAmt > thresholds.discountAmountLimit) {
        return { tier: 'EXECUTIVE', requiredRole: 'ADMIN' };
      }
      if (discountPct > thresholds.discountSalesLimitPercent) {
        return { tier: 'FINANCE', requiredRole: 'FINANCE_MANAGER' };
      }
      return { tier: 'SALES_REP', requiredRole: 'SALES_REP' };
    }

    function evaluateWriteOffApproval(amount: number, thresholds: any) {
      if (amount > thresholds.writeOffFinanceLimit) {
        return { tier: 'EXECUTIVE', requiredRole: 'ADMIN' };
      }
      if (amount > thresholds.writeOffFloorLimit) {
        return { tier: 'FINANCE', requiredRole: 'FINANCE_MANAGER' };
      }
      return { tier: 'FLOOR', requiredRole: 'QUALITY_MANAGER' };
    }

    it('routes sales discounts accurately according to configured percentage thresholds', () => {
      expect(evaluateDiscountApproval(5, 5000, defaultThresholds).requiredRole).toBe('SALES_REP');
      expect(evaluateDiscountApproval(15, 20000, defaultThresholds).requiredRole).toBe('FINANCE_MANAGER');
      expect(evaluateDiscountApproval(30, 20000, defaultThresholds).requiredRole).toBe('ADMIN');
      // Exceeding amount limit also triggers executive approval
      expect(evaluateDiscountApproval(8, 75000, defaultThresholds).requiredRole).toBe('ADMIN');
    });

    it('routes inventory scrap/write-offs accurately according to configured thresholds', () => {
      expect(evaluateWriteOffApproval(8000, defaultThresholds).requiredRole).toBe('QUALITY_MANAGER');
      expect(evaluateWriteOffApproval(50000, defaultThresholds).requiredRole).toBe('FINANCE_MANAGER');
      expect(evaluateWriteOffApproval(180000, defaultThresholds).requiredRole).toBe('ADMIN');
    });
  });
});
