'use client';

import React, { useState } from 'react';
import { Calculator, ArrowRight, DollarSign, Clock, ShieldCheck, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import AnimatedCounter from '@/components/landing/AnimatedCounter';

export default function RoiCalculator() {
  const [monthlyTurnover, setMonthlyTurnover] = useState<number>(2500000); // Default ₹25L

  // Estimated Calculations
  const annualTurnover = monthlyTurnover * 12;
  // Estimated waste saved: ~3.5% reduction in expired/damaged batch spoilage
  const wasteSaved = Math.round(annualTurnover * 0.035);
  // Estimated manual administration/reconciliation hours saved: ~120 hours per month @ ₹350/hr
  const laborSaved = Math.round(120 * 12 * 350);
  // Total annual estimated financial impact
  const totalAnnualSavings = wasteSaved + laborSaved;

  const formatINR = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div id="calculator" className="bg-[#FAF6F1] py-24 border-t border-[#E8DDD0] relative">
      <div className="max-w-6xl mx-auto px-8 relative z-10">
        {/* Header */}
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white border border-[#1E293B]/20 text-xs font-semibold text-slate-800 mb-3 shadow-xs">
            <Calculator className="w-3.5 h-3.5 text-amber-600" />
            <span>Operational Value Estimator</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#1E3A8A] tracking-tight">
            Estimate Your Annual Cost Optimization
          </h2>
          <p className="text-slate-600 text-base mt-3 leading-relaxed">
            Model the potential savings from systematic FEFO batch dispatching, automated stock reconciliation, and reduced manual overhead.
          </p>
        </div>

        {/* Calculator Card */}
        <div className="bg-white border-2 border-[#1E293B]/15 rounded-3xl p-8 lg:p-12 shadow-xl grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Controls */}
          <div className="lg:col-span-6 space-y-8 text-left">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                Monthly Inventory Valuation (Average Holding):
              </label>
              <div className="text-3xl sm:text-4xl font-extrabold text-[#1E293B] font-mono mb-4">
                {formatINR(monthlyTurnover)}
              </div>

              {/* Slider Input */}
              <input
                type="range"
                min={500000}
                max={10000000}
                step={250000}
                value={monthlyTurnover}
                onChange={(e) => setMonthlyTurnover(Number(e.target.value))}
                className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex justify-between text-xs font-medium text-slate-500 mt-2">
                <span>₹ 5 Lakhs</span>
                <span>₹ 50 Lakhs</span>
                <span>₹ 1 Crore</span>
              </div>
            </div>

            {/* Estimated Value Drivers */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3 p-3.5 bg-[#FAF6F1] border border-slate-200 rounded-xl">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <TrendingDown className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Estimated Spoilage Reduction (~3.5%)</p>
                  <p className="text-[11px] text-slate-500">Minimizes expired lots in secondary & central warehouses.</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3.5 bg-[#FAF6F1] border border-slate-200 rounded-xl">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Estimated Labor Hours Reallocated</p>
                  <p className="text-[11px] text-slate-500">Automates dispatch planning and physical inventory audits.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Results Display */}
          <div className="lg:col-span-6 bg-[#1E293B] text-white border border-slate-700 rounded-2xl p-8 shadow-xl text-left space-y-6">
            <div>
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block mb-1">
                Estimated Net Annual Impact
              </span>
              <h3 className="text-lg font-medium text-slate-300">
                Projected Cost Savings:
              </h3>
              <div className="text-3xl sm:text-4xl font-black text-white font-mono mt-2 tracking-tight">
                <AnimatedCounter
                  value={totalAnnualSavings}
                  formatAsINR={true}
                />
                <span className="text-xs font-sans font-normal text-slate-400 ml-2">/ year (est.)</span>
              </div>
            </div>

            <div className="border-t border-slate-700 pt-4 space-y-2.5 text-xs">
              <div className="flex justify-between items-center text-slate-300">
                <span>Estimated Spoilage Avoidance:</span>
                <span className="font-mono font-bold text-emerald-400">
                  <AnimatedCounter value={wasteSaved} formatAsINR={true} />
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>Estimated Administrative Labor Optimization:</span>
                <span className="font-mono font-bold text-amber-400">
                  <AnimatedCounter value={laborSaved} formatAsINR={true} />
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-700/80">
              <p className="text-[10px] text-slate-400 leading-relaxed italic mb-4">
                * Illustrative estimation based on typical industry benchmarks. Exact ROI varies by inventory turnover velocity and operating complexity.
              </p>
              <Link
                href="/docs"
                className="w-full py-3 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold hover:bg-amber-400 transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <span>Request Detailed Plant Evaluation</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-950" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
