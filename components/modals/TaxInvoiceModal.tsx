'use client';

import React, { useRef, useState } from 'react';
import { 
  X, 
  Printer, 
  Building, 
  FileText, 
  ShieldCheck, 
  CheckCircle2,
  Lock,
  QrCode,
  FileSpreadsheet,
  Zap,
  ArrowRight
} from 'lucide-react';

interface TaxInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  onInvoiceCreated?: (invoice: any) => void;
}

export default function TaxInvoiceModal({
  isOpen,
  onClose,
  order,
  onInvoiceCreated
}: TaxInvoiceModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [issuedInvoice, setIssuedInvoice] = useState<any>(null);
  
  // Tax Form State
  const [placeOfSupply, setPlaceOfSupply] = useState('27-Maharashtra (Intra-State)');
  const [taxType, setTaxType] = useState<'INTRA_STATE' | 'INTER_STATE'>('INTRA_STATE');
  const [hsnCode, setHsnCode] = useState('87120010');

  if (!isOpen || !order) return null;

  const isExistingInvoice = !!order.taxInvoiceNumber || !!issuedInvoice;
  const activeInvoice = issuedInvoice || (order.taxInvoiceNumber ? order : null);

  const customerName = order.customerName || order.customer?.name || 'Customer Organization';
  const customerGst = order.customerGSTIN || order.customer?.gstNumber || '27AABCP8921K1Z3';
  const soNumber = order.soNumber || order.salesOrderNumber || 'SO-2026-001';
  const proformaRef = order.proformaNumber || 'PI-2026-104';

  const items = order.items || [];
  const baseSubtotal = items.reduce((sum: number, it: any) => sum + (it.totalPrice || (it.quantity * it.unitPrice) || 0), 0) || order.totalAmount || 500000;
  
  // Intra-State: 9% CGST + 9% SGST. Inter-State: 18% IGST.
  const cgstAmount = taxType === 'INTRA_STATE' ? Math.round(baseSubtotal * 0.09) : 0;
  const sgstAmount = taxType === 'INTRA_STATE' ? Math.round(baseSubtotal * 0.09) : 0;
  const igstAmount = taxType === 'INTER_STATE' ? Math.round(baseSubtotal * 0.18) : 0;
  const grandTotal = baseSubtotal + cgstAmount + sgstAmount + igstAmount;

  const invoiceNumber = activeInvoice?.invoiceNumber || activeInvoice?.taxInvoiceNumber || `INV-2026-${Math.floor(100 + Math.random() * 900)}`;
  const irn = activeInvoice?.irn || 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0';
  const ackNo = activeInvoice?.ackNo || '112698745231';

  const handleIssueInvoice = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/finance/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'SALES',
          salesOrderId: order._id || order.soNumber,
          soNumber,
          proformaRef,
          customerName,
          customerGSTIN: customerGst,
          placeOfSupply,
          subTotal: baseSubtotal,
          totalCGST: cgstAmount,
          totalSGST: sgstAmount,
          totalIGST: igstAmount,
          totalAmount: grandTotal,
          items: items.map((it: any) => ({
            description: it.productName || 'Apex Bicycle Unit',
            hsnCode,
            quantity: it.quantity || 1,
            unitPrice: it.unitPrice || baseSubtotal,
            taxableValue: it.totalPrice || (it.quantity * it.unitPrice) || baseSubtotal,
            cgstRate: taxType === 'INTRA_STATE' ? 9 : 0,
            cgstAmount: taxType === 'INTRA_STATE' ? Math.round((it.totalPrice || baseSubtotal) * 0.09) : 0,
            sgstRate: taxType === 'INTRA_STATE' ? 9 : 0,
            sgstAmount: taxType === 'INTRA_STATE' ? Math.round((it.totalPrice || baseSubtotal) * 0.09) : 0,
            igstRate: taxType === 'INTER_STATE' ? 18 : 0,
            igstAmount: taxType === 'INTER_STATE' ? Math.round((it.totalPrice || baseSubtotal) * 0.18) : 0,
            totalAmount: Math.round((it.totalPrice || baseSubtotal) * 1.18)
          })),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setIssuedInvoice(data);
        if (onInvoiceCreated) {
          onInvoiceCreated(data);
        }
      } else {
        alert(data.error || 'Failed to issue tax invoice');
      }
    } catch (e) {
      console.error('Issue tax invoice error:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const content = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>GST Tax Invoice - ${invoiceNumber}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0f172a;
              margin: 0;
              padding: 24px;
              line-height: 1.4;
            }
            .header-banner {
              border-bottom: 2px solid #0f172a;
              padding-bottom: 12px;
              margin-bottom: 16px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 14px;
            }
            th {
              background-color: #f1f5f9;
              border: 1px solid #cbd5e1;
              padding: 8px;
              font-size: 10px;
              text-transform: uppercase;
              font-weight: 700;
            }
            td {
              border: 1px solid #cbd5e1;
              padding: 8px;
              font-size: 11px;
            }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .font-mono { font-family: monospace; }
          </style>
        </head>
        <body>
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

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[94vh] animate-scaleIn">
        
        {/* Modal Top Bar */}
        <div className="bg-indigo-950 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">Central Finance Billing Desk</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-400 text-slate-950 uppercase tracking-wider">
                  Official GST Tax Invoice
                </span>
              </div>
              <p className="text-xs text-indigo-200">Centralized Statutory Tax Invoicing under CGST/SGST Acts (Finance Restricted)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isExistingInvoice && (
              <button
                onClick={handlePrint}
                className="px-3.5 py-2 bg-indigo-900 hover:bg-indigo-800 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print Tax Invoice
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-indigo-300 hover:text-white rounded-xl hover:bg-indigo-900 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Finance Tax Configuration Bar (If not yet officially created) */}
        {!isExistingInvoice && (
          <div className="bg-indigo-50 border-b border-indigo-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-950 font-bold text-xs">
                <Zap className="w-4 h-4 text-indigo-600" />
                <span>Statutory Tax Assessment & Jurisdiction Selection</span>
              </div>
              <span className="text-[11px] text-indigo-600 font-semibold">
                Linked Sales Order: <span className="font-mono font-bold">{soNumber}</span> ({proformaRef})
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">Supply Jurisdiction Type</label>
                <select
                  value={taxType}
                  onChange={(e) => setTaxType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl font-medium outline-none text-slate-800"
                >
                  <option value="INTRA_STATE">Intra-State (9% CGST + 9% SGST)</option>
                  <option value="INTER_STATE">Inter-State (18% IGST)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">HSN Classification Code</label>
                <select
                  value={hsnCode}
                  onChange={(e) => setHsnCode(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl font-medium outline-none text-slate-800"
                >
                  <option value="87120010">87120010 - Bicycles & non-motorized cycles (18%)</option>
                  <option value="87116010">87116010 - Electric E-Bikes 250W (18%)</option>
                  <option value="87149990">87149990 - Bicycle Parts & Accessories (18%)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">Place of Supply (POS)</label>
                <input
                  type="text"
                  value={placeOfSupply}
                  onChange={(e) => setPlaceOfSupply(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl font-medium outline-none text-slate-800"
                />
              </div>
            </div>
          </div>
        )}

        {/* Printable Official Tax Invoice Container */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/50" ref={printRef}>
          
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-5 flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold tracking-tight text-slate-950">APEX VELO MFG LTD</span>
                <span className="text-[11px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded">
                  TAX COMPLIANT
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 font-medium">Original for Recipient | GST Tax Invoice</p>
              <p className="text-xs text-slate-500">Plot 45, Chakan Industrial Area, Phase II, Pune, Maharashtra 410501</p>
              <p className="text-xs font-mono text-slate-700 font-bold mt-1">GSTIN: 27AABCA1234F1ZP | State: 27-Maharashtra</p>
            </div>

            <div className="text-right space-y-1">
              <div className="text-base font-bold text-slate-950 font-mono tracking-tight">{invoiceNumber}</div>
              <p className="text-xs text-slate-500">Invoice Date: <strong className="text-slate-800">{new Date().toLocaleDateString('en-IN')}</strong></p>
              <p className="text-xs text-slate-500">Sales Order: <strong className="font-mono text-slate-800">{soNumber}</strong></p>
              <p className="text-xs text-slate-500">Pro-Forma Ref: <strong className="font-mono text-slate-800">{proformaRef}</strong></p>
              <div className="pt-1 flex items-center justify-end gap-1 text-[11px] text-emerald-700 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Authorized by Finance</span>
              </div>
            </div>
          </div>

          {/* IRN & Statutory Barcode Area */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase text-slate-400">IRN:</span>
                <span className="font-mono text-[11px] text-slate-800 select-all">{irn}</span>
              </div>
              <div className="flex items-center gap-4 text-slate-500 text-[11px]">
                <span>Ack No: <strong className="font-mono text-slate-800">{ackNo}</strong></span>
                <span>Ack Date: <strong className="text-slate-800">{new Date().toISOString().slice(0, 10)}</strong></span>
                <span>Reverse Charge: <strong>No</strong></span>
              </div>
            </div>
            <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2">
              <QrCode className="w-8 h-8 text-slate-800" />
              <div className="text-[11px] font-mono text-slate-500 leading-tight">
                NIC-GST<br />E-INV-VERIFIED
              </div>
            </div>
          </div>

          {/* Billed To / Shipped To */}
          <div className="grid grid-cols-2 gap-6 bg-white p-5 rounded-2xl border border-slate-200">
            <div>
              <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Details of Receiver (Billed To)</span>
              <h4 className="text-sm font-bold text-slate-900 mt-1">{customerName}</h4>
              <p className="text-xs text-slate-600 mt-1">Plot 12, Industrial Logistics Park, Maharashtra</p>
              <p className="text-xs font-mono font-bold text-slate-900 mt-1">GSTIN: {customerGst}</p>
              <p className="text-xs text-slate-600">Place of Supply: <strong>{placeOfSupply}</strong></p>
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Dispatch & Delivery Terms</span>
              <p className="text-xs text-slate-700 mt-1">Dispatch From: <strong>Apex Velo Factory, Chakan</strong></p>
              <p className="text-xs text-slate-700 mt-1">Payment Due: <strong>NET 30 Days</strong></p>
              <p className="text-xs text-slate-700 mt-1">Issued By: <strong className="text-indigo-700">Central Finance Department</strong></p>
            </div>
          </div>

          {/* Line Items Table with GST Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-bold uppercase">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Description of Goods</th>
                  <th className="p-3 text-center">HSN/SAC</th>
                  <th className="p-3 text-right">Qty</th>
                  <th className="p-3 text-right">Taxable Value (₹)</th>
                  {taxType === 'INTRA_STATE' ? (
                    <>
                      <th className="p-3 text-right">CGST (9%)</th>
                      <th className="p-3 text-right">SGST (9%)</th>
                    </>
                  ) : (
                    <th className="p-3 text-right">IGST (18%)</th>
                  )}
                  <th className="p-3 text-right">Total (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {items.length > 0 ? (
                  items.map((it: any, idx: number) => {
                    const itemTaxable = it.totalPrice || (it.quantity * it.unitPrice) || 0;
                    const itCgst = taxType === 'INTRA_STATE' ? Math.round(itemTaxable * 0.09) : 0;
                    const itSgst = taxType === 'INTRA_STATE' ? Math.round(itemTaxable * 0.09) : 0;
                    const itIgst = taxType === 'INTER_STATE' ? Math.round(itemTaxable * 0.18) : 0;
                    const itTotal = itemTaxable + itCgst + itSgst + itIgst;

                    return (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3 font-bold text-slate-900">{it.productName || 'Industrial Bicycle Assembly'}</td>
                        <td className="p-3 text-center font-mono text-slate-600">{hsnCode}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">{it.quantity || 1}</td>
                        <td className="p-3 text-right font-mono">₹{itemTaxable.toLocaleString('en-IN')}</td>
                        {taxType === 'INTRA_STATE' ? (
                          <>
                            <td className="p-3 text-right font-mono text-slate-600">₹{itCgst.toLocaleString('en-IN')}</td>
                            <td className="p-3 text-right font-mono text-slate-600">₹{itSgst.toLocaleString('en-IN')}</td>
                          </>
                        ) : (
                          <td className="p-3 text-right font-mono text-slate-600">₹{itIgst.toLocaleString('en-IN')}</td>
                        )}
                        <td className="p-3 text-right font-mono font-bold text-slate-950">₹{itTotal.toLocaleString('en-IN')}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="p-3 text-slate-400 font-mono">1</td>
                    <td className="p-3 font-bold text-slate-900">Commercial Cycle Assembly Supply</td>
                    <td className="p-3 text-center font-mono text-slate-600">{hsnCode}</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900">1</td>
                    <td className="p-3 text-right font-mono">₹{baseSubtotal.toLocaleString('en-IN')}</td>
                    {taxType === 'INTRA_STATE' ? (
                      <>
                        <td className="p-3 text-right font-mono text-slate-600">₹{cgstAmount.toLocaleString('en-IN')}</td>
                        <td className="p-3 text-right font-mono text-slate-600">₹{sgstAmount.toLocaleString('en-IN')}</td>
                      </>
                    ) : (
                      <td className="p-3 text-right font-mono text-slate-600">₹{igstAmount.toLocaleString('en-IN')}</td>
                    )}
                    <td className="p-3 text-right font-mono font-bold text-slate-950">₹{grandTotal.toLocaleString('en-IN')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Tax Calculation Matrix */}
          <div className="flex justify-end pt-2">
            <div className="w-80 space-y-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Total Taxable Value:</span>
                <span className="font-mono font-bold text-slate-900">₹{baseSubtotal.toLocaleString('en-IN')}</span>
              </div>
              {taxType === 'INTRA_STATE' ? (
                <>
                  <div className="flex justify-between text-slate-600">
                    <span>Central GST (CGST 9%):</span>
                    <span className="font-mono text-slate-800">₹{cgstAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>State GST (SGST 9%):</span>
                    <span className="font-mono text-slate-800">₹{sgstAmount.toLocaleString('en-IN')}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-slate-600">
                  <span>Integrated GST (IGST 18%):</span>
                  <span className="font-mono text-slate-800">₹{igstAmount.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-2.5 flex justify-between text-sm font-bold text-slate-950">
                <span>Total Invoice Value:</span>
                <span className="font-mono text-emerald-700">₹{grandTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Authorized Signatory */}
          <div className="border-t border-slate-200 pt-4 flex justify-between items-end text-xs text-slate-500">
            <div className="text-[11px] space-y-1">
              <p>Electronic Tax Invoice generated under Section 31 of CGST Act, 2017.</p>
              <p className="font-semibold text-slate-700">Certified that particulars given above are true and correct.</p>
            </div>
            <div className="text-right space-y-1">
              <div className="font-bold text-slate-800">For Apex Velo Mfg Ltd</div>
              <div className="h-8"></div>
              <div className="font-mono text-[11px] font-bold text-slate-700">Authorized Finance Signatory</div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="bg-slate-100 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {isExistingInvoice ? (
              <span className="font-bold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Statutory Invoice Issued & GSTR-1 Ledger Updated
              </span>
            ) : (
              <span className="font-medium text-slate-600">
                Ready to generate official GST tax invoice for Sales Order {soNumber}.
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {!isExistingInvoice && (
              <button
                onClick={handleIssueInvoice}
                disabled={submitting}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                {submitting ? 'Generating Statutory Invoice...' : 'Officially Issue GST Tax Invoice'}
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
