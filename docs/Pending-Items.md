# Prodexa ERP: Pending Items

Status as of 18 Oct 2026. Commit `d3ffb55` is on `main`; its delivered features are summarized in Development-Plan.md. 347 automated tests were reported in the plan; **no screen has been opened in a browser**.

Legend: **[Decision]** needs an answer from you · **[Build]** development work · **[Env]** needs live accounts or a real environment · **[Hygiene]** quality, process.

## 1. Needs your input

| # | Item | Current assumption |
|---|---|---|
| D1 | Vendor bill at goods receipt | Not auto-created: the bill comes from the supplier's invoice and is matched against what was received and accepted. |
| D2 | Stock reservation moment | At order approval (what exists, shortfall recorded, later top-up). Material for work orders is reserved when the work orders are created. |
| D3 | Supplier payment release | Goes through the approval matrix when a rule covers the amount; bank payments need a UTR or cheque number. |
| D4 | Purchase return GST | A return at inward inspection is for the goods only. A return after billing credits the bill's GST. |
| D5 | Dispatch with no stock on record | **Changed with picking:** a challan is refused for goods that were not picked, and nothing can be picked without usable stock. (Older challans may still show a shortfall.) |
| D6 | Costing depth | Materials only (no labour or overhead absorption). Say if you want a labour/overhead rate per work centre. |

## 2. Real gaps in what is built

| # | Type | Item | Detail |
|---|---|---|---|
| G1 | Build | Supplier refund on a paid bill | A return against a bill that is already paid is refused with a message. There is no refund-receivable entry. |
| G2 | Build | Invoice cancellation | None; corrections are credit notes. A challan that was invoiced cannot be cancelled. |
| G3 | Build | Order edit gaps | Hand-created sales orders are never price-locked; an order with the same product on two lines cannot be edited through the edit API. |
| G4 | Build | Valuation of unbilled goods | Received-not-billed goods are valued at receipt price excluding GST; purchase invoices with no PO link do not reduce them. |
| G5 | Build | Files from every screen | The server accepts files for every document type. Quality checks, projects, shipments and export documents have no Files button yet. |
| G6 | Build | Job-work billing from the job worker | A purchase order to the job worker and the received challans exist, but the job worker's service bill is not booked as a payable. |
| G7 | Build | Unlinked-document warnings | The chain panel shows what is connected; there is no report of documents that should be linked and are not. |

## 3. Needs live accounts or a real environment

| # | Item |
|---|---|
| E1 | Email, SMS and WhatsApp delivery (SMTP / Twilio / WhatsApp credentials). Today notifications are logged as skipped or failed. |
| E2 | NIC e-invoice and e-way bill upload. The JSON is generated and the portal response is recorded by hand. |
| E3 | Scheduled jobs (follow-up reminders) over HTTP with a cron secret. |
| E4 | **A browser pass over the whole application.** Every screen built or changed recently has only been type-checked: Order Desk, Bill of Entry, Vendor Bills (payables, payments, advances), Dispatch, GRN return form, WIP (SFG QC), job card, job work documents, the Chain panel, sidebar. |

## 4. Quality and hygiene

| # | Item |
|---|---|
| H1 | **Release commit is on main.** `d3ffb55` includes the Order Desk, purchase-to-pay and import workflows, costing and returns, job-work and SFG QC, document attachments/lineage, integration tests, and tester documentation. Continue committing subsequent work in focused changes. |
| H2 | About 1,500 lint style warnings (mostly `any` types and unused variables). No effect on behaviour. |
| H3 | A few operational read endpoints still allow any logged-in role: GRN, orders, quality, supply chain and similar. |
| H4 | Credentials: the Atlas database password pasted earlier should be rotated. Demo accounts (password `123456789`) are for test environments only. |
| H5 | Several older routes still spread request bodies into records. Production orders, sales orders and links are fixed; a sweep of the rest is advisable. |

## 5. Suggested order

1. **E4** a browser pass, fixing what it turns up (this is where most remaining defects will be).
2. **H1** commit in pieces.
3. G1, G6, then G5 and G2.
4. D-items you want changed.

## 5b. Added 28–29 Oct 2026

Master data from the ERP templates (customer, material, vendor), one payment-term rule, line numbers and per-line dates on requisitions/RFQs/POs/sales orders, requisition line → PO line links, source list, storage locations as master data, sales order hold/release, minimum selling price at approval, discount requests on quotations, and screens for all of them. Covered by integration tests; checked on a running app with demo data, but **not yet clicked through in a browser**.

Open from that work:

| # | Type | Item |
|---|---|---|
| N1 | Build | Two POs ordering the same open requisition quantity at the same moment can both succeed (the open quantity is not reserved). |
| N2 | Build | The source list is not checked on job-work POs or auto-replenishment POs. |
| N3 | Build | MRP ignores MRP type ND, safety stock and planned delivery days; services and trading goods are planned like purchased materials. |
| N4 | Done | Product, customer and supplier forms now show the new template fields, including MSP (not yet checked in a browser). The customer list is the Dispatch → Customer GST details tab, which now uses the full customer form. |
| N5 | Decision | Template payment terms and units of measure are not enforced; sample sales orgs / divisions (HVAC, Lighting) may need replacing with real ones. |
| N6 | Decision | Held orders are left out of MRP demand. |
| N7 | Hygiene | Stock transfers still use free-text warehouse names instead of storage locations. |
| N8 | Data | Vendor template row V-10003 has a 9-character PAN and 14-character GSTIN and is refused until corrected. |

## 6. Done (for reference)

Security sweep and role limits; sales order price lock, edit, cancel, stock top-up; vendor bills with three-way match and price variance; creditors aging; approval matrix for six document types; PO email with PDF and acknowledgement; MRP sub-assembly work orders and SFG re-issue; machine OEE; document lineage with backfill and a Chain panel on the main screens; order-driven planning with start gate; Order Desk; purchase to pay (payment release, advances, payables view and CSV, PO payment status); partial dispatch and invoicing with stock at dispatch and challan cancel; partial stock reservation at approval; **cost flow: material issue to work in progress, finished goods, cost of goods sold at dispatch (with reversal)**; **returns to vendor after receipt and after billing (GST and price variance credited)**; **Bill of Entry for imports (duty into cost, IGST input, cancel and correct)**; **semi-finished goods QC with a reject store**; **printable job card**; **job-work purchase order, received challans and sales order from a customer's order**; **files on every kind of document, protected by role**; sequential order numbers; work order creation hardening; reservations released on cancellation; GST on inward returns corrected; test infrastructure made stable.
