'use client';

import React, { useRef } from 'react';
import { 
  X, 
  Printer, 
  Download, 
  Building, 
  BadgeCheck, 
  ShieldCheck, 
  Calendar, 
  TrendingDown, 
  CheckCircle2, 
  FileCheck2,
  Lock,
  Mail,
  MapPin,
  Sparkles
} from 'lucide-react';

interface FinalPriceLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  po: any;
}

export default function FinalPriceLetterModal({ isOpen, onClose, po }: FinalPriceLetterModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !po) return null;

  const supplier = po.supplier || {};
  const supplierName = supplier.name || 'Vendor Supplier';
  const supplierCode = supplier.code || 'SUP-001';
  const supplierEmail = supplier.email || 'orders@vendor.com';
  const supplierAddress = supplier.address || 'Industrial Estate, Maharashtra, India';
  const supplierGst = supplier.gstNumber || '27AABCV1234E1Z9';

  const originalTotal = po.originalAmount || po.totalAmount || 0;
  const finalTotal = po.negotiatedAmount || po.totalAmount || 0;
  const savings = po.savingsAmount !== undefined ? po.savingsAmount : Math.max(0, originalTotal - finalTotal);
  const savingsPct = po.savingsPercentage !== undefined ? po.savingsPercentage : (originalTotal > 0 ? Math.round((savings / originalTotal) * 100) : 0);

  const items = po.items || [];
  const agreedAt = po.negotiationAgreedAt ? new Date(po.negotiationAgreedAt) : new Date();
  const agreedBy = po.negotiationAgreedBy || 'Finance Manager (CFO)';

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
        <title>Final Price Agreement - ${po.poNumber}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          body { font-family: 'Inter', sans-serif; color: #0f172a; margin: 40px; background: #fff; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 20px; }
          .title { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0; }
          .sub { color: #64748b; font-size: 12px; margin-top: 2px; }
          .badge-box { background: #ecfdf5; border: 1px solid #a7f3d0; padding: 16px; border-radius: 10px; margin: 20px 0; display: flex; justify-content: space-between; align-items: center; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; background: #f8fafc; padding: 16px; border-radius: 10px; font-size: 13px; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
          th { background: #0f172a; color: #fff; text-align: left; padding: 10px; font-size: 11px; text-transform: uppercase; }
          td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
          .right { text-align: right; }
          .strikethrough { text-decoration: line-through; color: #94a3b8; }
          .final-price { font-weight: 700; color: #047857; }
          .savings-pill { background: #dcfce7; color: #15803d; font-weight: 700; padding: 2px 8px; border-radius: 9999px; }
          .summary-box { margin-left: auto; width: 340px; margin-top: 24px; font-size: 13px; }
          .summary-row { display: flex; justify-content: space-between; padding: 6px 0; }
          .terms { margin-top: 30px; padding: 14px; background: #f8fafc; border-left: 4px solid #059669; font-size: 12px; color: #475569; line-height: 1.6; }
          .signatures { margin-top: 60px; display: flex; justify-content: space-between; }
          .sig-card { width: 240px; border-top: 1px solid #94a3b8; padding-top: 8px; text-align: center; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">APEX MANUFACTURING WORKS LTD.</h1>
            <p class="sub">Corporate Finance & Procurement Negotiations Directorate</p>
            <p class="sub">Chakan Industrial Phase-II, Pune, Maharashtra - 410501 | GSTIN: 27AAACA1234A1Z5</p>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 16px; font-weight: 800; color: #047857;">FINAL PRICE SETTLEMENT MEMO</div>
            <div style="font-family: monospace; font-size: 13px; font-weight: 700;">AGREEMENT REF: FPA-${po.poNumber}</div>
            <div style="font-size: 12px; color: #64748b;">Source PO: ${po.poNumber}</div>
            <div style="font-size: 12px; color: #64748b;">Date: ${agreedAt.toLocaleDateString()}</div>
          </div>
        </div>

        <div class="badge-box">
          <div>
            <strong style="color: #065f46; font-size: 15px;">CERTIFIED PROCUREMENT COST SAVINGS</strong>
            <div style="color: #047857; font-size: 12px; margin-top: 2px;">
              Initial Quote: ₹ ${originalTotal.toLocaleString('en-IN')} &nbsp;&rarr;&nbsp; Final Agreed Deal: <strong>₹ ${finalTotal.toLocaleString('en-IN')}</strong>
            </div>
          </div>
          <div style="text-align: right;">
            <span class="savings-pill" style="font-size: 14px; padding: 6px 14px;">
              SAVINGS: ₹ ${savings.toLocaleString('en-IN')} (-${savingsPct}%)
            </span>
          </div>
        </div>

        <div class="meta-grid">
          <div>
            <strong style="color: #0f172a;">SUPPLIER / VENDOR PARTY</strong>
            <p style="margin: 4px 0 0; font-weight: 600;">${supplierName} (${supplierCode})</p>
            <p style="margin: 2px 0; color: #64748b;">${supplierAddress}</p>
            <p style="margin: 2px 0; color: #64748b;">Email: ${supplierEmail} | GST: ${supplierGst}</p>
          </div>
          <div>
            <strong style="color: #0f172a;">NEGOTIATION RECORD & CLEARANCE</strong>
            <p style="margin: 4px 0 0; font-weight: 600;">Authorized By: ${agreedBy}</p>
            <p style="margin: 2px 0; color: #64748b;">Execution Date: ${agreedAt.toLocaleString()}</p>
            <p style="margin: 2px 0; color: #64748b;">Status: Commercial Terms Fully Agreed & Sealed</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Material Description / SKU</th>
              <th class="right">Quantity</th>
              <th class="right">Initial Quoted Rate</th>
              <th class="right">Final Agreed Rate</th>
              <th class="right">Final Total (₹)</th>
              <th class="right">Savings (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it: any, idx: number) => {
              const origRate = it.originalUnitPrice || it.unitPrice || 0;
              const finalRate = it.negotiatedUnitPrice !== undefined ? it.negotiatedUnitPrice : (it.unitPrice || 0);
              const lineFinalTotal = finalRate * it.quantity;
              const lineOrigTotal = origRate * it.quantity;
              const lineSavings = Math.max(0, lineOrigTotal - lineFinalTotal);

              return `
                <tr>
                  <td>${idx + 1}</td>
                  <td>
                    <strong>${it.product?.name || 'Raw Material Item'}</strong>
                    <div style="font-size: 10px; color: #94a3b8; font-family: monospace;">SKU: ${it.product?.sku || 'RAW-001'}</div>
                  </td>
                  <td class="right font-bold">${it.quantity}</td>
                  <td class="right strikethrough font-mono">₹ ${origRate.toLocaleString('en-IN')}</td>
                  <td class="right final-price font-mono">₹ ${finalRate.toLocaleString('en-IN')}</td>
                  <td class="right font-mono font-bold">₹ ${lineFinalTotal.toLocaleString('en-IN')}</td>
                  <td class="right font-mono" style="color: #059669; font-weight: 700;">
                    ${lineSavings > 0 ? `₹ ${lineSavings.toLocaleString('en-IN')}` : '-'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="summary-box">
          <div class="summary-row">
            <span>Total Initial Quote Value:</span>
            <span style="font-family: monospace; text-decoration: line-through; color: #64748b;">₹ ${originalTotal.toLocaleString('en-IN')}</span>
          </div>
          <div class="summary-row" style="color: #059669; font-weight: 700;">
            <span>Total Negotiated Cost Reduction:</span>
            <span style="font-family: monospace;">- ₹ ${savings.toLocaleString('en-IN')} (${savingsPct}%)</span>
          </div>
          <div class="summary-row" style="border-top: 2px solid #0f172a; font-size: 15px; font-weight: 800; padding-top: 8px;">
            <span>Final Agreed Order Value:</span>
            <span style="font-family: monospace; color: #047857;">₹ ${finalTotal.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div style="margin-top: 14px; font-size: 12px; color: #475569; font-style: italic;">
          Final Amount in Words: <strong>${numberToWords(finalTotal)}</strong>
        </div>

        <div class="terms">
          <strong>Mutual Concessions & Binding Commercial Notes:</strong>
          <p style="margin: 4px 0 0;">
            ${po.negotiationNotes || 'The pricing agreed herein represents the final legally binding settlement for the specified delivery volume. All goods remain subject to Apex Quality Inspection prior to inventory admission.'}
          </p>
        </div>

        <div class="signatures">
          <div class="sig-card">
            <strong>${agreedBy}</strong><br>
            <span style="font-size: 11px; color: #64748b;">Authorized Financial Signatory<br>Apex Manufacturing Works Ltd.</span>
          </div>

          <div class="sig-card">
            <strong>${supplierName}</strong><br>
            <span style="font-size: 11px; color: #64748b;">Authorized Vendor Acceptance<br>Commercial Representative</span>
          </div>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([letterHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Final_Price_Agreement_Letter_${po.poNumber}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 overflow-y-auto print:p-0 print:m-0">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm print:hidden" onClick={onClose} />

      {/* Main Container */}
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden my-auto border border-slate-200 z-10 print:border-none print:shadow-none print:rounded-none print:w-full print:max-w-none">
        
        {/* Top Control Bar (Hidden when printing) */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <BadgeCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Negotiated Final Price Settlement Letter</h3>
              <p className="text-xs text-slate-400 font-mono">PO: {po.poNumber} • Agreement Ref: FPA-{po.poNumber}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-all cursor-pointer"
              title="Download standalone letter document"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              Download Final Letter
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow transition-all cursor-pointer"
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
                <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                  AP
                </div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">APEX MANUFACTURING WORKS LTD.</h1>
              </div>
              <p className="text-xs text-slate-500 font-medium">Corporate Finance & Procurement Negotiations Directorate</p>
              <p className="text-[11px] text-slate-400">
                GSTIN: <span className="font-mono font-semibold text-slate-700">27AAACA1234A1Z5</span> | CIN: <span className="font-mono font-semibold text-slate-700">U29100MH2020PLC123456</span>
              </p>
              <p className="text-[11px] text-slate-400">Plot 108, Chakan Industrial Area Phase-II, Pune, Maharashtra - 410501</p>
            </div>

            <div className="text-left sm:text-right space-y-1 sm:w-72">
              <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-900 font-bold text-xs uppercase tracking-wider rounded-md border border-emerald-300">
                Final Price Settlement
              </span>
              <p className="text-xs font-mono font-bold text-slate-800 mt-2">AGREEMENT: FPA-{po.poNumber}</p>
              <p className="text-xs text-slate-500">Source PO: <span className="font-mono font-bold text-slate-700">{po.poNumber}</span></p>
              <p className="text-xs text-slate-500">Agreed Date: <span className="font-medium text-slate-700">{agreedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></p>
              <p className="text-xs text-slate-500">Authorized By: <span className="font-semibold text-emerald-700">{agreedBy}</span></p>
            </div>
          </div>

          {/* Big Savings Callout Banner */}
          <div className="my-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-600 text-white rounded-xl shrink-0">
                <TrendingDown className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Verified Corporate Cost Savings</p>
                <h3 className="text-xl font-bold text-slate-900">
                  Total Bottom-Line Reduction: <span className="text-emerald-700">₹{savings.toLocaleString('en-IN')}</span>
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Initial Requisition Price: <span className="line-through font-mono">₹{originalTotal.toLocaleString('en-IN')}</span> &nbsp;&rarr;&nbsp; Final Agreed Settlement: <strong className="text-slate-900 font-mono">₹{finalTotal.toLocaleString('en-IN')}</strong>
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-sm">
                <BadgeCheck className="w-4 h-4" /> -{savingsPct}% Negotiated Concession
              </span>
            </div>
          </div>

          {/* Parties Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-6 p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs">
            <div className="space-y-1.5">
              <span className="font-bold text-[11px] uppercase tracking-wider text-slate-400">Supplier Vendor (Party A)</span>
              <p className="text-sm font-bold text-slate-900">{supplierName}</p>
              <p className="font-mono text-slate-500">Vendor ID: {supplierCode}</p>
              <p className="text-slate-600 flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {supplierAddress}</p>
              <p className="text-slate-600 flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-slate-400" /> {supplierEmail}</p>
              <p className="text-slate-600 font-mono">GSTIN: {supplierGst}</p>
            </div>

            <div className="space-y-1.5">
              <span className="font-bold text-[11px] uppercase tracking-wider text-slate-400">Purchasing Entity & Finance Clearance (Party B)</span>
              <p className="text-sm font-bold text-slate-900">Apex Manufacturing Works Ltd.</p>
              <p className="text-slate-600">Disbursement Account: Corporate Treasury & Working Capital</p>
              <p className="text-slate-600">Approved Negotiator: <span className="font-bold text-slate-800">{agreedBy}</span></p>
              <p className="text-slate-600">Expected Inward Delivery: <strong className="text-slate-800">{new Date(po.expectedDeliveryDate || Date.now() + 7 * 86400000).toLocaleDateString()}</strong></p>
              <p className="text-slate-600">Payment Authorization: <span className="font-bold text-emerald-700">Pre-Approved for NEFT Release</span></p>
            </div>
          </div>

          {/* Comparison Line Items Table */}
          <div className="space-y-2 my-6">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Itemized Final Agreed Rate Comparison
              </h4>
              <span className="text-[11px] text-slate-400">All rates in Indian Rupees (INR)</span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase text-[11px]">
                  <tr>
                    <th className="p-3 text-center w-10">#</th>
                    <th className="p-3">Material Description</th>
                    <th className="p-3 text-center">Quantity</th>
                    <th className="p-3 text-right">Initial Rate</th>
                    <th className="p-3 text-right">Final Agreed Rate</th>
                    <th className="p-3 text-right">Final Total (₹)</th>
                    <th className="p-3 text-right">Net Savings (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {items.map((item: any, idx: number) => {
                    const origRate = item.originalUnitPrice || item.unitPrice || 0;
                    const finalRate = item.negotiatedUnitPrice !== undefined ? item.negotiatedUnitPrice : (item.unitPrice || 0);
                    const lineFinalTotal = finalRate * item.quantity;
                    const lineOrigTotal = origRate * item.quantity;
                    const lineSavings = Math.max(0, lineOrigTotal - lineFinalTotal);

                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{item.product?.name || 'Material Item'}</div>
                          <div className="text-[11px] text-slate-400 font-mono">SKU: {item.product?.sku || 'RAW-001'}</div>
                        </td>
                        <td className="p-3 text-center font-bold font-mono text-slate-700">{item.quantity}</td>
                        <td className="p-3 text-right font-mono text-slate-400 line-through">
                          ₹{origRate.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-700">
                          ₹{finalRate.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">
                          ₹{lineFinalTotal.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-600">
                          {lineSavings > 0 ? `+ ₹${lineSavings.toLocaleString('en-IN')}` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals Summary */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pt-2">
            <div className="space-y-2 max-w-sm text-xs">
              <p className="text-slate-500 font-medium">
                Final Agreed Amount in Words:<br />
                <span className="font-bold text-slate-900 italic">{numberToWords(finalTotal)}</span>
              </p>
              
              {po.negotiationNotes && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-emerald-950 text-[11px]">
                  <strong>Agreed Concession Terms:</strong> {po.negotiationNotes}
                </div>
              )}
            </div>

            <div className="w-full sm:w-72 space-y-2 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Original Quoted Value:</span>
                <span className="font-mono line-through">₹{originalTotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-bold">
                <span>Negotiated Savings:</span>
                <span className="font-mono">- ₹{savings.toLocaleString('en-IN')}</span>
              </div>
              <div className="border-t-2 border-slate-900 pt-2 flex justify-between text-sm font-bold text-slate-900">
                <span>Final Agreed PO Price:</span>
                <span className="font-mono text-lg text-emerald-700">₹{finalTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Signature & Clearance Seals */}
          <div className="mt-8 pt-6 border-t border-slate-200 text-xs space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-end pt-8 gap-8">
              {/* Finance Manager Box */}
              <div className="text-center w-60 space-y-2">
                <div className="border border-emerald-200 bg-emerald-50/50 p-3 rounded-xl">
                  <div className="flex items-center justify-center gap-1 text-emerald-800 font-bold text-[11px] uppercase">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Authorized Finance Sign-Off
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-800 mt-1">
                    CERTIFIED: {agreedAt.toISOString().slice(0, 10)}
                  </div>
                </div>
                <div className="border-b border-slate-300 pb-2"></div>
                <p className="font-bold text-slate-800 text-xs">{agreedBy}</p>
                <p className="text-[11px] text-slate-400">Chief Financial Officer & Treasury Directorate</p>
              </div>

              {/* Vendor Acceptance Box */}
              <div className="text-center w-60 space-y-2">
                <div className="border border-slate-200 bg-slate-50 p-3 rounded-xl">
                  <div className="flex items-center justify-center gap-1 text-slate-700 font-bold text-[11px] uppercase">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" /> Commercial Acceptance
                  </div>
                  <div className="text-xs font-mono font-medium text-slate-600 mt-1">
                    Vendor Confirmation Sealed
                  </div>
                </div>
                <div className="border-b border-slate-300 pb-2"></div>
                <p className="font-bold text-slate-800 text-xs">{supplierName}</p>
                <p className="text-[11px] text-slate-400">Authorized Commercial Representative</p>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
