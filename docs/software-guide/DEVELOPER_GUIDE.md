# Prodexa ERP – Developer Guide

## 1. Run it locally

```bash
npm install
# create .env (never commit it) with at least:
#   MONGODB_URI=<your MongoDB / Atlas connection string>
#   AUTH_SECRET=<long random string>        # not in the current .env – add it
npm run dev            # http://localhost:3000
npm run db:seed        # npx tsx lib/seed.ts – demo users, suppliers, products, accounts
npm test               # vitest (uses in-memory MongoDB; no Atlas needed)
npm run build && npm start
```

Optional environment variables the code reads:

| Purpose | Variables |
|---|---|
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` |
| SMS (Twilio) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
| WhatsApp Cloud API | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` |
| Follow-up reminders | `CRON_SECRET`, `FOLLOWUP_ALERT_EMAIL` |
| Other (in `.env`, not traced in code read) | `BREVO_API_KEY`, `CLOUDINARY_*` |

Demo logins are listed in `lib/seed.ts` / `docs/Pending-Items.md` (`*@inventorypro.com`). Treat them as local-only.

## 2. Conventions to follow

1. **Route handler shape:** `dbConnect()` → `verifyAuth(req)` → role check → call a `lib/` function → return JSON. Keep business rules in `lib/`, not in the route.
2. **Throw `HttpError(status, message)`** for user-facing failures; the helper `statusOf` maps it (locked-period messages become 422).
3. **Anything that posts money** must: call `postJournal`/`postVoucher` (balanced, period-checked), be **idempotent**, and **undo earlier steps** if a later step fails. Follow `lib/vendorBill.ts`, `lib/purchaseReturn.ts`, `lib/invoicing.ts` as templates.
4. **Stock changes** use conditional atomic updates (`$inc` with a guard in the filter) so concurrent users can't take the same units.
5. **Document numbers** come from `createNumbered`/`nextDocNumber` (`PREFIX-YYYY-0001`, unique-index retry).
6. **New write endpoint → add a role list** and make sure `tests/integration/auth-coverage.test.ts` still passes.
7. **New document type with files** → add it to `ATTACHMENT_TYPES` in `lib/attachmentAccess.ts`. **New linked document** → store a real ObjectId ref to the parent and extend `lib/lineage.ts`.
8. **Approval-gated documents** → add the module to `lib/approvalModules.ts`, a case in `applyOutcome` (`lib/approvals.ts`) and call `requestApproval` before posting.
9. Keep UI-safe constants (roles lists, module info) free of database imports — some are imported into the browser.

## 3. Testing

- Unit tests (`tests/*.test.ts`) cover pure logic: GST, tally XML, OEE, pivot, labels, PO PDF, report math, jobwork, workOrderPlan, approvals tiering, notification templates, creditor aging, e-invoice.
- Integration tests (`tests/integration/*`) start an in-memory MongoDB (`harness.ts`) and exercise whole flows: sales-to-cash, purchase-to-pay, procure-to-production, partial dispatch/receipts, price lock, SFG QC, costing, Bill of Entry, purchase return after billing, attachments, lineage, approvals, OEE.
- Config: `vitest.config.ts` (node env, 6 workers, 120 s hook / 60 s test timeouts, `@` alias to repo root).
- `docs/Pending-Items.md` states that **no screen has been exercised in a browser**; automated tests cover logic and APIs only.
- Excel test plan and tester PDF: `docs/Prodexa-ERP-Test-Plan.xlsx`, `docs/Prodexa-ERP-Changes-for-Testers.pdf`.

## 4. Where to look for what

| I want to… | Start here |
|---|---|
| Change how stock is reserved | `lib/allocation.ts`, `lib/mrn.ts`, `lib/salesOrderApproval.ts` |
| Change MRP netting | `lib/mrpEngine.ts` (`runMRP`), `lib/salesOrderMrp.ts` |
| Add a ledger or voucher type | `lib/accounting.ts` (`ACC`, `VOUCHER_PREFIX`), `models/Voucher.ts`, `lib/voucherBuilder.ts` |
| Change GST rules | `lib/gst.ts`, `lib/invoicing.ts`, `lib/einvoice.ts` |
| Add an approval type | `lib/approvalModules.ts`, `lib/approvals.ts`, `models/ApprovalMatrix.ts` |
| Add a notification event | `models/Notification.ts` (`NOTIFY_EVENTS`), `lib/notifyTemplate.ts` (`DEFAULT_TEMPLATES`, `EVENT_VARIABLES`) |
| Add a sidebar page | `components/layout/DashboardLayoutClient.tsx` (role map + `navCategories`) and `app/(dashboard)/dashboard/<name>/page.tsx` |
| Understand a cost number | `lib/costing.ts` |
| Add a report | `lib/reportMath.ts`, `app/api/finance/reports`, `app/api/bi` |

## 5. Known issues and backlog

Collected from `docs/Pending-Items.md` and this review.

**Functional gaps:** supplier refund on a paid bill · invoice cancellation · order-edit edge cases (hand-made orders never price-locked; duplicate product lines) · unbilled-goods valuation excludes GST and unlinked invoices · Files button missing on quality, projects, shipments, export documents · job-worker service bill not booked as payable · no "unlinked documents" report · costing excludes labour/overhead.

**Environment:** live email/SMS/WhatsApp and NIC e-invoice/e-way upload need credentials · a scheduler for `/api/cron/followups` · a full browser pass.

**Hygiene:** ~1,500 lint warnings (mostly `any`) · some read endpoints open to any role · request-body spreading in older routes · legacy `Order` model and in-memory fallbacks · root-level planning files (`task1`, `implementation_plan*`, `walkthrough*`, `seed_error.log`) could move under `docs/`.

**Security (see ROLES_AND_SECURITY.md):** default `AUTH_SECRET` fallback · demo-login fallback in `/api/auth/login` · hard-coded seed key on `/api/seed` · secrets in `.env`/`credentials.md` · cookie lacks `secure`/`sameSite`.

## 6. Documentation set

| File | Purpose |
|---|---|
| `README.md` | Index and product summary |
| `ARCHITECTURE.md` | Stack, layout, runtime flow, patterns, accounting/cost/GST design, risks |
| `FEATURES.md` | Module-by-module feature catalogue with rules and roles |
| `BUSINESS_FLOWS.md` | End-to-end flows with diagrams, books impact, statuses |
| `DATA_MODELS.md` | Collections, fields, relationships |
| `API_REFERENCE.md` | All API routes grouped by module |
| `ROLES_AND_SECURITY.md` | Roles, enforcement layers, approvals, findings |
| `DEVELOPER_GUIDE.md` | Setup, conventions, tests, backlog (this file) |
