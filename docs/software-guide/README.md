# Prodexa ERP – Software Guide

**Prodexa** is a web-based manufacturing ERP built with Next.js 16, React 19, TypeScript, Tailwind 4 and MongoDB (Mongoose). It covers the full cycle of a discrete manufacturer — **lead → quotation → sales order → MRP → purchase → goods receipt & QC → production (multi-stage WIP, SFG, FG) → dispatch → GST invoice → payment — with a double-entry ledger underneath**, plus job work (ITC‑04), imports (Bill of Entry), approvals, audit, Tally export and BI.

It began as a food-industry inventory tool (batch + expiry + FEFO — see the older `srs.md`, `flow.md`, `modules.md`) and grew into the current ERP. The demo data is a bicycle manufacturer.

## At a glance

| | |
|---|---|
| Screens | 38 dashboard modules + public landing, industries, docs, vendor-acknowledgement pages |
| API | 123 route handlers under `app/api` |
| Data | 57 Mongoose models |
| Business logic | 50 service files in `lib/` |
| Roles | 10 (Admin, Manager, Supply Chain, Production, Quality, Finance, Sales, HR, Staff, Viewer) |
| Tests | 44 Vitest files (unit + in-memory-Mongo integration) |
| Compliance | Indian GST (CGST/SGST/IGST, HSN, e-invoice & e-way bill JSON, GSTR summaries, ITC‑04, Delivery challan Rule 55), Tally XML export |

## Read in this order

1. **[ARCHITECTURE.md](ARCHITECTURE.md)** – how it is built and why
2. **[FEATURES.md](FEATURES.md)** – everything it can do, by module
3. **[BUSINESS_FLOWS.md](BUSINESS_FLOWS.md)** – how documents flow and what hits the books
4. **[DATA_MODELS.md](DATA_MODELS.md)** – collections and relationships
5. **[API_REFERENCE.md](API_REFERENCE.md)** – endpoints
6. **[ROLES_AND_SECURITY.md](ROLES_AND_SECURITY.md)** – who can do what, and the security findings
7. **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)** – run, extend, test, backlog
8. **[LOGIC_REVIEW.md](LOGIC_REVIEW.md)** – faults and inconsistencies found in PO, GRN, inventory and production logic
9. **[COMPARISON_UDYOG.md](COMPARISON_UDYOG.md)** – Prodexa vs Udyog ERP, flow by flow, with ranked gaps and where Prodexa is ahead

## Five ideas that explain the whole system

1. **Everything is a batch.** Stock lives in batches with expiry, cost, store and QC status; reservations are earliest-expiry-first and QC-cleared only.
2. **Goods are quarantined until QC says otherwise.** Inbound lands in `QUARANTINE`; only accepted stock is put away and usable.
3. **Every money event is a balanced journal entry.** Purchase, issue to WIP, finished goods, COGS, invoices, payments, duties and returns all post through one accounting engine, blocked by period locks.
4. **Documents are linked, not just numbered.** Enquiry → … → payment can be walked as a chain (role-filtered).
5. **Approvals are configurable.** A matrix of module + amount → approver roles gates POs, sales orders, expenses, payments, credit notes and outward job work.

## Caveats of this documentation

Produced by reading the code (models, services, route signatures, navigation, existing planning docs). Individual screen layouts were not opened in a browser, and the project itself notes that recent screens have never had a browser pass. Items marked *(inferred)* should be confirmed on the running app. Secret values in `.env` and `credentials.md` were deliberately **not** read into or copied into these documents.
