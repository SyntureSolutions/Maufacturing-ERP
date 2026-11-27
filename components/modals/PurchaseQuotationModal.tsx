'use client';

import React, { useRef } from 'react';
import { 
  X, 
  Printer, 
  Download, 
  Building, 
  FileText, 
  Calendar, 
  ShieldCheck, 
  CheckCircle2,
  Mail,
  MapPin,
  Phone,
  Hash
} from 'lucide-react';

interface PurchaseQuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  po: any;
}

export default function PurchaseQuotationModal({ isOpen, onClose, po }: PurchaseQuotationModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !po) return null;

  const supplier = po.supplier || {};
  const supplierName = supplier.name || 'Registered Vendor';
  const supplierCode = supplier.code || 'SUP-001';
  const supplierEmail = supplier.email || 'procurement@vendor.com';
  const supplierAddress = supplier.address || 'Industrial Area Phase 2, Maharashtra, India';
  const supplierGst = supplier.gstNumber || '27AABCU1234D1Z2';

  const items = po.items || [];
  const subtotal = items.reduce((sum: number, it: any) => sum + (it.totalPrice || (it.quantity * it.unitPrice)), 0);
  const gstRate = 0.18; // 18% GST standard industrial
  const gstAmount = Math.round(subtotal * gstRate);
  const grandTotal = subtotal + gstAmount;

  // Number to words converter for INR
  const numberToWords = (num: number): string => {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    if (num === 0) return 'Zero';
    const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';
    let str = '';
    str += (Number(n[1]) !== 0) ? (a[Number(n[1])] || b[Number(n[1][0])] + ' ' + a[Number(n[1][1])]) + 'Crore ' : '';
    str += (Number(n[2]) !== 0) ? (a[Number(n[2])] || b[Number(n[2][0])] + ' ' + a[Number(n[2][1])]) + 'Lakh ' : '';
    str += (Number(n[3]) !== 0) ? (a[Number(n[3])] || b[Number(n[3][0])] + ' ' + a[Number(n[3][1])]) + 'Thousand ' : '';
    str += (Number(n[4]) !== 0) ? (a[Number(n[4])] || b[Number(n[4][0])] + ' ' + a[Number(n[4][1])]) + 'Hundred ' : '';
    str += (Number(n[5]) !== 0) ? ((str !== '') ? 'and ' : '') + (a[Number(n[5])] || b[Number(n[5][0])] + ' ' + a[Number(n[5][1])]) : '';
    return str.trim() + ' Rupees Only';
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const letterHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Purchase Quotation - ${po.poNumber}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          body { font-family: 'Inter', sans-serif; color: #0f172a; margin: 40px; background: #fff; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 24px; }
          .title { font-size: 24px; font-weight: 800; color: #1e293b; margin: 0; }
          .sub { color: #64748b; font-size: 13px; margin-top: 4px; }
          .meta-box { background: #f8fafc; padding: 16px; border-radius: 12px; margin: 24px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
          th { background: #f1f5f9; text-align: left; padding: 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; }
          td { padding: 12px; border-bottom: 1px solid #f1f5f9; }
          .right { text-align: right; }
          .total-box { margin-top: 24px; margin-left: auto; width: 320px; font-size: 14px; }
          .total-row { display: flex; justify-content: space-between; padding: 6px 0; }
          .grand-total { border-top: 2px solid #0f172a; font-weight: 800; font-size: 16px; color: #0f172a; padding-top: 10px; }
          .terms { margin-top: 40px; padding: 16px; background: #fafafa; border-radius: 8px; font-size: 12px; color: #64748b; line-height: 1.6; }
          .sign { margin-top: 60px; display: flex; justify-content: space-between; }
          .sign-line { border-top: 1px solid #cbd5e1; width: 220px; padding-top: 8px; text-align: center; font-size: 12px; font-weight: 600; color: #475569; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">APEX MANUFACTURING WORKS LTD.</h1>
            <p class="sub">Advanced Precision Engineering & Industrial Assemblies</p>
            <p class="sub">GSTIN: 27AAACA1234A1Z5 | CIN: U29100MH2020PLC123456</p>
            <p class="sub">Chakan Industrial Estate Phase-II, Pune, Maharashtra - 410501</p>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 18px; font-weight: 800; color: #d97706; text-transform: uppercase;">Purchase Quotation</div>
            <div style="font-family: monospace; font-size: 14px; font-weight: 700; margin-top: 4px;">REF: QT-${po.poNumber}</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 4px;">PO Source: ${po.poNumber}</div>
            <div style="font-size: 12px; color: #64748b;">Date: ${new Date(po.orderDate || Date.now()).toLocaleDateString()}</div>
          </div>
        </div>

        <div class="meta-box">
          <div>
            <strong style="color: #0f172a; font-size: 14px;">SUPPLIER / VENDOR DETAILS</strong>
            <p style="margin: 4px 0 0; font-weight: 600;">${supplierName} (${supplierCode})</p>
            <p style="margin: 2px 0; color: #64748b;">${supplierAddress}</p>
            <p style="margin: 2px 0; color: #64748b;">Email: ${supplierEmail} | GST: ${supplierGst}</p>
          </div>
          <div>
            <strong style="color: #0f172a; font-size: 14px;">DELIVERY & BILLING INSTRUCTIONS</strong>
            <p style="margin: 4px 0 0; font-weight: 600;">Central Inward Receiving Dock 3</p>
            <p style="margin: 2px 0; color: #64748b;">Expected Delivery: ${new Date(po.expectedDeliveryDate || Date.now() + 7 * 86400000).toLocaleDateString()}</p>
            <p style="margin: 2px 0; color: #64748b;">Payment Terms: Net-30 Days upon GRN Quality Clearance</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 40px;">#</th>
              <th>Item Description / Material SKU</th>
              <th class="right">Quantity</th>
              <th class="right">Unit Price (₹)</th>
              <th class="right">GST Rate</th>
              <th class="right">Total Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it: any, idx: number) => `
              <tr>
                <td>${idx + 1}</td>
                <td>
                  <strong>${it.product?.name || 'Material Item'}</strong>
                  <div style="font-size: 11px; color: #94a3b8; font-family: monospace;">SKU: ${it.product?.sku || 'RAW-MAT-01'}</div>
                </td>
                <td class="right font-bold">${it.quantity} Units</td>
                <td class="right font-mono">₹ ${(it.unitPrice || 0).toLocaleString('en-IN')}</td>
                <td class="right">18%</td>
                <td class="right font-mono font-bold">₹ ${(it.totalPrice || it.quantity * it.unitPrice || 0).toLocaleString('en-IN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-box">
          <div class="total-row">
            <span>Taxable Value (Subtotal):</span>
            <span style="font-family: monospace; font-weight: 600;">₹ ${subtotal.toLocaleString('en-IN')}</span>
          </div>
          <div class="total-row">
            <span>Applicable GST (CGST 9% + SGST 9%):</span>
            <span style="font-family: monospace; font-weight: 600;">₹ ${gstAmount.toLocaleString('en-IN')}</span>
          </div>
          <div class="total-row grand-total">
            <span>Quotation Grand Total:</span>
            <span style="font-family: monospace;">₹ ${grandTotal.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div style="margin-top: 16px; font-size: 12px; color: #475569; font-style: italic;">
          Amount in words: <strong>${numberToWords(grandTotal)}</strong>
        </div>

        <div class="terms">
          <strong>Commercial Terms & Quality Protocols:</strong>
          <ul style="margin: 6px 0 0; padding-left: 20px;">
            <li>1. This quotation letter reflects the registered purchase order bill of materials for manufacturing assembly.</li>
            <li>2. Inward goods must be accompanied by Manufacturer Test Certificate (MTC) and Commercial Tax Invoice.</li>
            <li>3. Payment will be processed via NEFT/RTGS within 30 days of GRN clearance.</li>
          </ul>
        </div>

        <div class="sign">
          <div class="sign-line">
            Prepared By<br>
            <span style="font-size: 10px; color: #94a3b8;">Procurement Officer</span>
          </div>
          <div class="sign-line">
            Authorized Signatory<br>
            <span style="font-size: 10px; color: #94a3b8;">Apex Industrial Management</span>
          </div>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([letterHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Quotation_Invoice_Letter_${po.poNumber}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 overflow-y-auto print:p-0 print:m-0">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm print:hidden" onClick={onClose} />

      {/* Main Letter Container */}
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden my-auto border border-slate-200 z-10 print:border-none print:shadow-none print:rounded-none print:w-full print:max-w-none">
        
        {/* Top Control Bar (Hidden when printing) */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Official Purchase Quotation & Invoice Letter</h3>
              <p className="text-xs text-slate-400 font-mono">PO Ref: {po.poNumber}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-all cursor-pointer"
              title="Download standalone HTML document"
            >
              <Download className="w-4 h-4 text-amber-400" />
              Download Letter
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-bold rounded-lg shadow transition-all cursor-pointer"
              title="Print document or Save as PDF"
            >
              <Printer className="w-4 h-4" />
              Print / Save PDF
            </button>

            <button 
              onClick={onClose} 
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-2 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Official Document Sheet */}
        <div ref={printRef} className="p-8 sm:p-12 text-slate-900 bg-white print:p-6">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-slate-900/10 pb-6 gap-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-slate-900 font-bold text-sm">
                  AP
                </div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">APEX MANUFACTURING WORKS LTD.</h1>
              </div>
              <p className="text-xs text-slate-500 font-medium">Precision Industrial Engineering, OEM Fabrications & Cycle Works</p>
              <p className="text-[11px] text-slate-400">
                GSTIN: <span className="font-mono font-semibold text-slate-700">27AAACA1234A1Z5</span> | CIN: <span className="font-mono font-semibold text-slate-700">U29100MH2020PLC123456</span>
              </p>
              <p className="text-[11px] text-slate-400">Plot 108, Chakan Industrial Area Phase-II, Pune, Maharashtra - 410501</p>
            </div>

            <div className="text-left sm:text-right space-y-1 sm:w-64">
              <span className="inline-block px-3 py-1 bg-amber-100 text-amber-900 font-bold text-xs uppercase tracking-wider rounded-md border border-amber-300">
                Purchase Quotation
              </span>
              <p className="text-xs font-mono font-bold text-slate-800 mt-2">DOC: QT-{po.poNumber}</p>
              <p className="text-xs text-slate-500">Order Ref: <span className="font-mono font-bold text-slate-700">{po.poNumber}</span></p>
              <p className="text-xs text-slate-500">Date: <span className="font-medium text-slate-700">{new Date(po.orderDate || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></p>
              <p className="text-xs text-slate-500">Valid Until: <span className="font-medium text-slate-700">{new Date(po.expectedDeliveryDate || Date.now() + 14 * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></p>
            </div>
          </div>

          {/* Supplier & Delivery Metadata Box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-6 p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs">
            <div className="space-y-1.5">
              <span className="font-bold text-[11px] uppercase tracking-wider text-slate-400">Addressed To (Supplier / Vendor)</span>
              <p className="text-sm font-bold text-slate-900">{supplierName}</p>
              <p className="font-mono text-slate-500">Vendor ID: {supplierCode}</p>
              <p className="text-slate-600 flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {supplierAddress}</p>
              <p className="text-slate-600 flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-slate-400" /> {supplierEmail}</p>
              <p className="text-slate-600 font-mono">GSTIN: {supplierGst}</p>
            </div>

            <div className="space-y-1.5">
              <span className="font-bold text-[11px] uppercase tracking-wider text-slate-400">Shipping Destination & Terms</span>
              <p className="text-sm font-bold text-slate-900">Apex Works Central Inward Receiving</p>
              <p className="text-slate-600">Receiving Dock #3, Raw Material Staging Store</p>
              <p className="text-slate-600">Expected Delivery: <strong className="text-amber-700">{new Date(po.expectedDeliveryDate || Date.now() + 7 * 86400000).toLocaleDateString()}</strong></p>
              <p className="text-slate-600">Payment Terms: <span className="font-bold text-slate-800">Net 30 Days</span> upon GRN inspection</p>
              <p className="text-slate-600">Source: <span className="font-semibold text-slate-700">{po.sourceType === 'MRP_AUTO' ? 'Automated MRP Requisition' : 'Manual Requisition'}</span></p>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="overflow-x-auto my-6 border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="p-3 text-center w-12">#</th>
                  <th className="p-3">Material Item & SKU</th>
                  <th className="p-3 text-right">Qty</th>
                  <th className="p-3 text-right">Unit Rate (₹)</th>
                  <th className="p-3 text-center">GST Rate</th>
                  <th className="p-3 text-right">Taxable Total (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {items.map((item: any, idx: number) => {
                  const lineTotal = item.totalPrice || (item.quantity * item.unitPrice) || 0;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{item.product?.name || 'Raw Material Item'}</div>
                        <div className="text-[11px] text-slate-400 font-mono">SKU: {item.product?.sku || 'RAW-001'}</div>
                      </td>
                      <td className="p-3 text-right font-mono font-bold">{item.quantity} Units</td>
                      <td className="p-3 text-right font-mono">₹{(item.unitPrice || 0).toLocaleString('en-IN')}</td>
                      <td className="p-3 text-center text-slate-600 font-mono">18%</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">₹{lineTotal.toLocaleString('en-IN')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals Section */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pt-2">
            <div className="space-y-2 max-w-sm text-xs">
              <p className="text-slate-500 font-medium">
                Amount in Words:<br />
                <span className="font-bold text-slate-800 italic">{numberToWords(grandTotal)}</span>
              </p>
              {po.notes && (
                <div className="p-3 bg-amber-50/60 border border-amber-200/60 rounded-lg text-amber-900 text-[11px]">
                  <strong>Internal Delivery Notes:</strong> {po.notes}
                </div>
              )}
            </div>

            <div className="w-full sm:w-72 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Taxable Value (Subtotal):</span>
                <span className="font-mono font-semibold">₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>CGST (9%):</span>
                <span className="font-mono font-semibold">₹{Math.round(gstAmount / 2).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>SGST (9%):</span>
                <span className="font-mono font-semibold">₹{Math.round(gstAmount / 2).toLocaleString('en-IN')}</span>
              </div>
              <div className="border-t-2 border-slate-900 pt-2 flex justify-between text-sm font-bold text-slate-900">
                <span>Quotation Total:</span>
                <span className="font-mono text-base text-amber-600">₹{grandTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Standard Terms & Signatures */}
          <div className="mt-8 pt-6 border-t border-slate-100 text-[11px] text-slate-500 space-y-4">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <strong className="text-slate-700">Standard Procurement Terms:</strong>
              <p className="mt-1 leading-relaxed">
                1. Please treat this document as an official purchase order quotation & pro-forma specification. <br />
                2. Price is inclusive of standard packaging and handling. Transit insurance covered under Apex Marine Policy. <br />
                3. Deliveries received after expected date may be subject to Vendor On-Time Delivery (OTD) score adjustments.
              </p>
            </div>

            <div className="flex justify-between items-end pt-8">
              <div className="text-center w-44 space-y-1">
                <div className="border-b border-slate-300 pb-8 font-mono text-[11px] text-slate-400">
                  DIGITALLY GENERATED
                </div>
                <p className="font-bold text-slate-700 text-xs">Procurement Department</p>
                <p className="text-[11px] text-slate-400">Apex Manufacturing Works Ltd.</p>
              </div>

              <div className="text-center w-48 space-y-1">
                <div className="border-b border-slate-300 pb-4">
                  <div className="inline-flex items-center gap-1 text-emerald-700 text-[11px] font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <ShieldCheck className="w-3 h-3" /> Certified ERP Record
                  </div>
                </div>
                <p className="font-bold text-slate-700 text-xs">Authorized Financial Signatory</p>
                <p className="text-[11px] text-slate-400">Corporate Finance & Audit Division</p>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
