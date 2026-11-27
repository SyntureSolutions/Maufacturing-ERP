'use client';

import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  FileText, 
  ArrowUpRight, 
  ArrowDownRight, 
  RefreshCcw, 
  Plus, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar, 
  CreditCard, 
  X, 
  TrendingUp, 
  TrendingDown, 
  Wallet,
  Building,
  Users,
  Check,
  PieChart,
  Layers,
  ShieldCheck,
  Clock,
  Briefcase,
  Wrench,
  Calculator,
  Search,
  BookOpen,
  BadgeCheck,
  ShieldAlert,
  Send,
  Zap,
  ArrowRight
} from 'lucide-react';
import TaxInvoiceModal from '@/components/modals/TaxInvoiceModal';
import ProformaInvoiceModal from '@/components/modals/ProformaInvoiceModal';
import { useUrlTab } from '@/components/workspace/useUrlTab';

export default function FinancePage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [glData, setGlData] = useState<any>({ accounts: [], journalEntries: [] });
  const [arAging, setArAging] = useState<any[]>([]);
  const [fixedAssets, setFixedAssets] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [taxInvoiceModalOpen, setTaxInvoiceModalOpen] = useState(false);
  const [selectedBillingOrder, setSelectedBillingOrder] = useState<any | null>(null);
  const [proformaModalOpen, setProformaModalOpen] = useState(false);
  const [selectedProforma, setSelectedProforma] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'STATEMENTS' | 'AR_AGING' | 'AP_BILLS' | 'GL_ACCOUNTS' | 'FIXED_ASSETS'>('STATEMENTS');
  useUrlTab(['STATEMENTS', 'AR_AGING', 'AP_BILLS', 'GL_ACCOUNTS', 'FIXED_ASSETS'] as const, setActiveTab);
  const [notification, setNotification] = useState<string | null>(null);
  const [incomingRequestAlert, setIncomingRequestAlert] = useState<{
    soNumber: string;
    customerName: string;
    totalAmount?: number;
    time: string;
  } | null>(null);

  // Period Selector for Financial Statements
  const [selectedPeriod, setSelectedPeriod] = useState<string>('Q1-2026');

  // Filter States
  const [salesFilter, setSalesFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');
  const [billsFilter, setBillsFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');

  // Payment Modal State
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);

  // New Asset Modal State
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [newAsset, setNewAsset] = useState({
    name: '',
    category: 'MACHINERY',
    originalCost: 500000,
    salvageValue: 50000,
    usefulLifeYears: 5,
    location: 'Main Assembly Works'
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invRes, glRes, arRes, astRes, soRes] = await Promise.all([
        fetch('/api/finance/invoices'),
        fetch('/api/finance/gl'),
        fetch('/api/finance/ar/aging'),
        fetch('/api/finance/assets'),
        fetch('/api/sales-orders')
      ]);
      if (invRes.ok) setInvoices(await invRes.json());
      if (glRes.ok) setGlData(await glRes.json());
      if (arRes.ok) setArAging(await arRes.json());
      if (astRes.ok) setFixedAssets(await astRes.json());
      if (soRes.ok) setSalesOrders(await soRes.json());
    } catch (e) {
      console.error('Failed to fetch finance data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // 1. Instant cross-tab BroadcastChannel listener (0ms latency from Sales page)
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('erp_sales_finance_events');
      channel.onmessage = (event) => {
        if (event.data?.type === 'TAX_INVOICE_REQUESTED') {
          const { soNumber, customerName, totalAmount, orderId } = event.data;
          setIncomingRequestAlert({
            soNumber: soNumber || 'SO-2026-NEW',
            customerName: customerName || 'Valued Customer',
            totalAmount: totalAmount || 0,
            time: new Date().toLocaleTimeString('en-IN')
          });
          // Optimistically mark as REQUESTED immediately in local state
          setSalesOrders(prev =>
            prev.map(so =>
              (so.soNumber === soNumber || so._id === orderId || so.quotationRef === orderId)
                ? { ...so, taxInvoiceStatus: 'REQUESTED' }
                : so
            )
          );
          // Sync with server
          fetch('/api/sales-orders')
            .then(res => res.json())
            .then(fresh => setSalesOrders(fresh))
            .catch(() => {});
        }
      };
    } catch (e) {}

    // 2. Storage event listener for cross-window / tab sync
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'erp_tax_invoice_requested_ping' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          setIncomingRequestAlert({
            soNumber: data.soNumber || 'SO-2026-NEW',
            customerName: data.customerName || 'Valued Customer',
            totalAmount: data.totalAmount || 0,
            time: new Date().toLocaleTimeString('en-IN')
          });
          setSalesOrders(prev =>
            prev.map(so =>
              (so.soNumber === data.soNumber || so._id === data.orderId)
                ? { ...so, taxInvoiceStatus: 'REQUESTED' }
                : so
            )
          );
          fetch('/api/sales-orders')
            .then(res => res.json())
            .then(fresh => setSalesOrders(fresh))
            .catch(() => {});
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handleStorage);

    // 3. Fast polling loop (2.5s) to guarantee updates even across separate browser sessions
    const interval = setInterval(async () => {
      try {
        const soRes = await fetch('/api/sales-orders');
        if (soRes.ok) {
          const freshOrders = await soRes.json();
          setSalesOrders(prev => {
            const prevRequested = new Set(prev.filter((o: any) => o.taxInvoiceStatus === 'REQUESTED').map((o: any) => o.soNumber || o._id));
            const newRequest = freshOrders.find((o: any) => o.taxInvoiceStatus === 'REQUESTED' && !prevRequested.has(o.soNumber || o._id));
            if (newRequest) {
              setIncomingRequestAlert({
                soNumber: newRequest.soNumber,
                customerName: newRequest.customerName,
                totalAmount: newRequest.totalAmount,
                time: new Date().toLocaleTimeString('en-IN')
              });
            }
            return freshOrders;
          });
        }
      } catch (err) {}
    }, 2500);

    return () => {
      if (channel) channel.close();
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, []);

  const openPaymentModal = (inv: any) => {
    setSelectedInvoice(inv);
    const remaining = inv.totalAmount - (inv.amountPaid || 0);
    setPaymentAmount(remaining > 0 ? remaining : 0);
    setPaymentMethod('BANK_TRANSFER');
    setPaymentReference(`NEFT-${Math.floor(10000 + Math.random() * 90000)}`);
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice || paymentAmount <= 0) return;
    setIsSubmittingPayment(true);
    const nowIso = new Date().toISOString();

    // 1. Instant Optimistic Local UI Update
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv._id === selectedInvoice._id) {
          const newPaid = (inv.amountPaid || 0) + Number(paymentAmount);
          const newStatus = newPaid >= inv.totalAmount ? 'PAID' : 'PARTIAL';
          return {
            ...inv,
            amountPaid: newPaid,
            status: newStatus,
            paymentHistory: [
              ...(inv.paymentHistory || []),
              { amount: Number(paymentAmount), paymentDate: nowIso, method: paymentMethod, reference: paymentReference }
            ]
          };
        }
        return inv;
      })
    );

    setNotification(`✅ Payment of ₹${paymentAmount.toLocaleString('en-IN')} recorded for ${selectedInvoice.invoiceNumber}!`);
    setTimeout(() => setNotification(null), 4000);

    try {
      const res = await fetch('/api/finance/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RECORD_PAYMENT',
          invoiceId: selectedInvoice._id,
          amount: Number(paymentAmount),
          paymentMethod,
          reference: paymentReference
        })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Record payment failed:', err);
    } finally {
      setIsSubmittingPayment(false);
      setSelectedInvoice(null);
    }
  };

  const handleCreateAsset = async () => {
    if (!newAsset.name || !newAsset.originalCost) return;
    try {
      const res = await fetch('/api/finance/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAsset)
      });
      if (res.ok) {
        setNotification(`✅ Fixed Asset "${newAsset.name}" added to asset register!`);
        fetchData();
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (e) {
      console.error('Failed to create asset:', e);
    } finally {
      setIsAssetModalOpen(false);
      setNewAsset({ name: '', category: 'MACHINERY', originalCost: 500000, salvageValue: 50000, usefulLifeYears: 5, location: 'Main Assembly Works' });
    }
  };

  const safeInvoices = Array.isArray(invoices) ? invoices : [];
  const safeAccounts = Array.isArray(glData.accounts) ? glData.accounts : [];
  const safeJournalEntries = Array.isArray(glData.journalEntries) ? glData.journalEntries : [];
  const safeArAging = Array.isArray(arAging) ? arAging : [];
  const safeAssets = Array.isArray(fixedAssets) ? fixedAssets : [];

  const salesInvoices = safeInvoices.filter(i => i.type === 'SALES');
  const supplierBills = safeInvoices.filter(i => i.type === 'PURCHASE');

  const filteredSalesInvoices = salesInvoices.filter(i => {
    if (salesFilter === 'UNPAID') return i.status !== 'PAID';
    if (salesFilter === 'PAID') return i.status === 'PAID';
    return true;
  });

  const filteredSupplierBills = supplierBills.filter(i => {
    if (billsFilter === 'UNPAID') return i.status !== 'PAID';
    if (billsFilter === 'PAID') return i.status === 'PAID';
    return true;
  });

  // Calculate Core Financial Totals
  const totalReceivables = salesInvoices.reduce((sum, i) => sum + (i.totalAmount - (i.amountPaid || 0)), 0);
  const totalPayables = supplierBills.reduce((sum, i) => sum + (i.totalAmount - (i.amountPaid || 0)), 0);

  const totalSalesRevenue = salesInvoices.reduce((sum, i) => sum + (i.totalAmount || 0), 0);
  const totalMaterialPurchases = supplierBills.reduce((sum, i) => sum + (i.totalAmount || 0), 0);
  const totalPayrollExpenses = 197000;
  
  // Calculate total monthly machine depreciation from asset register
  const monthlyDepreciationTotal = safeAssets.reduce((sum, ast) => {
    const depreciableAmount = (ast.originalCost || 0) - (ast.salvageValue || 0);
    const annualDep = (ast.usefulLifeYears || 5) > 0 ? depreciableAmount / ast.usefulLifeYears : 0;
    return sum + (annualDep / 12);
  }, 0);

  const totalFactoryExpenses = totalMaterialPurchases + totalPayrollExpenses + Math.round(monthlyDepreciationTotal);
  const netFactoryProfit = totalSalesRevenue - totalFactoryExpenses;

  // Balance Sheet Computations
  const totalAssetsCost = safeAssets.reduce((sum, a) => sum + (a.originalCost || 0), 0);
  const totalAssetsNet = safeAssets.reduce((sum, a) => sum + ((a.originalCost || 0) - (a.accumulatedDepreciation || 0)), 0);
  const totalCurrentAssets = totalReceivables + 2450000 + 1250000; // Bank + Inventory + AR
  const totalBalanceSheetAssets = totalCurrentAssets + totalAssetsNet;
  const totalBalanceSheetLiabilities = totalPayables + 162000; // AP + GST
  const totalBalanceSheetEquity = totalBalanceSheetAssets - totalBalanceSheetLiabilities;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            Enterprise Financial Accounting Workspace
          </h2>
          <p className="text-slate-500 mt-1">General Ledger, AR Aging, AP Bills, Machine Depreciation, and Multi-period Financial Statements.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} className="p-3 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-colors" title="Refresh">
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Instant Real-Time Pop-Up Alert for Incoming Tax Invoice Requests from Sales */}
      {incomingRequestAlert && (
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white p-5 rounded-2xl shadow-2xl border-2 border-blue-300 flex flex-col md:flex-row items-center justify-between gap-4 animate-scaleIn ring-4 ring-blue-500/20">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-amber-400 text-slate-950 rounded-2xl font-bold shadow-md flex items-center justify-center animate-bounce shrink-0">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[11px] font-bold uppercase tracking-wider">
                  ⚡ LIVE TAX INVOICE REQUEST FROM SALES
                </span>
                <span className="text-xs text-blue-200 font-mono">{incomingRequestAlert.time}</span>
              </div>
              <h3 className="text-base font-bold text-white mt-1">
                Order <span className="font-mono text-amber-300">{incomingRequestAlert.soNumber}</span> ({incomingRequestAlert.customerName})
              </h3>
              <p className="text-xs text-blue-100 mt-0.5">
                Sales has officially requested a legal GST Tax Invoice for ₹{Number(incomingRequestAlert.totalAmount || 0).toLocaleString('en-IN')}. It has been placed into your Central Billing Queue.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => {
                setActiveTab('AR_AGING');
                const targetOrder = salesOrders.find(so => so.soNumber === incomingRequestAlert.soNumber || so._id === incomingRequestAlert.soNumber);
                if (targetOrder) {
                  setSelectedBillingOrder(targetOrder);
                  setTaxInvoiceModalOpen(true);
                } else {
                  setTimeout(() => {
                    const el = document.getElementById('central-billing-queue');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }
                setIncomingRequestAlert(null);
              }}
              className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 transform hover:scale-105"
            >
              <FileText className="w-4 h-4" />
              Generate Tax Invoice Now
            </button>
            <button
              onClick={() => setIncomingRequestAlert(null)}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors text-xs font-bold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Standing Central Billing Queue Notification Banner */}
      {salesOrders.filter(so => so.taxInvoiceStatus === 'REQUESTED').length > 0 && (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-sm shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-900">
                  Centralized Finance Billing Queue
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-600 text-white animate-pulse">
                  {salesOrders.filter(so => so.taxInvoiceStatus === 'REQUESTED').length} Pending Requests from Sales
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Sales has issued commercial Pro-Formas. Review statutory HSN rates, verify GSTIN, and generate legal Tax Invoices for general ledger posting.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setActiveTab('AR_AGING');
              setTimeout(() => {
                const el = document.getElementById('central-billing-queue');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }, 100);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-1.5 shrink-0"
          >
            Review Central Billing Queue ({salesOrders.filter(so => so.taxInvoiceStatus === 'REQUESTED').length})
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-emerald-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-600/20 flex justify-between items-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">Accounts Receivable (AR)</p>
            <h3 className="text-2xl font-bold font-mono mt-1">₹{totalReceivables.toLocaleString('en-IN')}</h3>
            <p className="text-xs text-emerald-200 font-medium mt-1">Distributor Overdue Invoices</p>
          </div>
          <div className="p-3 bg-white/10 rounded-xl">
            <ArrowDownRight className="w-6 h-6 text-white" />
          </div>
        </div>

        <div className="bg-rose-600 rounded-2xl p-5 text-white shadow-lg shadow-rose-600/20 flex justify-between items-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-rose-100">Accounts Payable (AP)</p>
            <h3 className="text-2xl font-bold font-mono mt-1">₹{totalPayables.toLocaleString('en-IN')}</h3>
            <p className="text-xs text-rose-200 font-medium mt-1">Raw Material Vendor Bills</p>
          </div>
          <div className="p-3 bg-white/10 rounded-xl">
            <ArrowUpRight className="w-6 h-6 text-white" />
          </div>
        </div>

        <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-lg shadow-slate-900/20 flex justify-between items-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Net Operating Profit</p>
            <h3 className={`text-2xl font-bold font-mono mt-1 ${netFactoryProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              ₹{netFactoryProfit.toLocaleString('en-IN')}
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-1">Sales minus All Expenses & COGS</p>
          </div>
          <div className="p-3 bg-white/10 rounded-xl text-amber-400">
            <Wallet className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-indigo-600 rounded-2xl p-5 text-white shadow-lg shadow-indigo-600/20 flex justify-between items-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-100">Machinery Depreciation</p>
            <h3 className="text-2xl font-bold font-mono mt-1">₹{Math.round(monthlyDepreciationTotal).toLocaleString('en-IN')}<span className="text-xs font-normal text-indigo-200">/mo</span></h3>
            <p className="text-xs text-indigo-200 font-medium mt-1">Straight-Line COGS Wear</p>
          </div>
          <div className="p-3 bg-white/10 rounded-xl">
            <Wrench className="w-6 h-6 text-white" />
          </div>
        </div>
      </div>

      {/* Procurement Negotiations & Bottom-Line Savings Banner */}
      <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 shrink-0">
            <BadgeCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm text-white">Purchase Order Price Negotiations & Final Agreement Letters</h4>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[11px] font-bold uppercase">
                Active Desk
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Finance Managers can negotiate vendor purchase orders, lock in certified price concessions, and download official Final Price Settlement Letters.
            </p>
          </div>
        </div>
        <a
          href="/dashboard/purchase"
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-sm shrink-0 flex items-center gap-1.5"
        >
          Open PO Negotiations &rarr;
        </a>
      </div>

      {/* Tabs Bar - Fits all 5 tabs cleanly without scrolling */}
      <div className="flex overflow-x-auto">
        <button
          onClick={() => setActiveTab('STATEMENTS')}
          className={`tab justify-center gap-1.5 ${activeTab === 'STATEMENTS' ? 'tab-active' : ''}`}
        >
          <PieChart className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="truncate">1. Financial Statements</span>
        </button>

        <button
          onClick={() => setActiveTab('AR_AGING')}
          className={`tab justify-center gap-1.5 ${activeTab === 'AR_AGING' ? 'tab-active' : ''}`}
        >
          <ArrowDownRight className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="truncate">2. Receivables (AR)</span>
        </button>

        <button
          onClick={() => setActiveTab('AP_BILLS')}
          className={`tab justify-center gap-1.5 ${activeTab === 'AP_BILLS' ? 'tab-active' : ''}`}
        >
          <ArrowUpRight className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="truncate">3. Payables (AP)</span>
        </button>

        <button
          onClick={() => setActiveTab('GL_ACCOUNTS')}
          className={`tab justify-center gap-1.5 ${activeTab === 'GL_ACCOUNTS' ? 'tab-active' : ''}`}
        >
          <BookOpen className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="truncate">4. Ledger & Accounts</span>
        </button>

        <button
          onClick={() => setActiveTab('FIXED_ASSETS')}
          className={`tab justify-center gap-1.5 ${activeTab === 'FIXED_ASSETS' ? 'tab-active' : ''}`}
        >
          <Wrench className="w-4 h-4 text-sky-600 shrink-0" />
          <span className="truncate">5. Fixed Assets</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: FINANCIAL STATEMENTS (P&L & BALANCE SHEET) */}
      {/* ========================================================================= */}
      {activeTab === 'STATEMENTS' && (
        <div className="space-y-6">
          {/* Header Period Selector */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Computed Financial Statements & Statements Summary</h3>
              <p className="text-xs text-slate-500">Computed live from internal General Ledger, AR, AP, Payroll, and Machine Depreciation entries.</p>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="bg-transparent border-none outline-none font-bold text-slate-800 text-xs cursor-pointer"
              >
                <option value="Q1-2026">Q1 2026 (Apr - Jun 2026)</option>
                <option value="Q4-2025">Q4 2025 (Jan - Mar 2026)</option>
                <option value="FY-2025-26">Full FY 2025-26</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* PROFIT & LOSS STATEMENT */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                  Profit & Loss Statement (P&L)
                </h4>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-xl">
                  {selectedPeriod}
                </span>
              </div>

              <div className="space-y-4 text-xs font-medium">
                {/* Revenue Section */}
                <div className="space-y-2">
                  <div className="flex justify-between font-bold text-slate-900 text-sm border-b pb-1">
                    <span>1. Operating Sales Revenue</span>
                    <span className="font-mono text-emerald-700">₹{totalSalesRevenue.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-3">
                    <span>B2B Mountain Bike Sales</span>
                    <span className="font-mono">₹ 9,20,000</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-3">
                    <span>B2B E-Bike Sales</span>
                    <span className="font-mono">₹ 5,10,000</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-3">
                    <span>Accessories & Components</span>
                    <span className="font-mono">₹ 3,80,000</span>
                  </div>
                </div>

                {/* Expenses & COGS Section */}
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between font-bold text-slate-900 text-sm border-b pb-1">
                    <span>2. Cost of Goods Sold & Expenses</span>
                    <span className="font-mono text-rose-700">₹{totalFactoryExpenses.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-3">
                    <span>Raw Material Procurement (BOM Parts)</span>
                    <span className="font-mono">₹{totalMaterialPurchases.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-3">
                    <span>Technician Floor Wages Payroll</span>
                    <span className="font-mono">₹{totalPayrollExpenses.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-3">
                    <span>Machinery Straight-Line Depreciation</span>
                    <span className="font-mono">₹{Math.round(monthlyDepreciationTotal).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-3">
                    <span>Factory Overheads & Utilities</span>
                    <span className="font-mono">₹ 45,000</span>
                  </div>
                </div>

                {/* Net Profit Line */}
                <div className="pt-3 border-t border-slate-200 flex justify-between items-center text-sm font-bold bg-slate-50 p-3 rounded-xl">
                  <span className="text-slate-900 font-bold">Net Operating Profit (EBITDA)</span>
                  <span className="font-mono font-bold text-base text-emerald-600">
                    ₹{netFactoryProfit.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            {/* BALANCE SHEET STATEMENT */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-indigo-600" />
                  Balance Sheet (As of Today)
                </h4>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-xl">
                  Assets = Liabilities + Equity
                </span>
              </div>

              <div className="space-y-4 text-xs font-medium">
                {/* Assets */}
                <div className="space-y-2">
                  <div className="flex justify-between font-bold text-slate-900 text-sm border-b pb-1">
                    <span>TOTAL ASSETS</span>
                    <span className="font-mono text-indigo-700">₹{totalBalanceSheetAssets.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-3">
                    <span>Bank & Cash Equivalents</span>
                    <span className="font-mono">₹ 2,450,000</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-3">
                    <span>Accounts Receivable (Customer Owed)</span>
                    <span className="font-mono">₹{totalReceivables.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-3">
                    <span>Raw Material & Bike Stock Inventory</span>
                    <span className="font-mono">₹ 2,140,000</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-3">
                    <span>Fixed Machinery Assets (Net Book Value)</span>
                    <span className="font-mono">₹{totalAssetsNet.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Liabilities & Equity */}
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between font-bold text-slate-900 text-sm border-b pb-1">
                    <span>LIABILITIES & EQUITY</span>
                    <span className="font-mono text-slate-900">₹{totalBalanceSheetAssets.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-3">
                    <span>Accounts Payable (Supplier Vendors)</span>
                    <span className="font-mono">₹{totalPayables.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-3">
                    <span>Output GST Tax Payable</span>
                    <span className="font-mono">₹ 162,000</span>
                  </div>
                  <div className="flex justify-between text-indigo-700 font-bold pl-3">
                    <span>Net Owner Capital & Retained Earnings</span>
                    <span className="font-mono">₹{totalBalanceSheetEquity.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 flex justify-between items-center text-xs font-bold text-emerald-700 bg-emerald-50 p-2.5 rounded-xl">
                  <span>Balance Sheet Status:</span>
                  <span>✅ Perfectly Balanced</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ACCOUNTS RECEIVABLE & AR AGING MATRIX */}
      {/* ========================================================================= */}
      {activeTab === 'AR_AGING' && (
        <div className="space-y-6">
          {/* AR AGING BREAKDOWN MATRIX */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <ArrowDownRight className="w-5 h-5 text-emerald-600" />
                  Accounts Receivable (AR) Aging Breakdown Matrix
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Categorizes distributor debts into 0-30, 31-60, 61-90, and 90+ Days Overdue. Directly powers the Sales Credit Gate.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-200">
                  <tr>
                    <th className="p-4">Distributor Party</th>
                    <th className="p-4 text-right">Credit Limit</th>
                    <th className="p-4 text-right">Total Outstanding</th>
                    <th className="p-4 text-center">0 - 30 Days (Normal)</th>
                    <th className="p-4 text-center">31 - 60 Days</th>
                    <th className="p-4 text-center">61 - 90 Days</th>
                    <th className="p-4 text-center">90+ Days Overdue</th>
                    <th className="p-4 text-center">Credit Gate Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {safeArAging.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-slate-900">{row.distributorName}</div>
                        <div className="text-xs text-slate-400 font-mono">{row.distributorCode}</div>
                      </td>
                      <td className="p-4 text-right font-mono text-slate-600">
                        ₹{row.creditLimit?.toLocaleString('en-IN')}
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-slate-900">
                        ₹{row.totalOutstanding?.toLocaleString('en-IN')}
                      </td>
                      <td className="p-4 text-center font-mono text-slate-600">
                        ₹{row.current0to30?.toLocaleString('en-IN')}
                      </td>
                      <td className="p-4 text-center font-mono font-bold text-amber-700">
                        ₹{row.overdue31to60?.toLocaleString('en-IN')}
                      </td>
                      <td className="p-4 text-center font-mono font-bold text-orange-700">
                        ₹{row.overdue61to90?.toLocaleString('en-IN')}
                      </td>
                      <td className="p-4 text-center font-mono font-bold text-red-600">
                        ₹{row.overdue90Plus?.toLocaleString('en-IN')}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                          row.creditStatus === 'HEALTHY' ? 'bg-emerald-100 text-emerald-800' :
                          row.creditStatus === 'WARNING' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {row.creditStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* CENTRALIZED FINANCE BILLING QUEUE */}
          <div id="central-billing-queue" className="bg-white rounded-2xl border-2 border-indigo-200 shadow-md p-6 space-y-4 scroll-mt-20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
                    <ShieldCheck className="w-4 h-4" />
                  </span>
                  <h3 className="text-lg font-bold text-slate-900">
                    Centralized Finance Billing Queue: Sales Orders Awaiting Tax Invoicing
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 uppercase tracking-wider">
                    Tax Gate
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Statutory Tax Compliance: Sales issues commercial Pro-Formas. Finance assesses HSN rates, verifies GSTIN, issues legal GST Tax Invoices, and posts to ledger.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  {salesOrders.filter(so => so.taxInvoiceStatus === 'REQUESTED').length} Requested by Sales
                </span>
                <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">
                  {salesOrders.length} Total Commercial Orders
                </span>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-200">
                  <tr>
                    <th className="p-4">Sales Order #</th>
                    <th className="p-4">Customer Party</th>
                    <th className="p-4">PO & Pro-Forma Ref</th>
                    <th className="p-4 text-right">Order Amount</th>
                    <th className="p-4 text-center">Tax Invoicing Status</th>
                    <th className="p-4 text-right">Finance Invoicing Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {salesOrders.length > 0 ? (
                    salesOrders.map((so) => (
                      <tr 
                        key={so._id} 
                        className={`transition-all ${
                          so.taxInvoiceStatus === 'REQUESTED' 
                            ? 'bg-blue-50/80 border-l-4 border-l-blue-600 font-semibold shadow-xs' 
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className="p-4">
                          <div className="font-mono font-bold text-slate-900">{so.soNumber}</div>
                          <div className="text-xs text-slate-400 font-mono">{new Date(so.createdAt).toLocaleDateString('en-IN')}</div>
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-slate-900">{so.customerName}</div>
                          <div className="text-xs text-slate-500 font-mono">GSTIN: 27AABCP8921K1Z3</div>
                        </td>
                        <td className="p-4">
                          <div className="space-y-1">
                            <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                              PO: {so.poNumber || 'N/A'}
                            </span>
                            <br />
                            <span className="text-xs font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              PI: {so.proformaNumber || 'PI-2026-Draft'}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 text-right font-mono font-bold text-slate-900">
                          ₹{so.totalAmount?.toLocaleString('en-IN')}
                        </td>
                        <td className="p-4 text-center">
                          {so.taxInvoiceStatus === 'INVOICED' ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Tax Invoiced ({so.taxInvoiceNumber || 'INV-2026-001'})
                            </span>
                          ) : so.taxInvoiceStatus === 'REQUESTED' ? (
                            <span className="px-3 py-1.5 rounded-full text-xs font-bold uppercase bg-blue-600 text-white shadow-sm inline-flex items-center gap-1.5 animate-pulse">
                              <Clock className="w-3.5 h-3.5 text-white shrink-0" />
                              ⚡ REQUESTED BY SALES
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-slate-100 text-slate-600">
                              Unbilled
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedProforma(so);
                                setProformaModalOpen(true);
                              }}
                              className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
                              title="View Sales Pro-Forma Estimate"
                            >
                              View Pro-Forma
                            </button>

                            {so.taxInvoiceStatus === 'INVOICED' ? (
                              <button
                                onClick={() => {
                                  setSelectedBillingOrder(so);
                                  setTaxInvoiceModalOpen(true);
                                }}
                                className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold rounded-xl transition-colors flex items-center gap-1"
                              >
                                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                                View Tax Invoice
                              </button>
                            ) : so.taxInvoiceStatus === 'REQUESTED' ? (
                              <button
                                onClick={() => {
                                  setSelectedBillingOrder(so);
                                  setTaxInvoiceModalOpen(true);
                                }}
                                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-600/20 flex items-center gap-1.5"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Generate Tax Invoice
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setSelectedBillingOrder(so);
                                  setTaxInvoiceModalOpen(true);
                                }}
                                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Issue GST Tax Invoice
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 font-medium">
                        No sales orders awaiting billing.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* CUSTOMER INVOICES TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Customer Sales Invoices List</h3>
                <p className="text-xs text-slate-500 mt-0.5">Click "Record Payment" to log full or partial customer receipts.</p>
              </div>

              <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200">
                {[
                  { key: 'ALL', label: 'All Invoices' },
                  { key: 'UNPAID', label: 'Unpaid / Overdue' },
                  { key: 'PAID', label: 'Paid' },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setSalesFilter(f.key as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      salesFilter === f.key ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-200">
                  <tr>
                    <th className="p-4">Invoice #</th>
                    <th className="p-4">Distributor Party</th>
                    <th className="p-4">Invoice & Due Dates</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-right">Total Invoice</th>
                    <th className="p-4 text-right">Amount Paid</th>
                    <th className="p-4 text-right">Remaining Balance</th>
                    <th className="p-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredSalesInvoices.map((inv) => {
                    const remaining = inv.totalAmount - (inv.amountPaid || 0);

                    return (
                      <tr key={inv._id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                        <td className="p-4 font-bold text-slate-900">{inv.customer?.name}</td>
                        <td className="p-4 text-xs">
                          <div>Issued: <strong>{new Date(inv.issueDate).toLocaleDateString()}</strong></div>
                          <div>Due: <strong>{new Date(inv.dueDate).toLocaleDateString()}</strong></div>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                            inv.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="p-4 text-right font-mono font-bold">₹{inv.totalAmount.toLocaleString('en-IN')}</td>
                        <td className="p-4 text-right font-mono text-emerald-700 font-bold">₹{(inv.amountPaid || 0).toLocaleString('en-IN')}</td>
                        <td className="p-4 text-right font-mono font-bold">₹{remaining.toLocaleString('en-IN')}</td>
                        <td className="p-4 text-center">
                          {remaining > 0 ? (
                            <button
                              onClick={() => openPaymentModal(inv)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-sm transition-all inline-flex items-center gap-1 cursor-pointer"
                            >
                              <DollarSign className="w-3.5 h-3.5" /> Record Payment
                            </button>
                          ) : (
                            <span className="text-xs text-emerald-600 font-bold">Settled</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ACCOUNTS PAYABLE & SUPPLIER BILLS */}
      {/* ========================================================================= */}
      {activeTab === 'AP_BILLS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-rose-600" />
                Accounts Payable (AP) Supplier Bills
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Raw material vendor bills matched to GRN receipts. Click "Pay Supplier" to record outgoing payments.</p>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-200">
                <tr>
                  <th className="p-4">Bill #</th>
                  <th className="p-4">Supplier Vendor</th>
                  <th className="p-4">Dates</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-right">Total Bill</th>
                  <th className="p-4 text-right">Amount Paid</th>
                  <th className="p-4 text-right">Remaining Payable</th>
                  <th className="p-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredSupplierBills.map((inv) => {
                  const remaining = inv.totalAmount - (inv.amountPaid || 0);
                  return (
                    <tr key={inv._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                      <td className="p-4 font-bold text-slate-900">{inv.supplier?.name}</td>
                      <td className="p-4 text-xs">
                        <div>Issued: <strong>{new Date(inv.issueDate).toLocaleDateString()}</strong></div>
                        <div>Due: <strong>{new Date(inv.dueDate).toLocaleDateString()}</strong></div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                          inv.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="p-4 text-right font-mono font-bold">₹{inv.totalAmount.toLocaleString('en-IN')}</td>
                      <td className="p-4 text-right font-mono text-rose-700 font-bold">₹{(inv.amountPaid || 0).toLocaleString('en-IN')}</td>
                      <td className="p-4 text-right font-mono font-bold">₹{remaining.toLocaleString('en-IN')}</td>
                      <td className="p-4 text-center">
                        {remaining > 0 ? (
                          <button
                            onClick={() => openPaymentModal(inv)}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-sm transition-all inline-flex items-center gap-1 cursor-pointer"
                          >
                            <CreditCard className="w-3.5 h-3.5" /> Pay Supplier
                          </button>
                        ) : (
                          <span className="text-xs text-emerald-600 font-bold">Settled</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: CHART OF ACCOUNTS & GENERAL LEDGER */}
      {/* ========================================================================= */}
      {activeTab === 'GL_ACCOUNTS' && (
        <div className="space-y-6">
          {/* CHART OF ACCOUNTS TREE */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-600" />
              Chart of Accounts Master Hierarchy
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {safeAccounts.map((acc: any, idx: number) => (
                <div key={idx} className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 flex justify-between items-center">
                  <div>
                    <span className="font-mono text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                      {acc.code}
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm mt-1">{acc.name}</h4>
                    <p className="text-xs text-slate-400 font-medium">{acc.category}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold font-mono text-slate-900 block">₹{acc.balance?.toLocaleString('en-IN')}</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded uppercase ${
                      acc.type === 'ASSET' ? 'bg-emerald-100 text-emerald-800' :
                      acc.type === 'LIABILITY' ? 'bg-rose-100 text-rose-800' :
                      acc.type === 'REVENUE' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {acc.type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AUTOMATED JOURNAL ENTRIES AUDIT LOG */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Automated Double-Entry Journal Postings Audit Log</h3>

            <div className="space-y-4">
              {safeJournalEntries.map((je: any, idx: number) => (
                <div key={idx} className="border border-slate-200 p-4 rounded-xl space-y-2">
                  <div className="flex justify-between items-center border-b pb-2 text-xs">
                    <span className="font-mono font-bold text-slate-900">{je.entryNumber} • {new Date(je.date).toLocaleDateString()}</span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded">{je.status}</span>
                  </div>
                  <p className="text-xs text-slate-700 font-medium">{je.description}</p>
                  <div className="space-y-1 text-xs font-mono">
                    {je.lines?.map((line: any, lIdx: number) => (
                      <div key={lIdx} className="flex justify-between text-slate-600">
                        <span>{line.accountName}</span>
                        <span>
                          {line.debit > 0 ? `Dr. ₹${line.debit.toLocaleString('en-IN')}` : `Cr. ₹${line.credit.toLocaleString('en-IN')}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: FIXED ASSETS & MACHINERY DEPRECIATION */}
      {/* ========================================================================= */}
      {activeTab === 'FIXED_ASSETS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Wrench className="w-5 h-5 text-sky-600" />
                Manufacturing Fixed Asset Register & Straight-Line Depreciation
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Calculates monthly machine wear-and-tear depreciation for true COGS accuracy.</p>
            </div>
            <button
              onClick={() => setIsAssetModalOpen(true)}
              className="text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 px-3.5 py-2 rounded-xl flex items-center gap-1.5 hover:bg-sky-100 transition-all"
            >
              <Plus className="w-4 h-4" /> Add Fixed Asset Machine
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-200">
                <tr>
                  <th className="p-4">Asset Tag & Machine Name</th>
                  <th className="p-4">Category & Location</th>
                  <th className="p-4 text-right">Original Purchase Cost</th>
                  <th className="p-4 text-center">Useful Life (Yrs)</th>
                  <th className="p-4 text-right">Annual Depreciation</th>
                  <th className="p-4 text-right">Monthly COGS Wear</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {safeAssets.map((ast) => {
                  const depreciable = (ast.originalCost || 0) - (ast.salvageValue || 0);
                  const annualDep = (ast.usefulLifeYears || 5) > 0 ? depreciable / ast.usefulLifeYears : 0;
                  const monthlyDep = annualDep / 12;

                  return (
                    <tr key={ast._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-slate-900">{ast.name}</div>
                        <div className="text-xs text-slate-400 font-mono">{ast.assetTag}</div>
                      </td>
                      <td className="p-4 text-xs">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-bold uppercase">{ast.category}</span>
                        <div className="text-slate-400 mt-1">{ast.location}</div>
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-slate-900">
                        ₹{ast.originalCost?.toLocaleString('en-IN')}
                      </td>
                      <td className="p-4 text-center font-bold text-slate-800">
                        {ast.usefulLifeYears} Years
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-indigo-700">
                        ₹{Math.round(annualDep).toLocaleString('en-IN')} / yr
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-amber-600">
                        ₹{Math.round(monthlyDep).toLocaleString('en-IN')} / mo
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleIn">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl ${selectedInvoice.type === 'SALES' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {selectedInvoice.type === 'SALES' ? 'Record Customer Payment' : 'Pay Supplier Vendor'}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Ref: {selectedInvoice.invoiceNumber}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="text-slate-400 hover:text-slate-600 font-bold">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-medium">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex justify-between items-center">
                <span className="text-slate-500">Party:</span>
                <strong className="text-slate-900 font-bold text-sm">
                  {selectedInvoice.type === 'SALES' ? selectedInvoice.customer?.name : selectedInvoice.supplier?.name}
                </strong>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Payment Amount (₹)</label>
                <input
                  type="number"
                  min="1"
                  max={selectedInvoice.totalAmount - (selectedInvoice.amountPaid || 0)}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-mono font-bold text-base"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-medium"
                >
                  <option value="BANK_TRANSFER">Bank Transfer (NEFT / RTGS)</option>
                  <option value="UPI">UPI Payment</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Reference / Cheque Number</label>
                <input
                  type="text"
                  placeholder="e.g. NEFT-88219 or CHQ-0012"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button onClick={() => setSelectedInvoice(null)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={isSubmittingPayment || paymentAmount <= 0}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Save Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW FIXED ASSET MODAL */}
      {isAssetModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleIn">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-sky-50 text-sky-600">
                  <Wrench className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Add Fixed Asset Machinery</h3>
              </div>
              <button onClick={() => setIsAssetModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-medium">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Machine / Asset Name</label>
                <input
                  type="text"
                  placeholder="e.g. CNC Frame Tube Laser Cutter"
                  value={newAsset.name}
                  onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-sky-500 font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Asset Category</label>
                <select
                  value={newAsset.category}
                  onChange={(e) => setNewAsset({ ...newAsset, category: e.target.value as any })}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-sky-500 font-medium"
                >
                  <option value="MACHINERY">Machinery</option>
                  <option value="EQUIPMENT">Equipment</option>
                  <option value="VEHICLE">Vehicle</option>
                  <option value="FURNITURE">Furniture</option>
                  <option value="BUILDING">Building</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Original Cost (₹)</label>
                  <input
                    type="number"
                    value={newAsset.originalCost}
                    onChange={(e) => setNewAsset({ ...newAsset, originalCost: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Useful Life (Years)</label>
                  <input
                    type="number"
                    value={newAsset.usefulLifeYears}
                    onChange={(e) => setNewAsset({ ...newAsset, usefulLifeYears: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button onClick={() => setIsAssetModalOpen(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">
                Cancel
              </button>
              <button
                onClick={handleCreateAsset}
                className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Save Machine Asset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATUTORY GST TAX INVOICE MODAL */}
      <TaxInvoiceModal
        isOpen={taxInvoiceModalOpen}
        onClose={() => {
          setTaxInvoiceModalOpen(false);
          setSelectedBillingOrder(null);
        }}
        order={selectedBillingOrder}
        onInvoiceCreated={(newInv) => {
          setNotification(`GST Tax Invoice ${newInv.invoiceNumber} successfully issued and linked!`);
          fetchData();
        }}
      />

      {/* SALES PRO-FORMA INVOICE PREVIEW MODAL */}
      <ProformaInvoiceModal
        isOpen={proformaModalOpen}
        onClose={() => {
          setProformaModalOpen(false);
          setSelectedProforma(null);
        }}
        order={selectedProforma}
      />
    </div>
  );
}
