import { ACCOUNT_GROUP_LABELS, SALES_ORGS, DISTRIBUTION_CHANNELS, DIVISIONS } from '@/models/Customer';
import { HttpError } from '@/lib/httpError';
import { amountOf, checkPostalCode, countryOf, groupCode, gstProfile, incotermOf, taxNumbers } from '@/lib/partyMaster';

export const CUSTOMER_WRITE_ROLES = ['ADMIN', 'MANAGER', 'SALES', 'FINANCE_MANAGER'];

/** "SO01 (North Region)" as written in the template is stored as its code, SO01. */
const areaCode = (v: any) => String(v ?? '').split('(')[0].trim().toUpperCase();

function salesAreasOf(list: any): any[] {
  if (!Array.isArray(list)) throw new HttpError(400, 'salesAreas must be a list.');
  const areas = list.map((a: any) => ({ salesOrg: areaCode(a?.salesOrg), distributionChannel: areaCode(a?.distributionChannel), division: areaCode(a?.division), salesDistrict: a?.salesDistrict, pricingProcedure: a?.pricingProcedure, shippingConditions: a?.shippingConditions, incoterm: incotermOf(a?.incoterm) }));
  if (areas.some((a: any) => !a.salesOrg || !a.distributionChannel || !a.division)) throw new HttpError(400, 'Each sales area needs a sales org, distribution channel and division.');
  const unknown = (a: any) => !SALES_ORGS[a.salesOrg] ? `sales org ${a.salesOrg}` : !DISTRIBUTION_CHANNELS[a.distributionChannel] ? `distribution channel ${a.distributionChannel}` : !DIVISIONS[a.division] ? `division ${a.division}` : '';
  const bad = areas.map(unknown).find(Boolean);
  if (bad) throw new HttpError(400, `Unknown ${bad}.`);
  const keys = areas.map((a: any) => `${a.salesOrg}|${a.distributionChannel}|${a.division}`);
  if (new Set(keys).size !== keys.length) throw new HttpError(400, 'The same sales area is listed twice.');
  return areas;
}

/**
 * Turns a request body (a form, or a row of the ERP Customer Master Template) into customer fields.
 * Fields that were not sent are left out, so an update changes only what was sent. Throws HttpError(400) on bad values.
 * `existing` is the customer being updated, if any.
 */
export function customerData(b: any, existing?: { country?: string; gstin?: string } | null) {
  if (b.name !== undefined || !existing) {
    if (!String(b.name || '').trim()) throw new HttpError(400, 'Name and billing address are required.');
  }
  if (b.billingAddress !== undefined || !existing) {
    if (!String(b.billingAddress || '').trim()) throw new HttpError(400, 'Name and billing address are required.');
  }
  const country = b.country !== undefined ? countryOf(b.country) : existing?.country || 'IN';
  checkPostalCode(country, b.pincode);
  const tax = taxNumbers(country, b);
  const data: Record<string, any> = {
    name: b.name !== undefined ? String(b.name).trim() : undefined,
    billingAddress: b.billingAddress !== undefined ? String(b.billingAddress).trim() : undefined,
    city: b.city, pincode: b.pincode, email: b.email, phone: b.phone, contactPerson: b.contactPerson,
    ...tax, stateCode: tax.gstin ? tax.gstin.slice(0, 2) : b.stateCode, country,
    accountGroup: b.accountGroup !== undefined ? groupCode(b.accountGroup, ACCOUNT_GROUP_LABELS, 'Account group') : undefined,
    searchTerm: b.searchTerm, region: b.region,
    companyCode: b.companyCode, reconciliationAccount: b.reconciliationAccount, paymentTerms: b.paymentTerms, paymentMethod: b.paymentMethod, dunningProcedure: b.dunningProcedure,
    creditLimit: amountOf(b.creditLimit, 'Credit limit'),
    // GST registration, constitution and e-way distance, checked against the GSTIN the customer will have after this save
    ...gstProfile(b, { gstin: tax.gstin ?? existing?.gstin, country }),
    tcsDeclaration27C: b.tcsDeclaration27C !== undefined ? Boolean(b.tcsDeclaration27C) : undefined,
    salesAreas: b.salesAreas !== undefined ? salesAreasOf(b.salesAreas) : undefined,
    isActive: b.isActive !== undefined ? Boolean(b.isActive) : undefined,
  };
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  return data;
}
