import { canOpen } from '@/components/layout/navigation';

// The module menu in the app bar. Each module opens one drop-down; a node with children is a heading inside it.
// Documents are listed in the order the work happens. `?tab=` opens a screen on one of its tabs.
// Items a role may not open are hidden (the shell refuses them too, and the API enforces the real permission).

export interface MenuNode { label: string; href?: string; children?: MenuNode[]; sep?: true; public?: true }

const sep: MenuNode = { label: '', sep: true };

export const MENU: MenuNode[] = [
  {
    label: 'Masters', children: [
      { label: 'Customers', href: '/dashboard/dispatch?tab=CUSTOMERS' },
      { label: 'Vendors', href: '/dashboard/suppliers' },
      { label: 'Items', href: '/dashboard/masters/items' },
      { label: 'Item List & Categories', href: '/dashboard/products' },
      { label: 'HSN / SAC Codes', href: '/dashboard/masters/hsn' },
      { label: 'Bills of Material', href: '/dashboard/masters/bom' },
      sep,
      { label: 'Approved Vendor List', href: '/dashboard/source-lists' },
      { label: 'Storage Locations', href: '/dashboard/storage-locations' },
      { label: 'Machines', href: '/dashboard/oee' },
      { label: 'Quality Standards', href: '/dashboard/quality' },
      { label: 'Employees', href: '/dashboard/labour?tab=WORKFORCE' },
      { label: 'Company Profile', href: '/dashboard/dispatch?tab=COMPANY' },
    ],
  },
  {
    label: 'Sales', children: [
      { label: 'Enquiries', href: '/dashboard/sales' },
      { label: 'Quotations', href: '/dashboard/transactions/quotation' },
      { label: 'Quotation List & Loss Analysis', href: '/dashboard/crm?tab=QUOTES' },
      { label: 'Follow-ups', href: '/dashboard/crm?tab=FOLLOW' },
      { label: 'Sales Orders', href: '/dashboard/transactions/sales-order' },
      { label: 'Order Desk (fulfilment)', href: '/dashboard/order-desk' },
      sep,
      { label: 'Proforma Invoices', href: '/dashboard/dispatch?tab=PI' },
      { label: 'Pick Lists', href: '/dashboard/dispatch?tab=PICK' },
      { label: 'Delivery Challans', href: '/dashboard/dispatch?tab=DC' },
      { label: 'Tax Invoices', href: '/dashboard/dispatch?tab=INV' },
      sep,
      { label: 'Exports & Shipping', href: '/dashboard/export-import' },
      { label: 'Warehouse Orders (old)', href: '/dashboard/orders' },
    ],
  },
  {
    label: 'Purchase', children: [
      { label: 'Purchase Indents', href: '/dashboard/procurement?tab=INDENTS' },
      { label: 'Requests for Quotation', href: '/dashboard/procurement?tab=RFQ' },
      { label: 'Purchase Orders', href: '/dashboard/transactions/purchase-order' },
      { label: 'Goods Receipts (GRN)', href: '/dashboard/transactions/grn' },
      { label: 'Vendor Bills', href: '/dashboard/vendor-bills' },
      sep,
      { label: 'Returns to Vendor', href: '/dashboard/grn?tab=RTV' },
      { label: 'Import Bills of Entry', href: '/dashboard/bill-of-entry' },
    ],
  },
  {
    label: 'Production', children: [
      { label: 'Work Orders', href: '/dashboard/production' },
      { label: 'Material Requests', href: '/dashboard/procurement?tab=MRN' },
      { label: 'Shop Floor (WIP)', href: '/dashboard/production/wip' },
      { label: 'Quality Checks', href: '/dashboard/quality' },
      { label: 'Machine Runs & OEE', href: '/dashboard/oee' },
      {
        label: 'Job Work', children: [
          { label: 'Sent to Job Worker', href: '/dashboard/jobwork?tab=OUT' },
          { label: 'Received for Job Work', href: '/dashboard/jobwork?tab=IN' },
          { label: 'ITC-04', href: '/dashboard/jobwork?tab=ITC' },
        ],
      },
    ],
  },
  {
    label: 'Inventory', children: [
      { label: 'Stock by Item', href: '/dashboard/inventory/items' },
      { label: 'Stock & Batches', href: '/dashboard/inventory' },
      { label: 'Labels & Barcodes', href: '/dashboard/labels' },
    ],
  },
  {
    label: 'Accounts', children: [
      { label: 'Vouchers', href: '/dashboard/vouchers' },
      { label: 'Vendor Payments', href: '/dashboard/vendor-bills?tab=PAYABLES' },
      { label: 'Fixed Assets', href: '/dashboard/finance?tab=FIXED_ASSETS' },
      sep,
      { label: 'Ledgers', href: '/dashboard/finance?tab=GL_ACCOUNTS' },
      { label: 'Receivables Ageing', href: '/dashboard/finance?tab=AR_AGING' },
      { label: 'Payables', href: '/dashboard/vendor-bills?tab=PAYABLES' },
      { label: 'Financial Statements', href: '/dashboard/finance?tab=STATEMENTS' },
      { label: 'Trial Balance, P&L, Balance Sheet', href: '/dashboard/accounting-reports' },
      { label: 'Tally Export', href: '/dashboard/tally' },
    ],
  },
  {
    label: 'GST', children: [
      { label: 'Returns', href: '/dashboard/gst?tab=RETURNS' },
      { label: 'e-Invoice & e-Way Bill', href: '/dashboard/gst?tab=E_INVOICING' },
      { label: 'Input Tax Credit', href: '/dashboard/gst?tab=ITC_MANAGEMENT' },
    ],
  },
  {
    label: 'Planning', children: [
      { label: 'Material Planning (MRP)', href: '/dashboard/mrp?tab=REQUIREMENTS' },
      { label: 'MRP Planner', href: '/dashboard/mrp?tab=PLANNER' },
      { label: 'MRP History', href: '/dashboard/mrp?tab=HISTORY' },
      sep,
      { label: 'Customer Projects', href: '/dashboard/projects' },
      { label: 'Supply Chain', href: '/dashboard/supply-chain' },
    ],
  },
  {
    label: 'People', children: [
      { label: 'Attendance', href: '/dashboard/labour?tab=ATTENDANCE' },
      { label: 'Payroll', href: '/dashboard/labour?tab=PAYROLL' },
      { label: 'Labour Jobs', href: '/dashboard/labour?tab=JOBS' },
    ],
  },
  {
    label: 'Reports', children: [
      { label: 'Executive Dashboard', href: '/dashboard/executive' },
      { label: 'Management Reports', href: '/dashboard/reports' },
      { label: 'Report Builder', href: '/dashboard/bi' },
    ],
  },
  {
    label: 'Admin', children: [
      { label: 'Approvals Inbox', href: '/dashboard/approval-matrix' },
      { label: 'Approval Rules', href: '/dashboard/approvals' },
      { label: 'Period Lock', href: '/dashboard/period-lock' },
      { label: 'Notifications', href: '/dashboard/notifications' },
      { label: 'Audit Trail', href: '/dashboard/audit' },
    ],
  },
];

