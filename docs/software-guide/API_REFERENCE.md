# Prodexa ERP – API Reference

All endpoints are Next.js route handlers under `app/api/**/route.ts`, return JSON, and (except login/vendor-ack/cron/seed) require the `session` cookie. Auth is checked **inside each handler** (the page middleware does not cover `/api`). The "Roles / guard" column shows the allow-lists or helpers found in the handler source; where it is blank no explicit role list was found by static scan — "any signed-in user" is likely but **verify in the file** before relying on it.

Role abbreviations: A=ADMIN, M=MANAGER, S=STAFF, SA=SALES, V=VIEWER, PM=PRODUCTION_MANAGER, QI=QUALITY_INSPECTOR, FM=FINANCE_MANAGER, HR=HR_MANAGER, SC=SUPPLY_CHAIN_MANAGER. `canViewFinance` = A, M, FM, V.

## Auth
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Verify email + bcrypt password → set `session` cookie (JWT, 24 h). Also accepts a hard-coded demo-account fallback (see Security) |
| POST | `/api/auth/logout` | Clear cookie |
| GET | `/api/auth/session` | Current user |

## Catalog and master data
| Method | Path | Purpose / guard |
|---|---|---|
| GET POST | `/api/products` | List/create products |
| GET PATCH DELETE | `/api/products/[id]` | A, M for writes |
| GET POST | `/api/categories` | A, M |
| GET POST | `/api/production/bom` | BOM list/create |
| GET POST | `/api/suppliers` | POST A, M, SC, FM; keeps a Vendor ID that is sent, else `SUP-YYYY-0001` |
| GET PATCH DELETE | `/api/suppliers/[id]` | PATCH only the fields sent (Vendor ID fixed); DELETE A, M, refused when the supplier is on a PO, GRN or bill |
| GET POST | `/api/source-lists`, PATCH DELETE `/api/source-lists/[id]` | Source list (A, M, SC write); `?product=` filter |
| GET POST | `/api/storage-locations`, PATCH `/api/storage-locations/[id]` | Storage locations (A, M, SC write); `?all=1` includes inactive |
| GET POST | `/api/customers` | writes A, M, SA, FM; read `canViewParties` |
| GET PUT | `/api/settings/company` | write A, FM; read `canViewParties` |

## CRM and sales
| Method | Path | Purpose / guard |
|---|---|---|
| GET POST | `/api/enquiries` | |
| POST | `/api/enquiries/[id]/convert` | Enquiry → quotation |
| POST PATCH | `/api/enquiries/[id]/followups` | Add / update follow-up (A, M, SA, S) |
| GET | `/api/followups` | Upcoming/overdue follow-ups |
| POST | `/api/cron/followups` | Scheduler endpoint, header `x-cron-secret` |
| GET POST | `/api/quotations` | |
| PATCH | `/api/quotations/[id]` | Stage change; loss needs category |
| GET POST | `/api/quotations/[id]/revise` | A, M, SA; refused while a discount request waits |
| POST | `/api/quotations/[id]/discount` | `request` (A, M, SA) / `approve` / `reject` by tier |
| GET | `/api/quotations/loss-analytics` | |
| GET POST | `/api/sales-orders` | |
| PATCH | `/api/sales-orders/[id]` | Edit under price lock; override A, M |
| GET | `/api/sales-orders/[id]/approval` | Approver view: lines against MSP and margin, credit position |
| POST | `/api/sales-orders/[id]/approval` | Approve + FEFO reserve; below MSP needs `approveBelowMsp` + `mspReason` (A, M) |
| POST | `/api/sales-orders/[id]/hold` | `hold` with reason / `release` (A, M) |
| POST | `/api/sales-orders/[id]/reserve` | Top-up reservation (A, M, SA, SC) |
| POST | `/api/sales-orders/[id]/cancel` | A, M, SA |
| GET POST | `/api/orders`, GET PATCH `/api/orders/[id]` | Legacy order flow |
| GET POST | `/api/proforma`, PATCH `/api/proforma/[id]` | A, M, SA, SC, FM |
| GET POST | `/api/sales/proforma` | Proforma helper |
| GET POST | `/api/forecasts` | PUT to set projections |

