import dbConnect from '@/lib/mongodb';
import AuditLog, { AuditActionType } from '@/models/AuditLog';
import mongoose from 'mongoose';

export interface AuditEventParams {
  userId?: string;
  userName: string;
  userRole: string;
  action: AuditActionType;
  resource: string;
  resourceId?: string;
  resourceName?: string;
  details: string | Record<string, any>;
  reason?: string;
  ipAddress?: string;
}

export interface InMemoryAuditEntry extends Omit<AuditEventParams, 'details'> {
  _id: string;
  details: string;
  createdAt: string;
  updatedAt: string;
}

// In-memory fallback audit store with realistic seed entries
export const memoryAuditLogs: InMemoryAuditEntry[] = [
  {
    _id: 'audit-001',
    userId: 'u-admin-1',
    userName: 'Super Admin User',
    userRole: 'ADMIN',
    action: 'CREATE',
    resource: 'ApprovalThreshold',
    resourceId: 'thresh-1',
    resourceName: 'Global Tier 1 & Tier 2 PO Thresholds',
    details: 'Configured corporate PO approval limits: Tier 1 (₹100,000) and Tier 2 (₹500,000).',
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  },
  {
    _id: 'audit-002',
    userId: 'u-ops-1',
    userName: 'Operations Manager',
    userRole: 'MANAGER',
    action: 'OVERRIDE',
    resource: 'WorkOrder',
    resourceId: 'WO-2026-004',
    resourceName: 'AeroPro Carbon Road Bike Assembly',
    details: 'Cross-department deadlock override: Expedited shopfloor line allocation ahead of standard queue.',
    reason: 'Emergency VIP distributor rush contract (Decathlon Tier-1 deadline commit). Approved cross-functional override.',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    _id: 'audit-003',
    userId: 'u-fin-1',
    userName: 'Finance Manager (CFO)',
    userRole: 'FINANCE_MANAGER',
    action: 'APPROVE',
    resource: 'Invoice',
    resourceId: 'INV-2026-001',
    resourceName: 'Metro Wheels Wholesale Invoice',
    details: 'Statutory GST Tax Invoice generated and posted to double-entry general ledger.',
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  }
];

/**
 * Universal Audit Logging Helper
 * Writes to MongoDB and maintains in-memory copy for high-availability.
 */
export async function logAuditEvent(params: AuditEventParams) {
  const timestamp = new Date();
  const id = `audit-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const detailsText = typeof params.details === 'object' ? JSON.stringify(params.details) : String(params.details);

  const inMemoryEntry: InMemoryAuditEntry = {
    ...params,
    details: detailsText,
    _id: id,
    createdAt: timestamp.toISOString(),
    updatedAt: timestamp.toISOString(),
  };

  // Add to top of in-memory store
  memoryAuditLogs.unshift(inMemoryEntry);
  if (memoryAuditLogs.length > 500) {
    memoryAuditLogs.pop();
  }

  try {
    await dbConnect();
    const docData: any = {
      userName: params.userName,
      userRole: params.userRole,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      resourceName: params.resourceName,
      details: detailsText,
      reason: params.reason,
      ipAddress: params.ipAddress,
    };

    if (params.userId && mongoose.Types.ObjectId.isValid(params.userId)) {
      docData.user = new mongoose.Types.ObjectId(params.userId);
      docData.userId = params.userId;
    } else if (params.userId) {
      docData.userId = params.userId;
    }

    await AuditLog.create(docData);
  } catch (err) {
    // Graceful fallback to memory store (e.g. Atlas offline or unit testing)
    console.warn('AuditLog database write fallback to memory:', err);
  }

  return inMemoryEntry;
}

/**
 * Fetch Audit Logs with Filtering
 */
export async function getAuditLogs(filter?: {
  action?: string;
  resource?: string;
  userRole?: string;
  limit?: number;
}) {
  const limit = filter?.limit || 100;

  try {
    await dbConnect();
    const query: any = {};
    if (filter?.action && filter.action !== 'ALL') query.action = filter.action;
    if (filter?.resource && filter.resource !== 'ALL') query.resource = filter.resource;
    if (filter?.userRole && filter.userRole !== 'ALL') query.userRole = filter.userRole;

    const docs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    if (docs && docs.length > 0) {
      return docs;
    }
  } catch (e) {
    // Fallback to memory
  }

  let filtered = [...memoryAuditLogs];
  if (filter?.action && filter.action !== 'ALL') {
    filtered = filtered.filter(l => l.action === filter.action);
  }
  if (filter?.resource && filter.resource !== 'ALL') {
    filtered = filtered.filter(l => l.resource === filter.resource);
  }
  if (filter?.userRole && filter.userRole !== 'ALL') {
    filtered = filtered.filter(l => l.userRole === filter.userRole);
  }

  return filtered.slice(0, limit);
}
