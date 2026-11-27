import Supplier, { VENDOR_ACCOUNT_GROUP_LABELS } from '@/models/Supplier';
import { HttpError } from '@/lib/httpError';
import { amountOf, checkPostalCode, countryOf, groupCode, gstProfile, incotermOf, taxNumbers } from '@/lib/partyMaster';

export const SUPPLIER_WRITE_ROLES = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER', 'FINANCE_MANAGER'];

const TEXT_FIELDS = ['name2', 'searchTerm', 'contactPerson', 'email', 'phone', 'address', 'city', 'pincode', 'region', 'bankDetails',
  'companyCode', 'reconciliationAccount', 'paymentTerms', 'paymentMethod', 'toleranceGroup', 'withholdingTaxCode',
  'purchasingOrg', 'pricingSchemaGroup'] as const;

/**
 * Turns a request body (a form, or a row of the ERP Vendor Master Template) into supplier fields.
 * Only fields that were sent are returned, so an update leaves the rest alone. Throws HttpError(400) on bad values.
 * `existing` is the supplier being updated, if any.
 */
export async function supplierData(b: any, existing?: { _id: any; code: string; country?: string } | null) {
  const data: Record<string, any> = {};
  if (b.name !== undefined || !existing) {
    if (!String(b.name || '').trim()) throw new HttpError(400, 'Vendor name is required.');
    data.name = String(b.name).trim();
  }
  for (const f of TEXT_FIELDS) if (b[f] !== undefined) data[f] = b[f] === null ? '' : String(b[f]).trim();

  const country = b.country !== undefined ? countryOf(b.country) : existing?.country || 'IN';
  if (b.country !== undefined || !existing) data.country = country;
  checkPostalCode(country, b.pincode);
  Object.assign(data, taxNumbers(country, b));
  // GST registration, constitution and e-way distance, checked against the GSTIN the vendor will have after this save
  Object.assign(data, gstProfile(b, { gstin: data.gstin ?? (existing as any)?.gstin, country }));

  if (b.accountGroup !== undefined) data.accountGroup = groupCode(b.accountGroup, VENDOR_ACCOUNT_GROUP_LABELS, 'Account group');
  else if (!existing) data.accountGroup = country === 'IN' ? 'DOMESTIC' : 'FOREIGN';
  if (data.accountGroup === 'FOREIGN' && country === 'IN') throw new HttpError(400, 'A foreign supplier needs its country (e.g. JP), not IN.');

  if (b.orderCurrency !== undefined) {
    const c = String(b.orderCurrency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(c)) throw new HttpError(400, 'Order currency must be a 3-letter code (e.g. INR, USD).');
    data.orderCurrency = c;
  }
  if (b.incoterm !== undefined) data.incoterm = incotermOf(b.incoterm) ?? '';
  if (b.minOrderValue !== undefined) data.minOrderValue = amountOf(b.minOrderValue, 'Minimum order value');
  if (b.leadTime !== undefined) data.leadTime = amountOf(b.leadTime, 'Lead time');
  if (b.performanceRating !== undefined) data.performanceRating = amountOf(b.performanceRating, 'Performance rating');
  if (b.certifications !== undefined) data.certifications = Array.isArray(b.certifications) ? b.certifications.map(String) : [];
  if (b.isActive !== undefined) data.isActive = Boolean(b.isActive);

  // Partner functions name another vendor by its Vendor ID; the vendor itself is always allowed.
  const ownCode = String(b.code ?? existing?.code ?? '').trim();
  for (const f of ['orderingAddress', 'invoicingParty'] as const) {
    if (b[f] === undefined) continue;
    const partner = String(b[f] ?? '').trim();
    if (partner && partner !== ownCode && !(await Supplier.exists({ code: partner }))) throw new HttpError(400, `${f === 'orderingAddress' ? 'Ordering address' : 'Invoicing party'} ${partner} is not a known vendor.`);
    data[f] = partner;
  }
  return data;
}
