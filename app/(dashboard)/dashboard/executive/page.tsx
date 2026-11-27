'use client';

import React, { useState, useEffect } from 'react';
import {
  Package,
  TrendingUp,
  AlertCircle,
  Clock,
  Factory,
  DollarSign,
  Briefcase,
  ShieldCheck,
  Users,
  Building,
  Truck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ArrowRight,
  UserCheck,
  Calendar,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Building2,
  UserCog,
  ShoppingCart,
  Activity,
  Layers,
  Filter,
  Sparkles,
  RefreshCcw,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const [userName, setUserName] = useState<string>('User');
  const [currentRole, setCurrentRole] = useState<string>('ADMIN');
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('month');
  const [loading, setLoading] = useState<boolean>(true);

  const [statsData, setStatsData] = useState<any>({ kpis: {}, chartData: [], activities: [] });

  // Fetch session & stats
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const { user } = await res.json();
          if (user?.name) setUserName(user.name);
          if (user?.role) setCurrentRole(user.role);
        }
      } catch (e) {}
    };
    fetchSession();
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/dashboard/stats?period=${period}`);
        if (res.ok) {
          const data = await res.json();
          setStatsData(data);
        }
      } catch (e) {
        console.error('Failed to load dashboard metrics:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [period]);

  const roleSelectors = [
    { key: 'ADMIN', label: 'Admin Executive', icon: Building2 },
    { key: 'PRODUCTION_MANAGER', label: 'Production', icon: Factory },
    { key: 'QUALITY_INSPECTOR', label: 'Quality', icon: ShieldCheck },
    { key: 'FINANCE_MANAGER', label: 'Finance', icon: DollarSign },
    { key: 'SUPPLY_CHAIN_MANAGER', label: 'Supply Chain', icon: Truck },
    { key: 'HR_MANAGER', label: 'HR / Labour', icon: Users },
    { key: 'SALES', label: 'Sales Commercial', icon: Briefcase },
  ];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const periodLabels = {
    week: 'This Week',
    month: 'This Month',
    quarter: 'This Quarter'
  };

  const kpiList = [
    {
      key: 'openPOs',
      title: 'Open Purchase Orders',
      value: statsData.kpis?.openPOs?.value ?? '—',
      trend: statsData.kpis?.openPOs?.trend ?? null,
      isUp: statsData.kpis?.openPOs?.isUp ?? true,
      icon: ShoppingCart,
      color: 'amber',
      subtitle: 'Pending Supplier Inflows',
      href: '/dashboard/purchase'
    },
    {
      key: 'pendingSalesOrders',
      title: 'Pending Sales Orders',
      value: statsData.kpis?.pendingSalesOrders?.value ?? '—',
      trend: statsData.kpis?.pendingSalesOrders?.trend ?? null,
      isUp: statsData.kpis?.pendingSalesOrders?.isUp ?? true,
      icon: Truck,
      color: 'amber',
      subtitle: 'Still to fulfil',
      href: '/dashboard/order-desk'
    },
    {
      key: 'lowStockItems',
      title: 'Low Stock Items',
      value: statsData.kpis?.lowStockItems?.value ?? '—',
      trend: statsData.kpis?.lowStockItems?.trend ?? null,
      isUp: false,
      icon: AlertTriangle,
      color: 'rose',
      subtitle: 'At or below reorder level',
      href: '/dashboard/inventory/items'
    },
    {
      key: 'revenueThisMonth',
      title: statsData.kpis?.revenueThisMonth?.label || 'Revenue This Period',
      value: typeof statsData.kpis?.revenueThisMonth?.value === 'number' ? formatCurrency(statsData.kpis.revenueThisMonth.value) : '—',
      trend: statsData.kpis?.revenueThisMonth?.trend ?? null,
      isUp: statsData.kpis?.revenueThisMonth?.isUp ?? true,
      icon: DollarSign,
      color: 'emerald',
      subtitle: 'Sales invoices, before GST',
      href: '/dashboard/finance'
    },
    {
      key: 'activeWorkOrders',
      title: 'Active Work Orders',
      value: statsData.kpis?.activeWorkOrders?.value ?? '—',
      trend: statsData.kpis?.activeWorkOrders?.trend ?? null,
      isUp: true,
      icon: Factory,
      color: 'indigo',
      subtitle: 'Assembly Shop Floor',
      href: '/dashboard/production'
    }
  ];

  // SVG Chart points calculation
  const chartPoints = statsData.chartData || [];
  const maxVal = Math.max(...chartPoints.map((d: any) => d.revenue || 0), 1);
  const chartHeight = 180;
  const chartWidth = 500;
  
  const getX = (idx: number) => {
    if (chartPoints.length <= 1) return chartWidth / 2;
    return (idx / (chartPoints.length - 1)) * (chartWidth - 40) + 20;
  };
  
  const getY = (val: number) => {
    return chartHeight - (val / maxVal) * (chartHeight - 30) - 15;
  };

  const pathD = chartPoints.length > 0 ? chartPoints.map((d: any, i: number) => 
    `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.revenue)}`
  ).join(' ') : '';

  const areaD = pathD ? `${pathD} L ${getX(chartPoints.length - 1)} ${chartHeight} L ${getX(0)} ${chartHeight} Z` : '';

  return (
    <div className="space-y-6">
      {/* 3a. Greeting Header Row with Period Filter Dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
              ERP Overview
            </span>
            <span className="text-xs font-semibold text-slate-400">Prodexa</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Welcome back, {userName}
          </h1>
          <p className="text-xs font-medium text-slate-500 mt-0.5">
            Real-time manufacturing metrics, shop floor orders, and financial indicators.
          </p>
        </div>

        {/* Period Filter Dropdown aligned right */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs">
            <Filter className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-bold text-slate-600">Period:</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer pr-1"
            >
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
            </select>
          </div>

          <button
            onClick={() => setPeriod(period)}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
            title="Refresh Data"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
          </button>
        </div>
      </div>


      <h2 className="pt-2 text-base font-semibold">Insights</h2>
      {/* 3b. KPI Card Row: 5 Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpiList.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Link
              key={kpi.key}
              href={kpi.href}
              className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200 group block relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform">
                  <Icon className="w-5 h-5 text-amber-600" />
                </div>

                {/* Trend Indicator: only where there is a real comparison */}
                {kpi.trend && <div
                  className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    kpi.isUp
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}
                >
                  {kpi.isUp ? (
                    <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3 text-amber-600" />
                  )}
                  <span>{kpi.trend}</span>
                </div>}
              </div>

              <div className="mt-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider truncate">
                  {kpi.title}
                </p>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight mt-0.5 truncate">
                  {kpi.value}
                </h2>
                <p className="text-[11px] font-medium text-slate-400 mt-1 truncate">
                  {kpi.subtitle}
                </p>
              </div>

              <div className="absolute bottom-0 inset-x-0 h-0.5 bg-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          );
        })}
      </div>

      {/* 3c. Two-Column Layout (60% Chart Card / 40% Recent Activity Feed) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (~60% width): Sales/Revenue Trend Chart Card */}
        <div className="lg:col-span-7 bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-amber-500" />
                Sales & Revenue Trend ({periodLabels[period]})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Sales invoices issued, before GST.
              </p>
            </div>
          </div>

          {/* SVG Trend Line Chart Visualization */}
          <div className="w-full overflow-x-auto py-2">
            <div className="min-w-[450px]">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-48 overflow-visible">
                <defs>
                  <linearGradient id="amberGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Grid lines */}
                {[0, 0.33, 0.66, 1].map((pct, i) => {
                  const yVal = chartHeight - pct * (chartHeight - 30) - 15;
                  return (
                    <g key={i}>
                      <line
                        x1="10"
                        y1={yVal}
                        x2={chartWidth - 10}
                        y2={yVal}
                        stroke="#e2e8f0"
                        strokeDasharray="4 4"
                      />
                    </g>
                  );
                })}

                {/* Area under line */}
                {areaD && <path d={areaD} fill="url(#amberGradient)" />}

                {/* Line Path */}
                {pathD && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Data Points */}
                {chartPoints.map((d: any, i: number) => {
                  const cx = getX(i);
                  const cy = getY(d.revenue);
                  return (
                    <g key={i} className="group/point">
                      <circle
                        cx={cx}
                        cy={cy}
                        r="5"
                        className="fill-slate-900 stroke-amber-500 stroke-2 hover:r-7 transition-all cursor-pointer"
                      />
                      {/* X Axis Labels */}
                      <text
                        x={cx}
                        y={chartHeight + 15}
                        textAnchor="middle"
                        className="text-[11px] font-bold fill-slate-500"
                      >
                        {d.name}
                      </text>
                      {/* Value callout text */}
                      <text
                        x={cx}
                        y={cy - 10}
                        textAnchor="middle"
                        className="text-[11px] font-bold fill-slate-900 opacity-0 group-hover/point:opacity-100 transition-opacity"
                      >
                        ₹{(d.revenue / 1000).toFixed(0)}k
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Chart Summary Metric Cards */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
              <p className="text-[11px] font-bold text-slate-400 uppercase">Period Peak Revenue</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">₹ 1,35,500</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
              <p className="text-[11px] font-bold text-slate-400 uppercase">Target Completion</p>
              <p className="text-sm font-bold text-emerald-600 mt-0.5">112% Achieved</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
              <p className="text-[11px] font-bold text-slate-400 uppercase">Avg Order Value</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">₹ 38,600</p>
            </div>
          </div>
        </div>

        {/* Right Column (~40% width): Upcoming & Recent Activity Feed Card */}
        <div className="lg:col-span-5 bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Activity className="w-5 h-5 text-amber-500" />
                  Upcoming & Recent Activity
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Audit events, order dispatches, and inventory triggers.
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Audit
              </span>
            </div>

            {/* Activity Feed List */}
            <div className="mt-4 space-y-3">
              {(statsData.activities || []).map((act: any) => {
                return (
                  <Link
                    key={act.id}
                    href={act.href || '#'}
                    className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-slate-100 group"
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                        act.status === 'warning'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : act.status === 'danger'
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : act.status === 'info'
                          ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {act.type === 'PO' ? (
                        <ShoppingCart className="w-4 h-4" />
                      ) : act.type === 'STOCK' ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : act.type === 'WORK_ORDER' ? (
                        <Factory className="w-4 h-4" />
                      ) : (
                        <Truck className="w-4 h-4" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-900 truncate group-hover:text-amber-600 transition-colors">
                          {act.title}
                        </p>
                        <span className="text-[11px] font-medium text-slate-400 shrink-0">
                          {act.time}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {act.description}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* See More Link */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">5 recent events logged</span>
            <Link
              href="/dashboard/reports"
              className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 group"
            >
              <span>See More Activity Logs</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
