import { NextRequest, NextResponse } from 'next/server';
import { canViewFinance } from '@/lib/accessRoles';
import dbConnect from '@/lib/mongodb';
import Account from '@/models/Account';
import JournalEntry from '@/models/JournalEntry';
import { verifyAuth } from '@/lib/auth';
import { demoMode, demoOrThrow } from '@/lib/demoMode';

const SAMPLE_ACCOUNTS = [
  // ASSETS
  { code: '1010', name: 'Factory HDFC Bank Account', type: 'ASSET', category: 'Cash & Cash Equivalents', balance: 2450000 },
  { code: '1020', name: 'Accounts Receivable (Distributors)', type: 'ASSET', category: 'Current Asset', balance: 1810000 },
  { code: '1030', name: 'Raw Material Component Inventory', type: 'ASSET', category: 'Inventory Asset', balance: 1250000 },
  { code: '1040', name: 'Finished Bicycle Stock Inventory', type: 'ASSET', category: 'Inventory Asset', balance: 890000 },
  { code: '1050', name: 'Manufacturing Machinery & Equipment', type: 'ASSET', category: 'Fixed Asset', balance: 4500000 },
  
  // LIABILITIES
  { code: '2010', name: 'Accounts Payable (Raw Material Vendors)', type: 'LIABILITY', category: 'Current Liability', balance: 750000 },
  { code: '2020', name: 'Output GST Tax Payable (18%)', type: 'LIABILITY', category: 'Tax Liability', balance: 162000 },

  // EQUITY
  { code: '3010', name: "Owner's Capital Stock", type: 'EQUITY', category: 'Equity', balance: 5000000 },
  { code: '3020', name: 'Retained Earnings', type: 'EQUITY', category: 'Equity', balance: 3370000 },

  // REVENUE
  { code: '4010', name: 'B2B Mountain Bike Sales', type: 'REVENUE', category: 'Sales Revenue', balance: 920000 },
  { code: '4020', name: 'B2B E-Bike Sales', type: 'REVENUE', category: 'Sales Revenue', balance: 510000 },
  { code: '4030', name: 'Bicycle Accessories & Parts Sales', type: 'REVENUE', category: 'Sales Revenue', balance: 380000 },

  // EXPENSES
  { code: '5010', name: 'Raw Material Procurement COGS', type: 'EXPENSE', category: 'Cost of Goods Sold', balance: 750000 },
  { code: '5020', name: 'Technician Factory Floor Payroll Wages', type: 'EXPENSE', category: 'Direct Labour', balance: 197000 },
  { code: '5030', name: 'Machinery Straight-Line Depreciation', type: 'EXPENSE', category: 'Depreciation Expense', balance: 75000 },
  { code: '5040', name: 'Factory Utility & Operating Expenses', type: 'EXPENSE', category: 'Overhead', balance: 45000 },
];

const SAMPLE_JOURNAL_ENTRIES = [
  {
    _id: 'je-101',
    entryNumber: 'JE-202604-001',
    date: new Date('2026-04-01').toISOString(),
    description: 'B2B Mountain Bike Sales Invoice #INV-2026-001 Issued to Metro Cycle Distributors',
    reference: 'INV-2026-001',
    referenceType: 'INVOICE',
    lines: [
      { accountName: '1020 - Accounts Receivable (Distributors)', debit: 540000, credit: 0 },
      { accountName: '4010 - B2B Mountain Bike Sales', debit: 0, credit: 540000 }
    ],
    totalDebit: 540000,
    totalCredit: 540000,
    status: 'POSTED'
  },
  {
    _id: 'je-102',
    entryNumber: 'JE-202604-002',
    date: new Date('2026-04-02').toISOString(),
    description: 'Raw Material GRN Receipt from Shimano Component Imports (Bill #BILL-SHI-8801)',
    reference: 'BILL-SHI-8801',
    referenceType: 'GRN_RECEIPT',
    lines: [
      { accountName: '1030 - Raw Material Component Inventory', debit: 480000, credit: 0 },
      { accountName: '2010 - Accounts Payable (Vendors)', debit: 0, credit: 480000 }
    ],
    totalDebit: 480000,
    totalCredit: 480000,
    status: 'POSTED'
  },
  {
    _id: 'je-103',
    entryNumber: 'JE-202604-003',
    date: new Date('2026-04-05').toISOString(),
    description: 'Monthly Technician Floor Payroll Disbursement',
    reference: 'PAY-2026-04',
    referenceType: 'PAYROLL',
    lines: [
      { accountName: '5020 - Technician Factory Floor Payroll Wages', debit: 197000, credit: 0 },
      { accountName: '1010 - Factory HDFC Bank Account', debit: 0, credit: 197000 }
    ],
    totalDebit: 197000,
    totalCredit: 197000,
    status: 'POSTED'
  }
];

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewFinance(user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });

    try {
      await dbConnect();
      const accounts = await Account.find({ isActive: true }).sort({ code: 1 });
      const entries = await JournalEntry.find({}).sort({ date: -1 }).limit(50);
      if (accounts.length > 0 || !demoMode()) return NextResponse.json({ accounts, journalEntries: entries });
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample data only in demo mode
    }

    return NextResponse.json({
      accounts: SAMPLE_ACCOUNTS,
      journalEntries: SAMPLE_JOURNAL_ENTRIES
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: 500 });
  }
}
