'use client';

import { CONSTITUTIONS, GST_REGISTRATIONS } from '@/lib/partyMaster';

// GST registration status, constitution of business and the road distance used on e-way bills, for the customer and
// vendor forms. The server checks the registration against the GSTIN and country.

type Values = { gstRegistration?: string; constitution?: string; distanceKm?: string | number | null; gstin?: string; country?: string };

export default function GstProfileFields({ value, onChange }: { value: Values; onChange: (patch: Partial<Values>) => void }) {
  const field = 'w-full px-3 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm';
  const label = 'text-xs font-bold text-slate-700 uppercase tracking-wider';
  // what the registration will be taken as when none is chosen (parties saved before it was asked)
  const assumed = value.country && value.country !== 'IN' ? 'OVERSEAS' : value.gstin ? 'REGISTERED' : 'UNREGISTERED';
  const reg = value.gstRegistration || '';
  const needsGstin = ['REGISTERED', 'COMPOSITION', 'SEZ'].includes(reg);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="space-y-2">
        <label className={label} htmlFor="gst-registration">GST registration</label>
        <select id="gst-registration" className={field} value={reg} onChange={e => onChange({ gstRegistration: e.target.value })}>
          <option value="">{`Not set (taken as ${GST_REGISTRATIONS[assumed as keyof typeof GST_REGISTRATIONS].toLowerCase()})`}</option>
          {Object.entries(GST_REGISTRATIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {needsGstin && !value.gstin && <p className="text-[11px] text-amber-700">Enter the GSTIN above.</p>}
      </div>
      <div className="space-y-2">
        <label className={label} htmlFor="gst-constitution">Constitution of business</label>
        <select id="gst-constitution" className={field} value={value.constitution || ''} onChange={e => onChange({ constitution: e.target.value })}>
          <option value="">Not set</option>
          {Object.entries(CONSTITUTIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <label className={label} htmlFor="gst-distance">Distance for e-way bill (km)</label>
        <input id="gst-distance" type="number" min="0" max="4000" step="1" className={field} value={value.distanceKm ?? ''}
          onChange={e => onChange({ distanceKm: e.target.value })} placeholder="Road km from our works" />
      </div>
    </div>
  );
}
