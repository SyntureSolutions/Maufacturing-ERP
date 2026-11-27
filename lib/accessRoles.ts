// Who may read finance data. Anyone who can post it, approve it, or the read-only Executive Viewer.
export const FINANCE_VIEW_ROLES = ['ADMIN', 'MANAGER', 'FINANCE_MANAGER', 'VIEWER'];

export const canViewFinance = (role?: string) => !!role && FINANCE_VIEW_ROLES.includes(role);

// Invoices are also needed by the people who ship and sell, but not by everyone: finance viewers plus Sales, Supply Chain and warehouse Staff.
export const INVOICE_VIEW_ROLES = [...FINANCE_VIEW_ROLES, 'SALES', 'SUPPLY_CHAIN_MANAGER', 'STAFF'];

export const canViewInvoices = (role?: string) => !!role && INVOICE_VIEW_ROLES.includes(role);

// Customer master data and the company profile (bank details) are used by selling, shipping, finance and job-work screens.
export const PARTY_VIEW_ROLES = [...INVOICE_VIEW_ROLES, 'PRODUCTION_MANAGER'];

export const canViewParties = (role?: string) => !!role && PARTY_VIEW_ROLES.includes(role);