## Planning and procurement
| Method | Path | Purpose / guard |
|---|---|---|
| GET | `/api/mrp` | Latest/stored MRP data |
| POST | `/api/mrp/run` | Run MRP (A, M, PM, SC); `forOrder` for single-order |
| POST | `/api/mrp/indents` | Create indents from a run |
| POST | `/api/mrp/work-orders` | Create work orders from a run (A, M, PM) |
| GET | `/api/mrp/bom-tree` | Multi-level BOM explorer |
| GET POST | `/api/purchase-indents`, PATCH `/api/purchase-indents/[id]` | A, M, SC; GET adds `orderedQty` / `openQty` per line |
| GET POST | `/api/rfqs`, PATCH `/api/rfqs/[id]` | Quotes, compare, award |
| GET POST | `/api/purchase` | List/create PO; creation may open approval |
| GET PATCH | `/api/purchase/[id]` | A, M, FM |
| POST | `/api/purchase/[id]/dispatch` | Email PO + PDF to vendor (A, M, SC) |
| GET | `/api/purchase/[id]/pdf` | PO PDF (A, M, SC, FM) |
| GET POST | `/api/vendor-ack` | Public acknowledgement by token |
| GET POST | `/api/mrn`, PATCH `/api/mrn/[id]` | Material requisitions (A, M, PM, SC, S) |

## Receiving, quality, imports, returns
| Method | Path | Purpose / guard |
|---|---|---|
| GET POST | `/api/grn` | Gate inward → QUARANTINE (A, M, S, SC, QI) |
| PATCH | `/api/grn/[id]` | Inspect / accept / reject / put-away (A, M, QI) |
| GET POST PATCH | `/api/quality` | Quality checks (A, M, QI) |
| GET POST | `/api/quality/ncr` | NCRs |
| GET POST | `/api/purchase-returns` | RTV (A, FM, SC) |
| GET POST | `/api/bill-of-entry`, POST `/api/bill-of-entry/[id]/cancel` | A, FM, SC, M, V (read); cancel A, FM |
| GET POST | `/api/vendor-bills` | 3-way-match bills (A, FM write; `canViewFinance` read) |
| GET | `/api/vendor-bills/open` | Receipts awaiting a bill |
| GET | `/api/vendor-bills/payables` | Accounts payable (+CSV, as-of) |
| GET | `/api/vendor-bills/advances` | Unapplied supplier advances |
| POST | `/api/vendor-bills/[id]/pay` | Release payment (A, FM) |
| POST | `/api/vendor-bills/[id]/apply-advance` | A, FM |

## Inventory
| Method | Path | Purpose |
|---|---|---|
| GET POST | `/api/inventory/batches` | Batch list/create |
| POST | `/api/inventory/adjust` | Manual adjustment (reason required) |
| GET POST PATCH | `/api/inventory/cycle-counts`, POST `…/[id]/post` | Cycle count lifecycle |
| GET POST PATCH | `/api/inventory/transfers` | Warehouse transfers |
| GET POST | `/api/inventory/valuation` | FIFO / Weighted-Average / LIFO; optional COGS post |
| GET POST | `/api/inventory/replenish` | Auto-replenishment scan |
| GET | `/api/scrap` | Scrap register |

## Production
| Method | Path | Purpose / guard |
|---|---|---|
| GET POST | `/api/production` | Work orders (A, M, PM) |
| GET PATCH | `/api/production/[id]` | Status changes; QC gate A, QI |
| POST | `/api/production/[id]/routing` | Set stage routing (A, M, PM) |
| POST | `/api/production/[id]/stage-output` | Log good/scrap/rework (A, M, PM, S) |
| POST | `/api/production/[id]/fg-qc` | FG sign-off (A, QI) |
| GET | `/api/production/[id]/jobcard` | Printable job card |
| GET POST | `/api/production/machines` | Machine master |
| GET | `/api/sfg`, `/api/sfg/finished` | SFG stock |
| POST | `/api/sfg/[id]/qc` | SFG QC disposition (A, QI) |
| POST | `/api/sfg/[id]/reissue` | Re-issue to WO (A, M, PM) |
| GET POST | `/api/machine-runs`, DELETE `/api/machine-runs/[id]` | OEE data (A, M, PM, S) |
| GET | `/api/oee` | OEE aggregates |
| POST | `/api/operations/override` | Cross-department override (VIEWER blocked; PM needs M/A) |

