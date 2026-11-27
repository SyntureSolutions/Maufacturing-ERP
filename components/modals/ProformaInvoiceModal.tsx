'use client';

import React, { useRef, useState } from 'react';
import { 
  X, 
  Printer, 
  Download, 
  Building, 
  FileText, 
  Calendar, 
  ShieldAlert, 
  CheckCircle2,
  Mail,
  MapPin,
  Phone,
  Hash,
  Send,
  Lock,
  ArrowRight
} from 'lucide-react';

interface ProformaInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  onRequestTaxInvoice?: (orderId: string) => void;
}

export default function ProformaInvoiceModal({ 
  isOpen, 
  onClose, 
  order,
  onRequestTaxInvoice 
}: ProformaInvoiceModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestedSuccess, setRequestedSuccess] = useState(false);

  if (!isOpen || !order) return null;

  const customerName = order.customerName || order.customer?.name || 'Valued Commercial Client';
  const customerGst = order.customer?.gstNumber || '27AABCP8921K1Z3';
  const customerAddress = order.customer?.address || 'Metro Logistics Complex, Pune, Maharashtra, 411019';
  const items = order.items || [];
  
  const subtotal = items.reduce((sum: number, it: any) => sum + (it.totalPrice || (it.quantity * it.unitPrice) || 0), 0) || order.totalAmount || 500000;
  const indicativeGst = Math.round(subtotal * 0.18);
  const grandEstimate = subtotal + indicativeGst;

  const proformaNumber = order.proformaNumber || `PI-2026-${String(order.soNumber || order.quoteNumber || '001').replace(/\D/g, '').slice(-4) || '104'}`;
  const issueDate = order.proformaIssuedAt 
    ? new Date(order.proformaIssuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const isAlreadyInvoiced = order.taxInvoiceStatus === 'INVOICED';
  const isTaxInvoiceRequested = order.taxInvoiceStatus === 'REQUESTED' || requestedSuccess;

  const handlePrint = () => {
    if (!printRef.current) return;
    const content = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Pro-Forma Invoice - ${proformaNumber}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #1e293b;
              margin: 0;
              padding: 24px;
              line-height: 1.5;
            }
            .watermark {
              border: 2px dashed #f59e0b;
              background-color: #fef3c7;
              color: #92400e;
              padding: 10px 16px;
              border-radius: 8px;
              text-align: center;
              font-weight: 800;
              font-size: 13px;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              margin-bottom: 20px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 16px;
            }
            th {
              background-color: #f8fafc;
              border-bottom: 2px solid #cbd5e1;
              padding: 10px;
              text-align: left;
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
            }
            td {
              padding: 10px;
              border-bottom: 1px solid #e2e8f0;
              font-size: 12px;
            }
            .text-right { text-align: right; }
            .font-mono { font-family: monospace; }
            .totals { margin-top: 20px; width: 320px; margin-left: auto; }
            .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
            .totals-row.grand { border-top: 2px solid #0f172a; font-weight: 800; font-size: 15px; }
          </style>
        </head>
        <body>
          <div class="watermark">
            ⚠️ COMMERCIAL PRO-FORMA INVOICE — NOT A LEGAL TAX INVOICE (NON-FISCAL ESTIMATE)
          </div>
          ${content}
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleRequestTaxInvoice = async () => {
    const orderId = order._id || order.soNumber || order.quoteNumber;
    if (!orderId) return;
    setRequesting(true);

    // Optimistic immediate update
    order.taxInvoiceStatus = 'REQUESTED';
    setRequestedSuccess(true);

    // Broadcast immediately to Finance Manager tab across windows
    try {
      if (typeof window !== 'undefined') {
        const channel = new BroadcastChannel('erp_sales_finance_events');
        channel.postMessage({
          type: 'TAX_INVOICE_REQUESTED',
          orderId,
          soNumber: order.soNumber || order.quoteNumber || 'SO-2026-NEW',
          customerName: customerName,
          totalAmount: subtotal,
          timestamp: Date.now()
        });
        channel.close();

        localStorage.setItem('erp_tax_invoice_requested_ping', JSON.stringify({
          orderId,
          soNumber: order.soNumber || order.quoteNumber || 'SO-2026-NEW',
          customerName: customerName,
          totalAmount: subtotal,
          timestamp: Date.now()
        }));
      }
    } catch (broadcastErr) {
      console.warn('Broadcast to finance failed:', broadcastErr);
    }

    if (onRequestTaxInvoice) {
      onRequestTaxInvoice(orderId);
    }

    try {
      const res = await fetch('/api/sales/proforma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REQUEST_TAX_INVOICE',
          salesOrderId: orderId,
        }),
      });
      if (res.ok) {
        setRequestedSuccess(true);
      }
    } catch (e) {
      console.error('Failed to request tax invoice:', e);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] animate-scaleIn">
        
        {/* Modal Top Bar */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">Commercial Pro-Forma Invoice</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950 uppercase tracking-wider">
                  Sales Document
                </span>
              </div>
              <p className="text-xs text-slate-400">Issued by Sales Department for commercial confirmation & advance deposit</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Compliance Guard Alert Banner */}
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-start gap-3 text-amber-900">
          <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <span className="font-bold uppercase tracking-wider text-amber-800">
              Separation of Quote vs. Tax Invoice Compliance Gate:
            </span>
            <p className="text-amber-700">
              This document is a <strong>Pro-Forma Quotation (Estimate)</strong>. It is <em>not</em> an official GST Tax Invoice and does not carry tax credit liability. Only the <strong>Finance Department</strong> can legally generate the final GST Tax Invoice with HSN breakdown.
            </p>
          </div>
        </div>

        {/* Real-Time Request Status Alert */}
        {(requestedSuccess || isTaxInvoiceRequested) && (
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 flex items-center justify-between shadow-md animate-fadeIn">
            <div className="flex items-center gap-2.5 text-xs font-bold">
              <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
              <span>
                ⚡ TAX INVOICE REQUESTED: Order has been placed in Finance Central Billing Queue!
              </span>
            </div>
            <span className="text-[11px] font-mono font-bold bg-white/20 text-white px-2.5 py-1 rounded-full uppercase tracking-wider">
              Status: REQUESTED
            </span>
          </div>
        )}

        {/* Document Body (Printable Area) */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/50" ref={printRef}>
          
          {/* Printable Watermark */}
          <div className="border-2 border-dashed border-amber-300 bg-amber-50/70 p-3 rounded-2xl text-center">
            <p className="text-xs font-bold text-amber-800 tracking-wider uppercase">
              ★ PRO-FORMA INVOICE (COMMERCIAL ESTIMATE ONLY — NOT A STATUTORY TAX INVOICE) ★
            </p>
          </div>

          {/* Letterhead */}
          <div className="flex justify-between items-start border-b border-slate-200 pb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-slate-950">APEX VELO MFG LTD</span>
                <span className="text-[11px] font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded">SALES DIVISION</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">Plot 45, Chakan Industrial Area, Phase II</p>
              <p className="text-xs text-slate-500">Pune, Maharashtra, India - 410501</p>
              <p className="text-xs font-mono text-slate-600 mt-1">GSTIN: 27AABCA1234F1ZP | State Code: 27</p>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-slate-900 font-mono">{proformaNumber}</div>
              <p className="text-xs text-slate-500 mt-1">Date: <span className="font-semibold text-slate-800">{issueDate}</span></p>
              {order.soNumber && (
                <p className="text-xs text-slate-500">Sales Order Ref: <span className="font-mono font-bold text-slate-800">{order.soNumber}</span></p>
              )}
              {order.poNumber && (
                <p className="text-xs text-slate-500">Buyer PO: <span className="font-mono font-bold text-slate-800">{order.poNumber}</span></p>
              )}
              {order.quotationRef && (
                <p className="text-xs text-slate-500">Quote Ref: <span className="font-mono text-slate-700">{order.quotationRef}</span></p>
              )}
            </div>
          </div>

          {/* Bill To / Ship To */}
          <div className="grid grid-cols-2 gap-6 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Bill To (Customer)</span>
              <h4 className="text-sm font-bold text-slate-900 mt-1">{customerName}</h4>
              <p className="text-xs text-slate-600 mt-1">{customerAddress}</p>
              <p className="text-xs font-mono text-slate-600 mt-1">Customer GSTIN: {customerGst}</p>
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Terms of Sale</span>
              <p className="text-xs text-slate-700 mt-1">Payment: <strong className="text-slate-900">{order.paymentTerms || 'NET 30 / Advance Deposit'}</strong></p>
              <p className="text-xs text-slate-700 mt-1">Delivery: <strong className="text-slate-900">Ex-Factory / Road Transport</strong></p>
              <p className="text-xs text-slate-700 mt-1">Status: <strong className="text-emerald-700 font-semibold">{order.status || 'CONFIRMED'}</strong></p>
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-bold uppercase">
                <tr>
                  <th className="p-3.5">#</th>
                  <th className="p-3.5">Item Description</th>
                  <th className="p-3.5 text-center">Commercial HSN</th>
                  <th className="p-3.5 text-right">Quantity</th>
                  <th className="p-3.5 text-right">Unit Price (₹)</th>
                  <th className="p-3.5 text-right">Total Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {items.length > 0 ? (
                  items.map((item: any, idx: number) => {
                    const qty = item.quantity || 1;
                    const price = item.unitPrice || 0;
                    const total = item.totalPrice || (qty * price);
                    return (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="p-3.5 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3.5 font-bold text-slate-900">
                          {item.productName || item.product?.name || 'Industrial Bicycle Unit'}
                        </td>
                        <td className="p-3.5 text-center font-mono text-slate-500">
                          {item.hsnCode || '87120010'}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-900">{qty}</td>
                        <td className="p-3.5 text-right font-mono">₹{price.toLocaleString('en-IN')}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-950">₹{total.toLocaleString('en-IN')}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="p-3.5 text-slate-400 font-mono">1</td>
                    <td className="p-3.5 font-bold text-slate-900">Bicycle Assemblies & Sub-components</td>
                    <td className="p-3.5 text-center font-mono text-slate-500">87120010</td>
                    <td className="p-3.5 text-right font-mono font-bold text-slate-900">1</td>
                    <td className="p-3.5 text-right font-mono">₹{subtotal.toLocaleString('en-IN')}</td>
                    <td className="p-3.5 text-right font-mono font-bold text-slate-950">₹{subtotal.toLocaleString('en-IN')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Calculations Summary */}
          <div className="flex justify-between items-start pt-2">
            <div className="bg-slate-100 p-4 rounded-2xl max-w-sm text-[11px] text-slate-600 space-y-1">
              <span className="font-bold text-slate-800 uppercase block">Banking & Remittance Info</span>
              <p>Bank: <strong>HDFC Industrial Banking Pune</strong></p>
              <p>A/C No: <strong className="font-mono">5020009823412</strong></p>
              <p>IFSC: <strong className="font-mono">HDFC0001243</strong></p>
              <p className="text-[11px] text-slate-500 italic mt-1">Please quote {proformaNumber} in payment transfer narration.</p>
            </div>

            <div className="w-72 space-y-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex justify-between text-xs text-slate-600">
                <span>Commercial Subtotal:</span>
                <span className="font-mono font-bold text-slate-900">₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Indicative Tax (18% GST):</span>
                <span className="font-mono text-slate-700">₹{indicativeGst.toLocaleString('en-IN')}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-bold text-slate-950">
                <span>Total Commercial Estimate:</span>
                <span className="font-mono text-amber-700">₹{grandEstimate.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Declarations */}
          <div className="text-[11px] text-slate-400 border-t border-slate-200 pt-4 leading-relaxed">
            <strong>Declarations:</strong> 1. This Pro-Forma Invoice is valid for 30 days from date of issuance. 2. Prices are subject to final supply availability. 3. Legal GST Tax Invoice will be issued separately by Finance upon dispatch or receipt of confirmed billing cycle under Indian GST regulations.
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="bg-slate-100 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isAlreadyInvoiced ? (
              <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1.5 border border-emerald-200">
                <CheckCircle2 className="w-4 h-4" />
                Officially Tax Invoiced by Finance ({order.taxInvoiceNumber || 'INV-2026-001'})
              </span>
            ) : isTaxInvoiceRequested ? (
              <span className="px-3 py-1.5 rounded-xl bg-blue-100 text-blue-800 font-bold text-xs flex items-center gap-1.5 border border-blue-200">
                <CheckCircle2 className="w-4 h-4" />
                Submitted to Finance Central Billing Queue
              </span>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-amber-100 text-amber-800 font-bold text-xs flex items-center gap-1.5 border border-amber-200">
                <Lock className="w-4 h-4" />
                Awaiting Finance Invoicing Handoff
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isAlreadyInvoiced ? (
              <button
                onClick={handleRequestTaxInvoice}
                disabled={requesting}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
                title="Resubmit / Request supplementary tax invoice from Finance"
              >
                <Send className="w-4 h-4" />
                {requesting ? 'Submitting...' : 'Re-Request Tax Invoice from Finance'}
              </button>
            ) : isTaxInvoiceRequested ? (
              <button
                onClick={handleRequestTaxInvoice}
                disabled={requesting}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {requesting ? 'Submitting...' : 'Re-Submit to Finance Queue'}
              </button>
            ) : (
              <button
                onClick={handleRequestTaxInvoice}
                disabled={requesting}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {requesting ? 'Submitting to Finance...' : 'Request Tax Invoice from Finance'}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
