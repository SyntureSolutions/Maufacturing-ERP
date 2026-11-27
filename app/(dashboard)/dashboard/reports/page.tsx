'use client';

import React, { useState, useEffect } from 'react';
import { BarChart3, Download, RefreshCcw, Filter, FileSpreadsheet } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';

export default function ReportsPage() {
  const [reportType, setReportType] = useState('FINANCIAL');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports?type=${reportType}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [reportType]);

  // Dummy chart data for demo
  const chartData = [
    { name: 'Jan', Sales: 4000, Purchases: 2400 },
    { name: 'Feb', Sales: 3000, Purchases: 1398 },
    { name: 'Mar', Sales: 2000, Purchases: 9800 },
    { name: 'Apr', Sales: 2780, Purchases: 3908 },
    { name: 'May', Sales: 1890, Purchases: 4800 },
    { name: 'Jun', Sales: 2390, Purchases: 3800 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Enterprise Reporting</h2>
          <p className="text-slate-500 mt-1">Generate and analyze cross-module business intelligence.</p>
        </div>
        <div className="flex gap-3">
           <button onClick={fetchReport} className="p-3 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm">
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button className="flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20">
            <Download className="w-5 h-5" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-6">
        <div className="flex gap-4">
          <button 
            onClick={() => setReportType('FINANCIAL')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${reportType === 'FINANCIAL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Financial Summary
          </button>
          <button 
            onClick={() => setReportType('PRODUCTION')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${reportType === 'PRODUCTION' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Production Yield
          </button>
        </div>
      </div>

      {reportType === 'FINANCIAL' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Revenue vs Expenses (YTD)</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                  <Legend iconType="circle" />
                  <Bar dataKey="Sales" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Purchases" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
             <h3 className="text-lg font-bold text-slate-800 mb-6">Cash Flow Trend</h3>
             <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                  <Legend iconType="circle" />
                  <Line type="monotone" dataKey="Sales" stroke="#3b82f6" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {reportType === 'PRODUCTION' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-slate-800">Production Metrics & Yield</h3>
          {loading ? (
            <p className="text-slate-500 text-center py-12">Loading production data...</p>
          ) : data ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-sm font-bold text-slate-500 uppercase">Total Work Orders</p>
                  <p className="text-3xl font-bold text-slate-900">{data.total || 0}</p>
                </div>
                <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-100">
                  <p className="text-sm font-bold text-emerald-600 uppercase">Completed</p>
                  <p className="text-3xl font-bold text-emerald-700">{data.completed || 0}</p>
                </div>
                <div className="p-6 bg-indigo-50 rounded-xl border border-indigo-100">
                  <p className="text-sm font-bold text-indigo-600 uppercase">Production Efficiency</p>
                  <p className="text-3xl font-bold text-indigo-700">
                    {data.total ? Math.round(((data.completed || 0) / data.total) * 100) : 0}%
                  </p>
                </div>
              </div>

              {data.data && data.data.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-medium">
                        <th className="py-3 px-4">Work Order #</th>
                        <th className="py-3 px-4">Product</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Target Qty</th>
                        <th className="py-3 px-4">Produced Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {data.data.map((wo: any, index: number) => (
                        <tr key={wo._id || index} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-mono font-medium text-indigo-600">{wo.workOrderNumber || `WO-${index + 1}`}</td>
                          <td className="py-3 px-4">{typeof wo.product === 'object' ? wo.product?.name : wo.product || 'N/A'}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${wo.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {wo.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold">{wo.targetQuantity || '-'}</td>
                          <td className="py-3 px-4 font-semibold">{wo.producedQuantity || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-12">No production data available.</p>
          )}
        </div>
      )}
    </div>
  );
}
