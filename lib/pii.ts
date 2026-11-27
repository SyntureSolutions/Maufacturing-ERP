/**
 * PII Masking Engine for Executive Viewer & Data Privacy Protection
 * Protects personal contact details and banking information from unnecessary exposure.
 */

export function maskPhone(phone?: string): string {
  if (!phone) return 'N/A';
  const clean = phone.trim();
  if (clean.length <= 4) return '****';
  const visibleStart = clean.slice(0, 5);
  const visibleEnd = clean.slice(-3);
  return `${visibleStart}****${visibleEnd}`;
}

export function maskEmail(email?: string): string {
  if (!email || !email.includes('@')) return 'N/A';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `*@${domain}`;
  const maskedUser = user[0] + '***' + user[user.length - 1];
  return `${maskedUser}@${domain}`;
}

export function maskBankAccount(accountNo?: string): string {
  if (!accountNo) return 'N/A';
  const clean = accountNo.replace(/\s+/g, '');
  if (clean.length <= 4) return '****';
  return `******${clean.slice(-4)}`;
}

/**
 * Sanitizes an object by masking sensitive personal fields if the requesting user is a VIEWER
 */
export function sanitizeForViewer<T extends Record<string, any>>(record: T, userRole?: string): T {
  if (userRole !== 'VIEWER') {
    return record; // Authorized operational users receive full operational details
  }

  if (!record || typeof record !== 'object') return record;

  const copy: any = { ...record };

  // Mask Contact Details
  if (copy.phone) copy.phone = maskPhone(copy.phone);
  if (copy.contactPhone) copy.contactPhone = maskPhone(copy.contactPhone);
  if (copy.email) copy.email = maskEmail(copy.email);
  if (copy.contactEmail) copy.contactEmail = maskEmail(copy.contactEmail);

  // Mask Bank / Financial Account Details
  if (copy.bankAccountNumber) copy.bankAccountNumber = maskBankAccount(copy.bankAccountNumber);
  if (copy.accountNumber) copy.accountNumber = maskBankAccount(copy.accountNumber);
  if (copy.beneficiaryAccount) copy.beneficiaryAccount = maskBankAccount(copy.beneficiaryAccount);

  // Mask nested customer or supplier
  if (copy.customer && typeof copy.customer === 'object') {
    copy.customer = sanitizeForViewer(copy.customer, userRole);
  }
  if (copy.supplier && typeof copy.supplier === 'object') {
    copy.supplier = sanitizeForViewer(copy.supplier, userRole);
  }

  return copy as T;
}

/**
 * Sanitizes an array of records for VIEWER
 */
export function sanitizeListForViewer<T extends Record<string, any>>(list: T[], userRole?: string): T[] {
  if (userRole !== 'VIEWER') return list;
  return list.map(item => sanitizeForViewer(item, userRole));
}
