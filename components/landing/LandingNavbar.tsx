'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronDown, Calendar } from 'lucide-react';
import ProdexaLogo from '@/components/common/ProdexaLogo';

interface LandingNavbarProps {
  onOpenDemo?: () => void;
}

export default function LandingNavbar({ onOpenDemo }: LandingNavbarProps) {
  return (
    <nav className="flex items-center justify-between px-6 sm:px-8 py-2.5 border-b border-slate-800 bg-[#1E293B] backdrop-blur-md sticky top-0 z-50 shadow-sm">
      {/* Logo Left - Prodexa ERP Logo */}
      <Link href="/" className="group">
        <ProdexaLogo variant="light" size="md" showText={true} />
      </Link>

      {/* Nav Links Center-Right */}
      <div className="hidden lg:flex items-center gap-8 text-sm font-semibold text-slate-200">
        {/* Modules */}
        <Link href="/#modules" className="hover:text-amber-400 transition-colors">
          Modules
        </Link>

        {/* Capabilities Dropdown */}
        <div className="relative group cursor-pointer">
          <Link href="/#capabilities" className="flex items-center gap-1 hover:text-amber-400 transition-colors py-2">
            Capabilities <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:rotate-180 transition-transform" />
          </Link>
          <div className="absolute top-full left-0 hidden group-hover:block w-60 bg-[#1E293B] border border-slate-700 rounded-xl p-2 shadow-xl space-y-1 z-50">
            <Link href="/#capabilities" className="block px-3 py-2 text-xs text-slate-300 hover:text-amber-400 hover:bg-white/5 rounded-lg font-medium">
              FEFO & Expiry Allocation
            </Link>
            <Link href="/#capabilities" className="block px-3 py-2 text-xs text-slate-300 hover:text-amber-400 hover:bg-white/5 rounded-lg font-medium">
              Multi-Level MRP Engine
            </Link>
            <Link href="/#capabilities" className="block px-3 py-2 text-xs text-slate-300 hover:text-amber-400 hover:bg-white/5 rounded-lg font-medium">
              Quality & Compliance (QA)
            </Link>
            <Link href="/#capabilities" className="block px-3 py-2 text-xs text-slate-300 hover:text-amber-400 hover:bg-white/5 rounded-lg font-medium">
              GST Invoicing & Accounting
            </Link>
          </div>
        </div>

        {/* Industries Dropdown */}
        <div className="relative group cursor-pointer">
          <Link href="/industries" className="flex items-center gap-1 hover:text-amber-400 transition-colors py-2">
            Industries <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:rotate-180 transition-transform" />
          </Link>
          <div className="absolute top-full left-0 hidden group-hover:block w-64 bg-[#1E293B] border border-slate-700 rounded-xl p-2 shadow-xl space-y-1 z-50">
            <Link href="/industries#food-bev" className="block px-3 py-2 text-xs text-slate-300 hover:text-amber-400 hover:bg-white/5 rounded-lg font-medium">
              Food & Beverage Processing
            </Link>
            <Link href="/industries#auto-machining" className="block px-3 py-2 text-xs text-slate-300 hover:text-amber-400 hover:bg-white/5 rounded-lg font-medium">
              Automotive Parts & Machining
            </Link>
            <Link href="/industries#pharma-chem" className="block px-3 py-2 text-xs text-slate-300 hover:text-amber-400 hover:bg-white/5 rounded-lg font-medium">
              Chemicals & Pharmaceuticals
            </Link>
            <Link href="/industries#electronics" className="block px-3 py-2 text-xs text-slate-300 hover:text-amber-400 hover:bg-white/5 rounded-lg font-medium">
              Electronics & Precision Assembly
            </Link>
            <Link href="/industries" className="block px-3 py-2 text-xs text-amber-400 font-semibold hover:bg-white/5 rounded-lg border-t border-slate-700 mt-1 pt-2">
              View All Industries
            </Link>
          </div>
        </div>

        {/* ROI Estimator */}
        <Link href="/#calculator" className="hover:text-amber-400 transition-colors">
          ROI Estimator
        </Link>

        {/* Documentation */}
        <Link href="/docs" className="hover:text-amber-400 transition-colors">
          Documentation
        </Link>
      </div>

      {/* Login & Book Demo Actions */}
      <div className="flex gap-3 items-center">
        <Link
          href="/login"
          className="text-sm font-semibold text-slate-200 hover:text-amber-400 transition-colors px-2 py-1 hidden sm:inline-block"
        >
          Sign In
        </Link>
        {onOpenDemo ? (
          <button
            onClick={onOpenDemo}
            className="px-5 py-2.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold hover:bg-amber-400 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5 text-slate-950" />
            <span>Book a Demo</span>
          </button>
        ) : (
          <Link
            href="/register"
            className="px-5 py-2.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold hover:bg-amber-400 transition-all shadow-sm flex items-center gap-2"
          >
            <Calendar className="w-3.5 h-3.5 text-slate-950" />
            <span>Book a Demo</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
