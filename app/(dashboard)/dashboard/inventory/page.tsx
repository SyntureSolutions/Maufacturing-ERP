'use client';

import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Search, 
  RefreshCcw, 
  Loader2, 
  AlertCircle, 
  Package, 
  Calendar, 
  Layers, 
  ArrowRight, 
  TrendingDown, 
  Plus, 
  CheckCircle2, 
  X, 
  ExternalLink, 
  MapPin, 
  ShieldAlert, 
  Edit3, 
  ClipboardCheck, 
  Truck, 
  Send, 
  Check, 
  FileCheck2,
  ShieldCheck,
  Calculator,
  Zap,
  TrendingUp,
  DollarSign,
  BarChart3,
  FileSpreadsheet
} from 'lucide-react';
import Link from 'next/link';
import BatchDetailModal from '@/components/modals/BatchDetailModal';

export default function InventoryPage() {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'BATCH_LOGS' | 'CYCLE_COUNTS' | 'TRANSFERS' | 'VALUATION_REPLENISH'>('BATCH_LOGS');
  // ?tab=transfers (used by the transfer object page's Document Overview) opens the transfers tab
  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'transfers') setActiveTab('TRANSFERS'); }, []);

  // Shared state
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState<string | null>(null);

  // Tab 1: Batch Logs state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [selectedBatch, setSelectedBatch] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [newBatchData, setNewBatchData] = useState({
    productName: 'High-Grade Alloy Frame T6',
    batchNumber: `BN-INW-${Math.floor(1000 + Math.random() * 9000)}`,
    quantity: 100,
    minSafetyStock: 25,
    unitCost: 3200,
    location: 'Rack A-01 (Frames)',
    supplier: 'Apex Alloy Frames Ltd.',
    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });
  const [transferBatch, setTransferBatch] = useState<any | null>(null);
  const [targetLocation, setTargetLocation] = useState<string>('');

  // Tab 2: Cycle Counting state
  const [cycleCounts, setCycleCounts] = useState<any[]>([]);
  const [loadingCycleCounts, setLoadingCycleCounts] = useState(false);
  const [isCreateCountOpen, setIsCreateCountOpen] = useState(false);
  const [activeCountSheet, setActiveCountSheet] = useState<any | null>(null);
  const [newCountForm, setNewCountForm] = useState({
    warehouse: 'All Locations',
    assignedCounter: 'Ramesh Patel (QC Auditor)'
  });

  // Tab 3: Transfer Orders state
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [isCreateTransferOpen, setIsCreateTransferOpen] = useState(false);
  const [activeReceiptModal, setActiveReceiptModal] = useState<any | null>(null);
  const [receiptForm, setReceiptForm] = useState<{ [index: number]: number }>({});
  const [newTransferForm, setNewTransferForm] = useState({
    fromWarehouse: '',
    toWarehouse: '',
    selectedBatchId: '',
    quantity: 1,
    carrier: 'Internal Logistics Fleet',
    vehicleNumber: '',
    driverName: '',
    driverPhone: '',
    notes: ''
  });
  const [locations, setLocations] = useState<any[]>([]);

  // Tab 4: Valuation & Auto-Replenishment state
  const [valuationData, setValuationData] = useState<any | null>(null);
  const [loadingValuation, setLoadingValuation] = useState(false);
  const [replenishData, setReplenishData] = useState<any | null>(null);
  const [loadingReplenish, setLoadingReplenish] = useState(false);
  const [isScanningROP, setIsScanningROP] = useState(false);
  // Fetch batches
  const fetchBatches = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/inventory/batches');
      if (res.ok) {
        const data = await res.json();
        setBatches(Array.isArray(data) ? data : []);
      } else {
        setError('Failed to load inventory batches');
      }
    } catch (err) {
      setError('An error occurred while fetching inventory');
    } finally {
      setLoading(false);
    }
  };

  // Fetch cycle counts
  const fetchCycleCounts = async () => {
    setLoadingCycleCounts(true);
    try {
      const res = await fetch('/api/inventory/cycle-counts');
      if (res.ok) {
        const data = await res.json();
        setCycleCounts(Array.isArray(data) ? data : []);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to load cycle counts.');
      }
    } catch (err) {
      console.error('Failed to fetch cycle counts:', err);
      setError('Could not reach the server while loading cycle counts.');
    } finally {
      setLoadingCycleCounts(false);
    }
  };

  // Fetch transfers
  const fetchTransfers = async () => {
    setLoadingTransfers(true);
    try {
      const res = await fetch('/api/inventory/transfers');
      if (res.ok) {
        const data = await res.json();
        setTransfers(Array.isArray(data) ? data : []);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to load transfers.');
      }
    } catch (err) {
      console.error('Failed to fetch transfers:', err);
      setError('Could not reach the server while loading transfers.');
    } finally {
      setLoadingTransfers(false);
    }
  };

  // Fetch valuation
  const fetchValuation = async () => {
    setLoadingValuation(true);
    try {
      const res = await fetch('/api/inventory/valuation');
      if (res.ok) {
        setValuationData(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch valuation:', err);
    } finally {
      setLoadingValuation(false);
    }
  };

  // Fetch auto-replenishment status
  const fetchReplenish = async () => {
    setLoadingReplenish(true);
    try {
      const res = await fetch('/api/inventory/replenish');
      if (res.ok) {
        setReplenishData(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch replenishment status:', err);
    } finally {
      setLoadingReplenish(false);
    }
  };

  useEffect(() => {
    fetchBatches();
    fetchCycleCounts();
    fetchTransfers();
    fetch('/api/storage-locations').then(r => (r.ok ? r.json() : [])).then(d => setLocations(Array.isArray(d) ? d.filter((l: any) => l.isActive !== false) : [])).catch(() => setLocations([]));
    fetchValuation();
    fetchReplenish();
  }, []);

  const safeBatches = Array.isArray(batches) ? batches : [];
  const uniqueLocations = Array.from(new Set(safeBatches.map(b => b.location).filter(Boolean)));

  const filteredBatches = safeBatches.filter(b => {
    const matchesSearch = 
      (b.product && b.product.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (b.batchNumber && b.batchNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (b.location && b.location.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesLoc = selectedLocation === 'ALL' ? true : b.location === selectedLocation;
    return matchesSearch && matchesLoc;
  });

  const getDaysToExpiry = (expiryDate: string) => {
    if (!expiryDate) return 999;
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const isLowSafetyStock = (batch: any) => {
    const available = (batch.currentQuantity || 0) - (batch.allocatedQuantity || 0);
    const minThreshold = batch.minSafetyStock || 25;
    return available <= minThreshold;
  };

  const lowStockCount = safeBatches.filter(b => isLowSafetyStock(b)).length;

  // Handler: Receive New Batch. Batches are created by a goods receipt, so the server refuses this and says where to go instead.
  const handleReceiveNewBatch = async () => {
    if (!newBatchData.productName || newBatchData.quantity <= 0) return;
    try {
      const res = await fetch('/api/inventory/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBatchData)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNotification(`New Inventory Batch ${newBatchData.batchNumber} received at "${newBatchData.location}"!`);
        fetchBatches();
        fetchValuation();
      } else {
        setNotification(data.error || 'Could not receive the batch.');
      }
      setTimeout(() => setNotification(null), 6000);
    } catch (e) {
      console.error('Failed to receive new batch:', e);
    } finally {
      setIsReceiveModalOpen(false);
    }
  };

  // Handler: Transfer Location (Internal Bin). The list changes only after the server accepts the move.
  const handleTransferLocation = async () => {
    if (!transferBatch || !targetLocation.trim()) return;
    const finalLocation = targetLocation.trim();
    try {
      const res = await fetch('/api/inventory/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'TRANSFER_LOCATION', batchId: transferBatch._id, newLocation: finalLocation })
      });
      const data = await res.json().catch(() => ({}));
      setNotification(res.ok ? `Location for Batch ${transferBatch.batchNumber} changed to "${data.location || finalLocation}"!` : (data.error || 'Could not change the location.'));
      if (res.ok) fetchBatches();
      setTimeout(() => setNotification(null), 6000);
    } catch (e) {
      console.error('Failed to transfer batch location:', e);
    } finally {
      setTransferBatch(null);
    }
  };

  // Handler: Create Cycle Count Sheet
  const handleCreateCycleCount = async () => {
    try {
      const res = await fetch('/api/inventory/cycle-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse: newCountForm.warehouse,
          assignedCounter: newCountForm.assignedCounter
        })
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(response.error || 'Failed to create cycle count.');
      if (res.ok) {
        const created = response;
        setNotification(`Physical Cycle Count Sheet ${created.countNumber} generated!`);
        fetchCycleCounts();
        setActiveCountSheet(created);
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (e) {
      console.error('Failed to create cycle count:', e);
      setError(e instanceof Error ? e.message : 'Failed to create cycle count.');
    } finally {
      setIsCreateCountOpen(false);
    }
  };

  // Handler: Save / Submit Cycle Count
  const handleSubmitCycleCount = async (countId: string, items: any[], submitForApproval: boolean) => {
    try {
      const res = await fetch('/api/inventory/cycle-counts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countId,
          items,
          action: submitForApproval ? 'SUBMIT_FOR_APPROVAL' : 'SAVE_DRAFT'
        })
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(response.error || 'Failed to update cycle count.');
      if (res.ok) {
        const updated = response;
        setNotification(
          submitForApproval
            ? `Cycle Count ${updated.countNumber} submitted for Manager Reconciliation Approval!`
            : `Cycle Count ${updated.countNumber} draft progress saved.`
        );
        fetchCycleCounts();
        setActiveCountSheet(null);
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (e) {
      console.error('Failed to update cycle count:', e);
      setError(e instanceof Error ? e.message : 'Failed to update cycle count.');
    }
  };

  // Handler: Post / Approve Reconciliation
  const handlePostReconciliation = async (countId: string) => {
    try {
      const res = await fetch(`/api/inventory/cycle-counts/${countId}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE' })
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(response.error || 'Failed to post cycle count.');
      if (res.ok) {
        setNotification('Cycle count variance reconciled & posted to inventory ledger!');
        fetchCycleCounts();
        fetchBatches();
        fetchValuation();
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (e) {
      console.error('Failed to post reconciliation:', e);
      setError(e instanceof Error ? e.message : 'Failed to post cycle count.');
    }
  };

  // Handler: Create Inter-Warehouse Transfer Order
  const handleCreateTransfer = async () => {
    if (!newTransferForm.fromWarehouse || !newTransferForm.toWarehouse) {
      alert('Choose the origin and destination storage locations.');
      return;
    }
    if (!newTransferForm.selectedBatchId) {
      alert('Please select a batch to transfer.');
      return;
    }
    const chosenBatch = safeBatches.find(b => b._id === newTransferForm.selectedBatchId);
    if (!chosenBatch) return;

    try {
      const res = await fetch('/api/inventory/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromWarehouse: newTransferForm.fromWarehouse,
          toWarehouse: newTransferForm.toWarehouse,
          items: [
            {
              batchId: chosenBatch._id,
              batchNumber: chosenBatch.batchNumber,
              productName: chosenBatch.product?.name || 'Component Part',
              productSku: chosenBatch.product?.sku || '',
              requestedQuantity: Number(newTransferForm.quantity),
              dispatchedQuantity: Number(newTransferForm.quantity),
              unitCost: chosenBatch.purchasePrice || 0
            }
          ],
          carrier: newTransferForm.carrier,
          vehicleNumber: newTransferForm.vehicleNumber,
          driverName: newTransferForm.driverName,
          driverPhone: newTransferForm.driverPhone,
          notes: newTransferForm.notes
        })
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(response.error || 'Failed to create transfer order.');

      if (res.ok) {
        const created = response;
        setNotification(`Transfer Order ${created.transferNumber} drafted successfully!`);
        fetchTransfers();
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (e) {
      console.error('Failed to create transfer order:', e);
      setError(e instanceof Error ? e.message : 'Failed to create transfer order.');
    } finally {
      setIsCreateTransferOpen(false);
    }
  };

  // Handler: Dispatch Transfer
  const handleDispatchTransfer = async (transferId: string) => {
    try {
      const res = await fetch('/api/inventory/transfers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transferId,
          action: 'DISPATCH'
        })
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(response.error || 'Failed to dispatch transfer.');
      if (res.ok) {
        setNotification('Transfer dispatched! Stock deducted from origin and placed IN-TRANSIT.');
        fetchTransfers();
        fetchBatches();
        fetchValuation();
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (e) {
      console.error('Failed to dispatch transfer:', e);
      setError(e instanceof Error ? e.message : 'Failed to dispatch transfer.');
    }
  };

  // Handler: Confirm Goods Receipt
  const handleConfirmReceipt = async () => {
    if (!activeReceiptModal) return;

    const receivedItems = activeReceiptModal.items.map((it: any, index: number) => ({
      receivedQuantity: receiptForm[index] !== undefined ? receiptForm[index] : it.dispatchedQuantity
    }));

    try {
      const res = await fetch('/api/inventory/transfers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transferId: activeReceiptModal._id,
          action: 'RECEIVE',
          receivedItems
        })
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(response.error || 'Failed to confirm receipt.');
      if (res.ok) {
        setNotification(`Shipment received at "${activeReceiptModal.toWarehouse}" and credited to stock!`);
        fetchTransfers();
        fetchBatches();
        fetchValuation();
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (e) {
      console.error('Failed to confirm receipt:', e);
      setError(e instanceof Error ? e.message : 'Failed to confirm receipt.');
    } finally {
      setActiveReceiptModal(null);
    }
  };

  // Handler: Change Valuation Policy
  const handleSetValuationMethod = async (method: 'FIFO' | 'WEIGHTED_AVERAGE' | 'LIFO') => {
    try {
      const res = await fetch('/api/inventory/valuation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SET_METHOD', method })
      });
      if (res.ok) {
        setNotification(`Corporate Inventory Valuation policy updated to ${method}!`);
        fetchValuation();
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (e) {
      console.error('Failed to set valuation method:', e);
    }
  };

  // Handler: Trigger ROP Scan
  const handleTriggerROPScan = async () => {
    setIsScanningROP(true);
    try {
      const res = await fetch('/api/inventory/replenish', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setNotification(data.error || 'The reorder check could not run.'); setTimeout(() => setNotification(null), 5000); }
      if (res.ok) {
        setNotification(data.message || 'Reorder check done.');
        fetchReplenish();
        setTimeout(() => setNotification(null), 4500);
      }
    } catch (e) {
      console.error('Failed to run ROP scan:', e);
    } finally {
      setIsScanningROP(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            Inventory & Warehouse Operations
          </h2>
          <p className="text-slate-500 mt-1">
            Real-time batch tracking, physical cycle counting, multi-warehouse transfers, FIFO/WAC valuation, and automated reorder points (ROP).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              fetchBatches();
              fetchCycleCounts();
              fetchTransfers();
              fetchValuation();
              fetchReplenish();
            }}
            className="p-3 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm cursor-pointer"
            title="Refresh System"
          >
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center gap-3 shadow-sm font-medium animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Top Level Navigation Tabs */}
      <div className="flex items-center overflow-x-auto">
        <button
          onClick={() => setActiveTab('BATCH_LOGS')}
          className={`tab gap-2 ${activeTab === 'BATCH_LOGS' ? 'tab-active' : ''}`}
        >
          <Package className="w-4 h-4" />
          Batch Logs & Racks
          <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-black/10">
            {safeBatches.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('CYCLE_COUNTS')}
          className={`tab gap-2 ${activeTab === 'CYCLE_COUNTS' ? 'tab-active' : ''}`}
        >
          <ClipboardCheck className="w-4 h-4" />
          Cycle Counting & Audit
          <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-black/10">
            {cycleCounts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('TRANSFERS')}
          className={`tab gap-2 ${activeTab === 'TRANSFERS' ? 'tab-active' : ''}`}
        >
          <Truck className="w-4 h-4" />
          Inter-Warehouse Transfers
          <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-black/10">
            {transfers.filter(t => t.status === 'DISPATCHED').length} In-Transit
          </span>
        </button>

        <button
          onClick={() => setActiveTab('VALUATION_REPLENISH')}
          className={`tab gap-2 ${activeTab === 'VALUATION_REPLENISH' ? 'tab-active' : ''}`}
        >
          <Calculator className="w-4 h-4" />
          Valuation & Auto-Replenish
          <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-black/10">
            {valuationData?.activeCorporateMethod || 'FIFO'}
          </span>
        </button>
      </div>

      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: BATCH LOGS & WAREHOUSE RACK CONTROL */}
      {/* ========================================================================= */}
      {activeTab === 'BATCH_LOGS' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => setIsReceiveModalOpen(true)}
              className="flex items-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-lg shadow-amber-500/20 text-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Receive New Batch (GRN)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-900 p-6 rounded-3xl text-white shadow-lg shadow-slate-900/20">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-white/10 rounded-2xl text-amber-400">
                  <Package className="w-6 h-6" />
                </div>
              </div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total Active Batches</p>
              <h3 className="text-3xl font-bold font-mono mt-1">{safeBatches.length}</h3>
            </div>

            <div className="bg-rose-600 p-6 rounded-3xl text-white shadow-lg shadow-rose-600/20">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-white/10 rounded-2xl text-white">
                  <ShieldAlert className="w-6 h-6" />
                </div>
              </div>
              <p className="text-rose-100 text-xs font-bold uppercase tracking-wider">Low Safety Stock Alerts</p>
              <h3 className="text-3xl font-bold font-mono mt-1">{lowStockCount}</h3>
            </div>

            <div className="bg-amber-500 p-6 rounded-3xl text-white shadow-lg shadow-amber-500/20">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-white/10 rounded-2xl text-white">
                  <TrendingDown className="w-6 h-6" />
                </div>
              </div>
              <p className="text-amber-100 text-xs font-bold uppercase tracking-wider">Expiring Soon (&le; 30 Days)</p>
              <h3 className="text-3xl font-bold font-mono mt-1">
                {safeBatches.filter(b => getDaysToExpiry(b.expiryDate) <= 30).length}
              </h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex-1 relative group w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Search by product, batch number, or warehouse location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all font-medium text-xs sm:text-sm"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
              <button
                onClick={() => setSelectedLocation('ALL')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  selectedLocation === 'ALL'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Locations
              </button>
              {uniqueLocations.map((loc) => (
                <button
                  key={loc}
                  onClick={() => setSelectedLocation(loc)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    selectedLocation === loc
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>

          {loading && safeBatches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-slate-200">
              <Loader2 className="w-12 h-12 text-amber-500 animate-spin mb-4" />
              <p className="text-slate-500 font-medium text-lg">Loading inventory batches...</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-5 py-3.5 whitespace-nowrap">Product &amp; batch</th>
                      <th className="px-5 py-3.5 whitespace-nowrap">Available stock</th>
                      <th className="px-5 py-3.5 whitespace-nowrap">Location</th>
                      <th className="px-5 py-3.5 whitespace-nowrap">Expiry</th>
                      <th className="px-5 py-3.5 text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 [&>tr>td]:align-middle">
                    {filteredBatches.length > 0 ? (
                      filteredBatches.map((batch) => {
                        const daysToExpiry = getDaysToExpiry(batch.expiryDate);
                        const available = (batch.currentQuantity || 0) - (batch.allocatedQuantity || 0);
                        const lowStock = isLowSafetyStock(batch);

                        return (
                          <tr key={batch._id} className="hover:bg-slate-50/80 transition-colors group">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-amber-50 group-hover:text-amber-500 transition-all shrink-0">
                                  <Layers className="w-5 h-5" />
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">{batch.product?.name || 'Raw Component'}</p>
                                  <p className="mt-0.5 text-xs text-slate-500 num">{batch.batchNumber}</p>
                                </div>
                              </div>
                            </td>

                            <td className="px-5 py-4 min-w-[200px]">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-base font-bold text-slate-900 num">
                                  {available} <span className="text-xs font-medium text-slate-400">available</span>
                                </p>
                                {lowStock && (
                                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                                    <AlertTriangle className="h-3 w-3" /> Low stock · min {batch.minSafetyStock || 25}
                                  </span>
                                )}
                              </div>
                              <div className="mt-2 h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${lowStock ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                  style={{ width: `${Math.min(100, (available / (batch.initialQuantity || batch.currentQuantity || 100)) * 100)}%` }}
                                />
                              </div>
                            </td>

                            <td className="px-5 py-4 min-w-[220px]">
                              <div className="flex items-start gap-2.5">
                                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                                <div>
                                  <p className="text-sm font-medium text-slate-900">{batch.location || 'Rack A-01 (Frames)'}</p>
                                  <button
                                    onClick={() => {
                                      setTransferBatch(batch);
                                      setTargetLocation(batch.location || 'Rack A-01 (Frames)');
                                    }}
                                    className="btn btn-ghost btn-sm -ml-2 mt-0.5 !h-7 px-2 text-xs"
                                  >
                                    <Edit3 className="h-3 w-3" /> Change location
                                  </button>
                                </div>
                              </div>
                            </td>

                            <td className="px-5 py-4 whitespace-nowrap">
                              <div className="flex items-start gap-2.5">
                                <Calendar className={`mt-0.5 h-4 w-4 ${daysToExpiry <= 30 ? 'text-amber-500' : 'text-slate-400'}`} />
                                <div>
                                  <p className="text-sm font-medium text-slate-900 num">{new Date(batch.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                  <p className={`mt-0.5 text-xs font-medium ${
                                    daysToExpiry <= 0 ? 'text-red-600' : 
                                    daysToExpiry <= 30 ? 'text-amber-600' : 
                                    'text-slate-400'
                                  }`}>
                                    {daysToExpiry <= 0 ? 'Expired' : `${daysToExpiry} days left`}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-5 py-4 text-right">
                              <button 
                                onClick={() => {
                                  setSelectedBatch(batch);
                                  setIsModalOpen(true);
                                }}
                                className="btn btn-sm btn-secondary group/btn"
                                title="View batch traceability"
                              >
                                <span>Trace</span>
                                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-16 text-center text-sm text-slate-400">
                          No inventory batches found for selected filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CYCLE COUNTING & AUDIT RECONCILIATION */}
      {/* ========================================================================= */}
      {activeTab === 'CYCLE_COUNTS' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-gradient-to-r from-amber-50 to-orange-50 p-6 rounded-3xl border border-amber-200/60">
            <div>
              <span className="px-3 py-1 bg-amber-500 text-white rounded-full text-[11px] font-bold uppercase tracking-wider">
                Audit Integrity
              </span>
              <h3 className="text-xl font-bold text-slate-900 mt-2">Physical Cycle Counting & Ledger Reconciliation</h3>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                Perform structured partial counts without factory shutdowns. Enter physical counts, evaluate stock variances, and obtain manager approval before posting valuation write-offs to the ledger.
              </p>
            </div>
            <button
              onClick={() => setIsCreateCountOpen(true)}
              className="flex items-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-lg shadow-amber-500/20 text-xs transition-all shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Start Rack / Zone Count
            </button>
          </div>

          {loadingCycleCounts ? (
            <div className="flex items-center justify-center py-20 bg-white rounded-2xl border border-slate-200">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            </div>
          ) : cycleCounts.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 space-y-3">
              <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto" />
              <h4 className="text-base font-bold text-slate-700">No Cycle Count Sheets Found</h4>
              <p className="text-xs text-slate-500">Create a scheduled count to begin physical reconciliation.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {cycleCounts.map((count) => {
                const isPending = count.status === 'PENDING_APPROVAL';
                const isPosted = count.status === 'POSTED';
                const isInProgress = count.status === 'IN_PROGRESS';

                return (
                  <div 
                    key={count._id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:border-amber-300 transition-all space-y-4"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-xl font-mono font-bold text-sm">
                          {count.countNumber}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{count.warehouse}</span>
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                              isPosted ? 'bg-emerald-100 text-emerald-800' :
                              isPending ? 'bg-amber-100 text-amber-800 animate-pulse' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {count.status.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Assigned to: <strong className="text-slate-700">{count.assignedCounter}</strong> • Created: {new Date(count.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Net Variance Qty</span>
                          <strong className={`font-mono text-sm ${count.totalVarianceQuantity < 0 ? 'text-rose-600' : count.totalVarianceQuantity > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                            {count.totalVarianceQuantity > 0 ? `+${count.totalVarianceQuantity}` : count.totalVarianceQuantity} Units
                          </strong>
                        </div>

                        <div className="text-right">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Valuation Impact</span>
                          <strong className={`font-mono text-sm ${count.totalVarianceValue < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                            ₹{Math.abs(count.totalVarianceValue || 0).toLocaleString('en-IN')}
                          </strong>
                        </div>

                        <div className="flex items-center gap-2">
                          {(isInProgress || isPending) && (
                            <button
                              onClick={() => setActiveCountSheet(count)}
                              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Enter / Review Count
                            </button>
                          )}

                          {isPending && (
                            <button
                              onClick={() => handlePostReconciliation(count._id)}
                              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/20"
                            >
                              <Check className="w-3.5 h-3.5" /> Approve & Post
                            </button>
                          )}

                          {isPosted && (
                            <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold inline-flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Reconciled & Audited
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {count.items?.map((it: any, i: number) => (
                        <div key={i} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-800 block truncate max-w-[170px]">{it.productName}</span>
                            <span className="font-mono text-[11px] text-amber-600">{it.batchNumber}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[11px] text-slate-400">Sys: {it.systemQuantity} / Count: {it.countedQuantity ?? '—'}</span>
                            <span className={`block font-bold font-mono text-[11px] ${
                              it.variance < 0 ? 'text-rose-600' : it.variance > 0 ? 'text-emerald-600' : 'text-slate-500'
                            }`}>
                              {it.variance !== undefined && it.variance !== 0 ? `${it.variance > 0 ? '+' : ''}${it.variance}` : 'Match (0)'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: INTER-WAREHOUSE TRANSFER ORDERS */}
      {/* ========================================================================= */}
      {activeTab === 'TRANSFERS' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-3xl border border-blue-200/60">
            <div>
              <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-[11px] font-bold uppercase tracking-wider">
                Multi-Facility Movement
              </span>
              <h3 className="text-xl font-bold text-slate-900 mt-2">Formal Inter-Warehouse Transfer Orders</h3>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                Track stock across multiple manufacturing plants, depots, and distribution hubs. Features route-based dispatch, E-Way Bill tracking, intermediate in-transit holding, and destination receipt verification with shortage logging.
              </p>
            </div>
            <button
              onClick={() => setIsCreateTransferOpen(true)}
              className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 text-xs transition-all shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> New Transfer Order
            </button>
          </div>

          {loadingTransfers ? (
            <div className="flex items-center justify-center py-20 bg-white rounded-2xl border border-slate-200">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : transfers.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 space-y-3">
              <Truck className="w-12 h-12 text-slate-300 mx-auto" />
              <h4 className="text-base font-bold text-slate-700">No Inter-Warehouse Transfers</h4>
              <p className="text-xs text-slate-500">Draft a transfer order to move inventory between plants or distribution hubs.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {transfers.map((sto) => {
                const isDispatched = sto.status === 'DISPATCHED';
                const isDraft = sto.status === 'DRAFT';
                const isReceived = sto.status === 'RECEIVED';

                return (
                  <div
                    key={sto._id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 hover:border-blue-300 transition-all"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <Link href={`/dashboard/inventory/transfers/${sto._id}`} className="p-3 bg-blue-50 text-blue-600 rounded-xl font-mono font-bold text-sm hover:underline">
                          {sto.transferNumber}
                        </Link>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">
                              {sto.fromWarehouse} <ArrowRight className="w-3.5 h-3.5 inline text-slate-400" /> {sto.toWarehouse}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                              isDispatched ? 'bg-amber-100 text-amber-800 animate-pulse' :
                              isReceived ? 'bg-emerald-100 text-emerald-800' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {isDispatched ? 'IN-TRANSIT' : sto.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Created by: <strong className="text-slate-700">{sto.createdByName}</strong> • E-Way Bill: <span className="font-mono text-slate-700">{sto.ewayBillNumber || 'N/A'}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right hidden sm:block">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Logistics Driver</span>
                          <span className="text-xs font-bold text-slate-800">{sto.driverName || 'Internal Fleet'}</span>
                          <span className="text-[11px] text-slate-500 font-mono block">{sto.vehicleNumber}</span>
                        </div>

                        {isDraft && (
                          <button
                            onClick={() => handleDispatchTransfer(sto._id)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <Send className="w-3.5 h-3.5" /> Dispatch Shipment
                          </button>
                        )}

                        {isDispatched && (
                          <button
                            onClick={() => {
                              setActiveReceiptModal(sto);
                              const initRec: any = {};
                              sto.items.forEach((it: any, i: number) => {
                                initRec[i] = it.dispatchedQuantity;
                              });
                              setReceiptForm(initRec);
                            }}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/20"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Confirm Goods Receipt
                          </button>
                        )}

                        {isReceived && (
                          <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold inline-flex items-center gap-1.5">
                            <Check className="w-4 h-4 text-emerald-600" /> Stock Received & Credited
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {sto.items?.map((it: any, idx: number) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-800 block">{it.productName}</span>
                            <span className="font-mono text-[11px] text-blue-600">{it.batchNumber}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[11px] text-slate-400 block">Transfer Qty</span>
                            <strong className="font-mono text-sm text-slate-900">{it.dispatchedQuantity} Units</strong>
                            {it.shortageQuantity > 0 && (
                              <span className="text-[11px] font-bold text-rose-600 block">
                                Shortage: {it.shortageQuantity} units
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: VALUATION METHODS & AUTO-REPLENISHMENT (ROP) */}
      {/* ========================================================================= */}
      {activeTab === 'VALUATION_REPLENISH' && (
        <div className="space-y-8">
          {/* Section 1: Valuation Comparison */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 p-6 rounded-3xl border border-emerald-200/60 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="px-3 py-1 bg-emerald-600 text-white rounded-full text-[11px] font-bold uppercase tracking-wider">
                  Finance Ledger Integration
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-2">Multi-Method Inventory Valuation & COGS Engine</h3>
                <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                  Compare inventory valuation across FIFO, Moving Weighted Average (WAC), and LIFO. Values only batches with a cost; COGS is posted automatically when material is issued and goods are dispatched.
                </p>
              </div>

              {valuationData?.withoutCost?.batches > 0 && (
                <span className="text-xs font-semibold text-amber-800 bg-amber-100 px-3 py-2 rounded-xl">
                  {valuationData.withoutCost.batches} batch{valuationData.withoutCost.batches > 1 ? 'es' : ''} ({valuationData.withoutCost.quantity} units) have no cost and are not in these values
                </span>
              )}
            </div>

            {/* Valuation Methods Comparison Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {/* FIFO */}
              <div className={`p-5 rounded-2xl border transition-all ${
                valuationData?.activeCorporateMethod === 'FIFO'
                  ? 'bg-white border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                  : 'bg-white/70 border-slate-200'
              }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Standard AS-2 / Ind-AS</span>
                    <strong className="text-base font-bold text-slate-900">FIFO (First-In, First-Out)</strong>
                  </div>
                  {valuationData?.activeCorporateMethod === 'FIFO' && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full">
                      ACTIVE POLICY
                    </span>
                  )}
                </div>

                <div className="mt-4 space-y-1">
                  <span className="text-xs text-slate-500">Balance Sheet Asset Worth:</span>
                  <p className="text-2xl font-bold text-slate-900 font-mono">
                    ₹{(valuationData?.methods?.FIFO?.totalValuation ?? 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Average Unit Cost: <strong className="font-mono text-slate-800">₹{(valuationData?.methods?.FIFO?.averageUnitCost ?? 0).toLocaleString('en-IN')}</strong>
                  </p>
                </div>

                {valuationData?.activeCorporateMethod !== 'FIFO' && (
                  <button
                    onClick={() => handleSetValuationMethod('FIFO')}
                    className="mt-4 w-full py-2 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-200"
                  >
                    Set as Corporate Method
                  </button>
                )}
              </div>

              {/* WEIGHTED AVERAGE */}
              <div className={`p-5 rounded-2xl border transition-all ${
                valuationData?.activeCorporateMethod === 'WEIGHTED_AVERAGE'
                  ? 'bg-white border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                  : 'bg-white/70 border-slate-200'
              }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Moving Blended Average</span>
                    <strong className="text-base font-bold text-slate-900">Weighted Average (WAC)</strong>
                  </div>
                  {valuationData?.activeCorporateMethod === 'WEIGHTED_AVERAGE' && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full">
                      ACTIVE POLICY
                    </span>
                  )}
                </div>

                <div className="mt-4 space-y-1">
                  <span className="text-xs text-slate-500">Balance Sheet Asset Worth:</span>
                  <p className="text-2xl font-bold text-slate-900 font-mono">
                    ₹{(valuationData?.methods?.WEIGHTED_AVERAGE?.totalValuation ?? 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Blended Unit Cost: <strong className="font-mono text-slate-800">₹{(valuationData?.methods?.WEIGHTED_AVERAGE?.averageUnitCost ?? 0).toLocaleString('en-IN')}</strong>
                  </p>
                </div>

                {valuationData?.activeCorporateMethod !== 'WEIGHTED_AVERAGE' && (
                  <button
                    onClick={() => handleSetValuationMethod('WEIGHTED_AVERAGE')}
                    className="mt-4 w-full py-2 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-200"
                  >
                    Set as Corporate Method
                  </button>
                )}
              </div>

              {/* LIFO */}
              <div className={`p-5 rounded-2xl border transition-all ${
                valuationData?.activeCorporateMethod === 'LIFO'
                  ? 'bg-white border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                  : 'bg-white/70 border-slate-200'
              }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Inflation Hedge</span>
                    <strong className="text-base font-bold text-slate-900">LIFO (Last-In, First-Out)</strong>
                  </div>
                  {valuationData?.activeCorporateMethod === 'LIFO' && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full">
                      ACTIVE POLICY
                    </span>
                  )}
                </div>

                <div className="mt-4 space-y-1">
                  <span className="text-xs text-slate-500">Balance Sheet Asset Worth:</span>
                  <p className="text-2xl font-bold text-slate-900 font-mono">
                    ₹{(valuationData?.methods?.LIFO?.totalValuation ?? 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    LIFO Unit Cost: <strong className="font-mono text-slate-800">₹{(valuationData?.methods?.LIFO?.averageUnitCost ?? 0).toLocaleString('en-IN')}</strong>
                  </p>
                </div>

                {valuationData?.activeCorporateMethod !== 'LIFO' && (
                  <button
                    onClick={() => handleSetValuationMethod('LIFO')}
                    className="mt-4 w-full py-2 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-200"
                  >
                    Set as Corporate Method
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: COGS Journal Postings to General Ledger */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">COGS & Inventory Journal Entries in General Ledger</h4>
                  <p className="text-xs text-slate-500">Automated double-entries: Dr 5010 (Procurement COGS) / Cr 1030 (Inventory Asset)</p>
                </div>
              </div>
              <Link
                href="/dashboard/finance"
                className="text-xs font-bold text-indigo-600 hover:underline inline-flex items-center gap-1"
              >
                Open Finance Ledger <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                    <th className="py-3 px-4">Entry #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Description & Movement</th>
                    <th className="py-3 px-4">Valuation Method</th>
                    <th className="py-3 px-4 text-right">Debit COGS / Credit Inv</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {valuationData?.recentCOGSJournalEntries?.map((je: any) => (
                    <tr key={je._id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-600">{je.entryNumber}</td>
                      <td className="py-3 px-4 text-slate-500">{new Date(je.date).toLocaleDateString()}</td>
                      <td className="py-3 px-4 text-slate-800 font-bold">{je.description}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-mono text-[11px] rounded font-bold">
                          {je.valuationMethod || 'FIFO'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        ₹{(je.cogsAmount || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[11px]">
                          {je.status || 'POSTED'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: reorder-level check */}
          <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 p-6 rounded-3xl border border-indigo-200/60 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="px-3 py-1 bg-indigo-600 text-white rounded-full text-[11px] font-bold uppercase tracking-wider">
                  Reorder level
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-2">Reorder-level check (bought items)</h3>
                <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                  Items whose free stock plus open purchase orders and open indents is at or below the reorder level set in the item master. The check raises one purchase indent for enough to reach reorder level + safety stock; supplier, price and approval follow on the way to a purchase order. Items made from a BOM are left to MRP.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleTriggerROPScan}
                  disabled={isScanningROP || !replenishData?.due?.length}
                  className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 text-xs transition-all shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Zap className={`w-4 h-4 ${isScanningROP ? 'animate-spin' : ''}`} />
                  {isScanningROP ? 'Checking…' : `Raise indent${replenishData?.due?.length ? ` (${replenishData.due.length} item${replenishData.due.length > 1 ? 's' : ''})` : ''}`}
                </button>
              </div>
            </div>

            {/* Due now, and indents raised by earlier checks */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">At or below reorder level now</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                      <th className="py-2.5 px-3">Item</th><th className="py-2.5 px-3 text-right">Free stock</th><th className="py-2.5 px-3 text-right">On PO</th>
                      <th className="py-2.5 px-3 text-right">On indent</th><th className="py-2.5 px-3 text-right">Reorder at</th><th className="py-2.5 px-3 text-right">Safety</th><th className="py-2.5 px-3 text-right">To indent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {(replenishData?.due || []).map((d: any) => (
                      <tr key={d.product}>
                        <td className="py-2.5 px-3"><b>{d.sku}</b> {d.name}</td><td className="py-2.5 px-3 text-right">{d.available}</td><td className="py-2.5 px-3 text-right">{d.onOrder || ''}</td>
                        <td className="py-2.5 px-3 text-right">{d.onIndent || ''}</td><td className="py-2.5 px-3 text-right">{d.reorderLevel}</td><td className="py-2.5 px-3 text-right">{d.safetyStock || ''}</td>
                        <td className="py-2.5 px-3 text-right font-bold">{d.orderQty} {d.uom}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!replenishData?.due?.length && <p className="text-xs text-slate-500 py-3 text-center">No bought item is at or below its reorder level. Items with no reorder level set in the item master are not checked.</p>}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Indents raised by reorder checks</h4>
                <Link href="/dashboard/procurement" className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">Open in Procurement <ArrowRight className="w-3.5 h-3.5" /></Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                      <th className="py-2.5 px-3">Indent</th><th className="py-2.5 px-3">Raised</th><th className="py-2.5 px-3">Items</th><th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {(replenishData?.indents || []).map((ind: any) => (
                      <tr key={ind._id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3"><Link href={`/dashboard/procurement/indents/${ind._id}`} className="font-mono font-bold text-indigo-600 hover:underline">{ind.number}</Link></td>
                        <td className="py-2.5 px-3 text-slate-500">{new Date(ind.createdAt).toLocaleDateString('en-IN')} · {ind.requestedBy}</td>
                        <td className="py-2.5 px-3">{(ind.items || []).map((i: any) => `${i.product?.sku || 'Item'} × ${i.quantity}`).join(', ')}</td>
                        <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-bold text-[11px] uppercase">{String(ind.status).replace(/_/g, ' ')}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!replenishData?.indents?.length && <p className="text-xs text-slate-500 py-3 text-center">No indents raised by reorder checks yet.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: START CYCLE COUNT SHEET */}
      {/* ========================================================================= */}
      {isCreateCountOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleIn">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Initiate Cycle Count Sheet</h3>
                  <p className="text-xs text-slate-500">Freezes current system balance for selected location</p>
                </div>
              </div>
              <button onClick={() => setIsCreateCountOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-medium">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Target Warehouse Location / Rack</label>
                <select
                  value={newCountForm.warehouse}
                  onChange={(e) => setNewCountForm({ ...newCountForm, warehouse: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-bold"
                >
                  <option value="All Locations">All Locations (Full Partial Sweep)</option>
                  <option value="Rack A-01 (Frames)">Rack A-01 (Frames)</option>
                  <option value="Bay B-03 (Drivetrains)">Bay B-03 (Drivetrains)</option>
                  <option value="Store Room C (Finished Bikes)">Store Room C (Finished Bikes)</option>
                  <option value="Central Raw Material Depot">Central Raw Material Depot</option>
                  <option value="Plant 1 - Main Assembly Line">Plant 1 - Main Assembly Line</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Assigned Auditor / Floor Counter</label>
                <input
                  type="text"
                  value={newCountForm.assignedCounter}
                  onChange={(e) => setNewCountForm({ ...newCountForm, assignedCounter: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-bold"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button onClick={() => setIsCreateCountOpen(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">
                Cancel
              </button>
              <button
                onClick={handleCreateCycleCount}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <FileCheck2 className="w-4 h-4" /> Generate Count Sheet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PHYSICAL COUNT ENTRY & VARIANCE REVIEW */}
      {/* ========================================================================= */}
      {activeCountSheet && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Physical Stock Count: {activeCountSheet.countNumber}</h3>
                  <p className="text-xs text-slate-500">Location: {activeCountSheet.warehouse} • Counter: {activeCountSheet.assignedCounter}</p>
                </div>
              </div>
              <button onClick={() => setActiveCountSheet(null)} className="text-slate-400 hover:text-slate-600 font-bold">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200/50 text-xs text-amber-900">
                <strong>Count Instructions:</strong> Walk the target rack or bin and enter the actual counted physical units. The system will calculate variances and total valuation impact in real time.
              </div>

              <div className="space-y-3">
                {activeCountSheet.items?.map((it: any, index: number) => {
                  const currentCount = it.countedQuantity !== undefined ? it.countedQuantity : it.systemQuantity;
                  const variance = currentCount - it.systemQuantity;
                  const varianceVal = variance * (it.unitCost || 0);

                  return (
                    <div key={index} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <strong className="text-sm font-bold text-slate-900 block">{it.productName}</strong>
                          <span className="text-[11px] font-mono text-amber-600">{it.batchNumber}</span>
                          <span className="text-[11px] text-slate-400 ml-2">{it.unitCost ? `(@ ₹${it.unitCost.toLocaleString('en-IN')}/unit)` : '(no cost on this batch)'}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Frozen System Qty</span>
                          <span className="font-bold text-sm text-slate-700 font-mono">{it.systemQuantity} Units</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center pt-2 border-t border-slate-200/60">
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">Physical Counted Quantity</label>
                          <input
                            type="number"
                            value={currentCount}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              const updatedItems = [...activeCountSheet.items];
                              updatedItems[index] = {
                                ...updatedItems[index],
                                countedQuantity: val
                              };
                              setActiveCountSheet({ ...activeCountSheet, items: updatedItems });
                            }}
                            className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-xl font-mono font-bold text-sm outline-none focus:border-amber-500"
                          />
                        </div>

                        <div className="text-right sm:pr-2">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Variance & Impact</span>
                          <strong className={`font-mono text-sm block ${
                            variance < 0 ? 'text-rose-600' : variance > 0 ? 'text-emerald-600' : 'text-slate-700'
                          }`}>
                            {variance > 0 ? `+${variance}` : variance} Units (₹{varianceVal.toLocaleString('en-IN')})
                          </strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => handleSubmitCycleCount(activeCountSheet._id, activeCountSheet.items, false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-all"
              >
                Save Draft Progress
              </button>

              <div className="flex items-center gap-2">
                <button onClick={() => setActiveCountSheet(null)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl text-xs">
                  Close
                </button>
                <button
                  onClick={() => handleSubmitCycleCount(activeCountSheet._id, activeCountSheet.items, true)}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" /> Submit for Reconciliation Approval
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE INTER-WAREHOUSE TRANSFER ORDER */}
      {/* ========================================================================= */}
      {isCreateTransferOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-600">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">New Inter-Warehouse Transfer Order</h3>
                  <p className="text-xs text-slate-500">Dispatches inventory with route-based in-transit tracking</p>
                </div>
              </div>
              <button onClick={() => setIsCreateTransferOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-medium">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Origin Facility / Depot</label>
                  <select
                    value={newTransferForm.fromWarehouse}
                    onChange={(e) => setNewTransferForm({ ...newTransferForm, fromWarehouse: e.target.value, selectedBatchId: '' })}
                    className="w-full px-3 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-bold"
                  >
                    <option value="">-- Choose storage location --</option>
                    {locations.map((l: any) => <option key={l.code} value={l.code}>{l.code} - {l.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Destination Facility</label>
                  <select
                    value={newTransferForm.toWarehouse}
                    onChange={(e) => setNewTransferForm({ ...newTransferForm, toWarehouse: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-bold"
                  >
                    <option value="">-- Choose storage location --</option>
                    {locations.filter((l: any) => l.code !== newTransferForm.fromWarehouse).map((l: any) => <option key={l.code} value={l.code}>{l.code} - {l.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Select Stock Batch to Transfer</label>
                <select
                  value={newTransferForm.selectedBatchId}
                  onChange={(e) => setNewTransferForm({ ...newTransferForm, selectedBatchId: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-bold"
                >
                  <option value="">{newTransferForm.fromWarehouse ? '-- Choose Origin Batch --' : '-- Choose the origin location first --'}</option>
                  {safeBatches.filter(b => newTransferForm.fromWarehouse && b.store === newTransferForm.fromWarehouse && (b.currentQuantity || 0) - (b.allocatedQuantity || 0) > 0).map(b => (
                    <option key={b._id} value={b._id}>
                      {b.product?.name || 'Item'} ({b.batchNumber}) — Avail: {(b.currentQuantity || 0) - (b.allocatedQuantity || 0)} Units
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Transfer Quantity</label>
                <input
                  type="number"
                  value={newTransferForm.quantity}
                  onChange={(e) => setNewTransferForm({ ...newTransferForm, quantity: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-mono font-bold"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Carrier Name</label>
                  <input
                    type="text"
                    value={newTransferForm.carrier}
                    onChange={(e) => setNewTransferForm({ ...newTransferForm, carrier: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Vehicle Number</label>
                  <input
                    type="text"
                    value={newTransferForm.vehicleNumber}
                    onChange={(e) => setNewTransferForm({ ...newTransferForm, vehicleNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Driver Name</label>
                  <input
                    type="text"
                    value={newTransferForm.driverName}
                    onChange={(e) => setNewTransferForm({ ...newTransferForm, driverName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Driver Phone</label>
                  <input
                    type="text"
                    value={newTransferForm.driverPhone}
                    onChange={(e) => setNewTransferForm({ ...newTransferForm, driverPhone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-mono font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button onClick={() => setIsCreateTransferOpen(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">
                Cancel
              </button>
              <button
                onClick={handleCreateTransfer}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Save Transfer Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DESTINATION GOODS RECEIPT VERIFICATION */}
      {/* ========================================================================= */}
      {activeReceiptModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleIn">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Confirm Warehouse Receipt</h3>
                  <p className="text-xs text-slate-500">Order: {activeReceiptModal.transferNumber}</p>
                </div>
              </div>
              <button onClick={() => setActiveReceiptModal(null)} className="text-slate-400 hover:text-slate-600 font-bold">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-slate-600">Destination: <strong className="text-slate-900">{activeReceiptModal.toWarehouse}</strong></p>
                <p className="text-slate-600">Arriving Vehicle: <strong className="text-slate-900 font-mono">{activeReceiptModal.vehicleNumber}</strong></p>
              </div>

              <div className="space-y-3">
                {activeReceiptModal.items?.map((it: any, i: number) => {
                  const rec = receiptForm[i] !== undefined ? receiptForm[i] : it.dispatchedQuantity;
                  const shortage = it.dispatchedQuantity - rec;

                  return (
                    <div key={i} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                      <div className="flex justify-between">
                        <span className="font-bold text-slate-900">{it.productName}</span>
                        <span className="text-slate-500 font-mono">Dispatched: {it.dispatchedQuantity}</span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <label className="font-bold text-slate-700">Received Count:</label>
                        <input
                          type="number"
                          value={rec}
                          onChange={(e) => setReceiptForm({ ...receiptForm, [i]: Number(e.target.value) })}
                          className="w-24 px-3 py-1.5 bg-slate-50 text-slate-900 border border-slate-300 rounded-lg font-mono font-bold text-sm text-center"
                        />
                      </div>

                      {shortage > 0 && (
                        <p className="text-[11px] font-bold text-rose-600">
                          Shortage: {shortage} units will be logged as transit loss.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button onClick={() => setActiveReceiptModal(null)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl text-xs">
                Cancel
              </button>
              <button
                onClick={handleConfirmReceipt}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" /> Accept Stock Into Warehouse
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECEIVE NEW BATCH MODAL (GRN) */}
      {isReceiveModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleIn">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600">
                  <Package className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Receive New Stock Batch (GRN)</h3>
              </div>
              <button onClick={() => setIsReceiveModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-medium">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Select Product / Component</label>
                <select
                  value={newBatchData.productName}
                  onChange={(e) => setNewBatchData({ ...newBatchData, productName: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-bold"
                >
                  <option value="High-Grade Alloy Frame T6">High-Grade Alloy Frame T6 (RAW-FRM-001)</option>
                  <option value="Shimano Deore 11-Speed Drivetrain">Shimano Deore 11-Speed Drivetrain (CMP-DRV-001)</option>
                  <option value="Hydraulic Disc Brake Set">Hydraulic Disc Brake Set (CMP-BRK-002)</option>
                  <option value="Apex Urban Commuter Bicycle">Apex Urban Commuter Bicycle (BIK-URB-001)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Batch Number</label>
                  <input
                    type="text"
                    value={newBatchData.batchNumber}
                    onChange={(e) => setNewBatchData({ ...newBatchData, batchNumber: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-mono font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Inward Quantity</label>
                  <input
                    type="number"
                    value={newBatchData.quantity}
                    onChange={(e) => setNewBatchData({ ...newBatchData, quantity: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-mono font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">
                  Warehouse Location / Rack Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rack A-01 (Frames) or Bay D-14"
                  value={newBatchData.location}
                  onChange={(e) => setNewBatchData({ ...newBatchData, location: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-bold"
                />
                <div className="flex gap-1.5 mt-1 overflow-x-auto pt-1">
                  {['Rack A-01 (Frames)', 'Bay B-03 (Drivetrains)', 'Store Room C (Bikes)'].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNewBatchData({ ...newBatchData, location: preset })}
                      className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-bold hover:bg-slate-200"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Min Safety Threshold</label>
                <input
                  type="number"
                  value={newBatchData.minSafetyStock}
                  onChange={(e) => setNewBatchData({ ...newBatchData, minSafetyStock: Number(e.target.value) })}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-mono font-bold"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button onClick={() => setIsReceiveModalOpen(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">
                Cancel
              </button>
              <button
                onClick={handleReceiveNewBatch}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Save Inward Batch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHANGE / TRANSFER LOCATION MODAL */}
      {transferBatch && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleIn">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Change Warehouse Location</h3>
                  <p className="text-xs text-slate-500 font-mono">Batch: {transferBatch.batchNumber}</p>
                </div>
              </div>
              <button onClick={() => setTransferBatch(null)} className="text-slate-400 hover:text-slate-600 font-bold">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-medium">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex justify-between items-center">
                <span className="text-slate-500">Current Location:</span>
                <strong className="text-slate-900 font-bold text-sm">{transferBatch.location || 'Rack A-01'}</strong>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">
                  New Location / Rack Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bay D-09, Overflow Store 3, Rack B-12"
                  value={targetLocation}
                  onChange={(e) => setTargetLocation(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-bold text-sm"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['Rack A-01 (Frames)', 'Bay B-03 (Drivetrains)', 'Store Room C (Bikes)', 'Overflow Yard Delta', 'Assembly Bay 4'].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTargetLocation(preset)}
                      className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-bold hover:bg-slate-200 transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button onClick={() => setTransferBatch(null)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">
                Cancel
              </button>
              <button
                onClick={handleTransferLocation}
                disabled={!targetLocation.trim()}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" /> Save New Location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Details Modal */}
      <BatchDetailModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        batch={selectedBatch} 
      />
    </div>
  );
}