## Dispatch and sales documents
| Method | Path | Purpose / guard |
|---|---|---|
| GET POST | `/api/delivery-challans` | Create challan (A, M, SA, SC, FM, S) |
| POST | `/api/delivery-challans/[id]/cancel` | A, M, SA, SC |
| GET POST | `/api/dispatch/invoices` | List / issue tax invoice (A, FM; list `canViewInvoices`) |
| GET PATCH | `/api/dispatch/invoices/[id]` | E-way/e-invoice details |
| GET POST | `/api/finance/invoices` | Finance-side invoices (A, FM) |
| GET POST | `/api/supply-chain`, `/api/export-import` | Shipments and export documents |

## Job work
| Method | Path | Purpose / guard |
|---|---|---|
| GET POST | `/api/jobwork` | Outward/inward job work (A, M, PM, SC) |
| PATCH | `/api/jobwork/[id]` | Receipts, returns, invoicing (A, FM / others) |
| POST | `/api/jobwork/[id]/po` | PO to job worker |
| POST | `/api/jobwork/[id]/sales-order` | Service SO for inward job work (A, M, SA, PM) |
| GET | `/api/jobwork/itc04` | ITC-04 status |

## Finance
| Method | Path | Purpose / guard |
|---|---|---|
| GET | `/api/accounts` | Chart of accounts (`canViewFinance`) |
| GET | `/api/finance/gl` | General ledger |
| GET | `/api/finance/ar/aging` | Debtors aging |
| GET POST | `/api/finance/assets` | Fixed assets |
| GET | `/api/finance/reports` | TB / P&L / Balance sheet |
| GET POST | `/api/vouchers` | Post a voucher or queue for approval (A, FM write) |
| GET POST | `/api/gst` | GST return summaries (A, FM prepare) |
| GET | `/api/tally/export` | Tally XML (A, FM) |
| GET PUT | `/api/settings/period-lock` | Lock dates (A, FM) |
| GET POST | `/api/settings/approval-thresholds` | Legacy thresholds (A, FM) |

## Governance and system
| Method | Path | Purpose |
|---|---|---|
| GET PUT | `/api/approvals/rules` | Approval matrix rules (A, M, FM, SC, PM, HR) |
| GET POST | `/api/approvals/requests` | Inbox / raise request |
| PATCH | `/api/approvals/requests/[id]` | Approve / reject current level (`canAct`) |
| GET POST | `/api/audit` | Audit log |
| GET POST | `/api/attachments`, GET DELETE `/api/attachments/[id]` | Files; `canAccessAttachments` |
| GET | `/api/lineage`, POST `/api/lineage/backfill` | Document chain; backfill refs (dry-run) |
| GET PUT | `/api/notifications/templates` | A, M |
| GET | `/api/notifications/log` | Communication log |
| GET | `/api/dashboard/stats`, `/api/reports`, `/api/bi` | Dashboard and reporting data |
| GET | `/api/seed?key=…` | **Demo seed – clears data**; protected only by a hard-coded key (see Architecture risks) |
| GET POST | `/api/labour`, `/api/labour/jobs`, `/api/labour/attendance`, `/api/labour/payroll` | HR / labour (HR, PM, FM per route) |
| GET POST | `/api/projects` | Customer projects |

## Error conventions
`HttpError(status, message)` → JSON `{ error }` with that status. Typical codes: 400 validation, 401 not signed in, 403 role, 404 not found, 409 conflict/race (e.g., payment lost a race for the same balance), 422 locked accounting/inventory period.
