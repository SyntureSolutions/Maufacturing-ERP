'use client';

import React from 'react';
import {
  Factory,
  Users,
  Package,
  TrendingUp,
  ShieldCheck,
  Globe,
  Clock,
  Zap
} from 'lucide-react';

const stats = [
  { emoji: '🏭', label: 'Factories Powered', value: '340+', icon: Factory },
  { emoji: '👥', label: 'Active Workers', value: '18,000+', icon: Users },
  { emoji: '📦', label: 'SKUs Tracked', value: '2.4M+', icon: Package },
  { emoji: '📈', label: 'Avg ROI Gain', value: '32%', icon: TrendingUp },
  { emoji: '🛡️', label: 'QA Inspections', value: '99.6%', icon: ShieldCheck },
  { emoji: '🌍', label: 'Countries', value: '12+', icon: Globe },
  { emoji: '⏱️', label: 'Uptime SLA', value: '99.99%', icon: Clock },
  { emoji: '⚡', label: 'Faster Dispatch', value: '4x', icon: Zap },
];

export default function StatsMarquee() {
  // Duplicate for seamless infinite scroll
  const items = [...stats, ...stats];

  return (
    <div className="w-full bg-[#1E293B] border-y border-slate-700/60 py-5 overflow-hidden relative">
      {/* Gradient fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[#1E293B] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[#1E293B] to-transparent z-10 pointer-events-none" />

      <div className="animate-marquee flex items-center gap-12 whitespace-nowrap w-max">
        {items.map((stat, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-5 py-2 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors group cursor-default"
          >
            <span className="text-2xl" role="img" aria-label={stat.label}>
              {stat.emoji}
            </span>
            <div className="text-left">
              <p className="text-lg font-black text-white tracking-tight leading-none group-hover:text-amber-400 transition-colors">
                {stat.value}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                {stat.label}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
