# Roles, Access and Security

## 1. Roles

| Role | Typical person | Main areas (from sidebar role map and API guards) |
|---|---|---|
| **ADMIN** | System owner | Everything; can act on any approval level; override price lock; period lock |
| **MANAGER** | Operations manager | Broad operational access; cross-department overrides; approvals; audit view |
| **SUPPLY_CHAIN_MANAGER** | Purchasing / logistics | Suppliers, PO, GRN, indents, RFQ, MRP, dispatch, transfers, import BoE, job work |
| **PRODUCTION_MANAGER** | Shop-floor head | Work orders, routing, WIP, MRP, OEE, job work, labour (view), inventory |
| **QUALITY_INSPECTOR** | QC | GRN inspection, quality checks, NCR, SFG QC, FG sign-off, WIP, labels |
| **FINANCE_MANAGER** | Accounts | Vouchers, vendor bills, payables, BoE, invoices, GST, Tally, period lock, financial reports |
| **SALES** | Sales / order desk | Enquiries, quotations, orders, order desk, proforma, dispatch (view/create), customers |
| **HR_MANAGER** | HR | Labour, attendance, payroll, projects, audit, approvals |
| **STAFF** | Warehouse staff | GRN gate entry, MRN issue, stage output, machine runs, dispatch (create), labels |
| **VIEWER** | Executive (read-only) | Read-only on most screens, finance included, with **PII masking** |

Seed users exist for each role under `*@inventorypro.com` (see `lib/seed.ts`). Demo password is documented in `docs/Pending-Items.md` as for test environments only — change/remove in any real deployment.

## 2. How access is enforced (three layers)

1. **Page routes** – `middleware.ts` redirects unauthenticated users to `/login`.
2. **Navigation** – `DashboardLayoutClient.tsx` hides modules not allowed for the role (convenience, not security).
3. **API handlers** – each route calls `verifyAuth` and checks roles. Shared helpers in `lib/accessRoles.ts`:
   - `canViewFinance`: ADMIN, MANAGER, FINANCE_MANAGER, VIEWER
   - `canViewInvoices`: finance viewers + SALES, SUPPLY_CHAIN_MANAGER, STAFF
   - `canViewParties` (customers, company bank details): invoice viewers + PRODUCTION_MANAGER
   - `canAccessAttachments` (`lib/attachmentAccess.ts`): files on money documents follow the document's rules; other documents are open to any signed-in role.

Additional data-level controls: lineage hides money nodes (`INVOICE`, `RECEIPT`, `VENDOR_BILL`, `PAYMENT`, `BILL_OF_ENTRY`) from non-finance roles; `lib/pii.ts` masks phone, email and bank numbers for VIEWER.

## 3. Approval matrix

| Module | Basis | While pending |
|---|---|---|
| Purchase orders | PO total | Stays DRAFT; rejection returns it for amendment |
| Sales orders | Order total | Stays DRAFT; no stock reserved |
| Expense vouchers | Incl. GST | Nothing posted |
| Bank/cash payments | Payment amount | Not posted; invoice not settled |
| Credit notes | Incl. GST | Not posted |
| Outward job work | Value of material | No stock leaves; no challan |

Rules are `module + minAmount → [roleLevel1, roleLevel2…]`; the rule with the highest threshold not above the amount applies. Only the role at the current level (or ADMIN) can act.

## 4. Integrity safeguards

- **Atomic claims** (conditional updates) for stock, order quantities and balances; rollback on failure.
- **Idempotency**: voucher `idempotencyKey`, duplicate UTR refusal, same-request-twice detection on payments.
- **Period lock** for accounting and inventory dates.
- **Audit log** on key actions; price-lock overrides keep reason + changed fields.
- **Unique indexes**: document numbers, one pending approval per document, one posted Bill of Entry per number+port.
- **Hard QC gate** on allocation (REJECTED / ON_HOLD / PENDING_QC never allocated).

## 5. Security findings to act on

| # | Finding | Why it matters | Suggested fix |
|---|---|---|---|
| 1 | `lib/auth.ts` uses `AUTH_SECRET \|\| 'your-default-secret-key'` and `AUTH_SECRET` is not in `.env` | Anyone knowing the default can forge an ADMIN session | Set a strong `AUTH_SECRET`; make startup fail if missing |
| 2 | Session cookie set with `httpOnly` and expiry only | No `secure`/`sameSite` flags set in `login()` | Add `secure: true` (prod) and `sameSite: 'lax'` |
| 3 | `GET /api/seed` wipes data and recreates demo users, guarded only by a key hard-coded in the source (`?key=…`) | Destructive endpoint on a GET; key is visible to anyone with the code | Remove, or require ADMIN + non-production flag + env-based secret |
| 3b | `POST /api/auth/login` falls back to a hard-coded list of demo accounts whenever the DB user isn't found (even if the DB is up) | Documented demo credentials grant ADMIN in any environment | Delete the `DEMO_USERS` fallback outside local demos |
| 4 | `.env` holds live-looking credentials (DB, SMTP, Brevo, Cloudinary); `credentials.md` also exists and is **not** matched by `.gitignore` (only `.env*` is) | Leak risk; Pending-Items says the Atlas password should be rotated | Rotate credentials; add `credentials.md` to `.gitignore` or delete it; check git history |
| 5 | Some operational GETs (GRN, orders, quality, supply chain) allow any signed-in role | Over-broad read access (H3 in Pending-Items) | Add role lists |
| 6 | Older routes spread request bodies into records | Mass-assignment risk (H5) | Whitelist fields / use zod |
| 7 | Default demo password | Weak credential | Disable seed accounts outside test |
| 8 | `/register` page exists; the page source contains no API call (appears to be a placeholder) | Confirm no open sign-up path is intended | Remove or restrict the page |