const base = (href: string) => href.split('?')[0];

/** The menu with only what the role may open; empty modules and doubled separators are dropped. */
export function menuFor(role: string, nodes: MenuNode[] = MENU): MenuNode[] {
  const out: MenuNode[] = [];
  for (const n of nodes) {
    if (n.sep) { if (out.length && !out[out.length - 1].sep) out.push(n); continue; }
    if (n.children) {
      const children = menuFor(role, n.children);
      if (children.length) out.push({ ...n, children });
    } else if (n.href && (n.public || canOpen(role, base(n.href)))) out.push(n);
  }
  while (out.length && out[out.length - 1].sep) out.pop();
  return out;
}

/** Every leaf, flattened, with the module it sits in. */
export function leaves(nodes: MenuNode[], trail: string[] = []): { label: string; href: string; module: string }[] {
  return nodes.flatMap(n => n.children ? leaves(n.children, [...trail, n.label]) : n.href ? [{ label: n.label, href: n.href, module: trail[0] || '' }] : []);
}

/** The menu leaf for a URL: an exact match (with its tab) wins, then the leaf for the same screen. */
export function leafFor(nodes: MenuNode[], pathname: string, search: string) {
  const all = leaves(nodes);
  const tab = new URLSearchParams(search).get('tab');
  const full = pathname + (tab ? `?tab=${tab}` : '');
  return all.find(l => l.href === full) || all.find(l => base(l.href) === pathname) || null;
}

/** Favourites a new user starts with (only those the role may open are shown). */
export const DEFAULT_FAVOURITES = [
  { label: 'Purchase Orders', href: '/dashboard/transactions/purchase-order' },
  { label: 'Goods Receipts (GRN)', href: '/dashboard/transactions/grn' },
  { label: 'Sales Orders', href: '/dashboard/transactions/sales-order' },
  { label: 'Delivery Challans', href: '/dashboard/dispatch?tab=DC' },
  { label: 'Items', href: '/dashboard/masters/items' },
  { label: 'Vendors', href: '/dashboard/suppliers' },
  { label: 'Stock & Batches', href: '/dashboard/inventory' },
];

/** The three business flows shown on the start page, step by step. */
export const FLOWS: { title: string; steps: { label: string; href: string }[] }[] = [
  {
    title: 'Procure to Pay', steps: [
      { label: 'Purchase Indent', href: '/dashboard/procurement?tab=INDENTS' },
      { label: 'Request for Quotation', href: '/dashboard/procurement?tab=RFQ' },
      { label: 'Purchase Order', href: '/dashboard/transactions/purchase-order' },
      { label: 'Goods Receipt', href: '/dashboard/transactions/grn' },
      { label: 'Vendor Bill', href: '/dashboard/vendor-bills' },
      { label: 'Payment', href: '/dashboard/vendor-bills?tab=PAYABLES' },
    ],
  },
  {
    title: 'Order to Cash', steps: [
      { label: 'Enquiry', href: '/dashboard/sales' },
      { label: 'Quotation', href: '/dashboard/transactions/quotation' },
      { label: 'Sales Order', href: '/dashboard/transactions/sales-order' },
      { label: 'Pick List', href: '/dashboard/dispatch?tab=PICK' },
      { label: 'Delivery Challan', href: '/dashboard/dispatch?tab=DC' },
      { label: 'Tax Invoice', href: '/dashboard/dispatch?tab=INV' },
      { label: 'Receipt', href: '/dashboard/vouchers' },
    ],
  },
  {
    title: 'Plan to Produce', steps: [
      { label: 'MRP', href: '/dashboard/mrp?tab=REQUIREMENTS' },
      { label: 'Work Order', href: '/dashboard/production' },
      { label: 'Material Request', href: '/dashboard/procurement?tab=MRN' },
      { label: 'Shop Floor (WIP)', href: '/dashboard/production/wip' },
      { label: 'Quality Check', href: '/dashboard/quality' },
      { label: 'Finished Stock', href: '/dashboard/inventory' },
    ],
  },
];
