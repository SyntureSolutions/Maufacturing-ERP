export const TERMS_PRESETS = [
  { key: 'STANDARD', label: 'Standard domestic', text: '1. Prices are ex-works and exclusive of GST unless stated.\n2. Payment as per the payment terms above; interest at 18% p.a. on overdue invoices.\n3. Delivery within the stated lead time from receipt of PO and advance (if any).\n4. Quotation valid until the date shown. Prices are subject to change after expiry.\n5. Warranty: 12 months against manufacturing defects. Wear parts excluded.\n6. Disputes subject to the jurisdiction of the company registered office.' },
  { key: 'EXPORT', label: 'Export (FOB / CIF)', text: '1. Prices are in the quoted currency under the stated Incoterm and port.\n2. Payment by advance TT / irrevocable LC at sight as agreed.\n3. Shipment within the stated lead time from LC / advance receipt.\n4. Export packing included. Insurance and freight as per Incoterm.\n5. Any duties, taxes and charges outside India are the buyer\'s account.\n6. Quotation valid until the date shown.' },
  { key: 'PROJECT', label: 'Project / bulk order', text: '1. Prices hold for the quantities quoted; staggered delivery by agreement.\n2. 30% advance with PO, 60% before dispatch, 10% within 30 days of delivery.\n3. Change in specification after PO may change price and lead time.\n4. Cancellation after production start attracts charges for material and work done.' },
] as const;

export const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
export const rev = (n: number) => `Rev-${String(n).padStart(2, '0')}`;
