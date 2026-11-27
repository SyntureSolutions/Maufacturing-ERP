# Prodexa ERP – Feature Catalogue

Features are grouped the way the sidebar groups them. For each module: **what it does**, the **key rules** the code enforces, and **who** can use it. Roles: `ADMIN`, `MANAGER`, `STAFF`, `SALES`, `VIEWER` (executive, read-only), `PRODUCTION_MANAGER`, `QUALITY_INSPECTOR`, `FINANCE_MANAGER`, `HR_MANAGER`, `SUPPLY_CHAIN_MANAGER`.

> Source of truth: `app/api/**` handlers, `lib/*` services, `models/*` schemas and the sidebar role map. Screen-level details (buttons, layouts) were not exhaustively read; those lines are marked **(inferred)**.

---

## A. Sell – CRM and Sales

### A1. Enquiries & follow-ups (`/dashboard/sales`, `/dashboard/crm`)
- Capture enquiries with **source** (Website, Email, Phone, Trade show, Direct), **region** (Domestic / Export, with country), multiple product lines and estimated quantity.
- Status: `NEW → QUALIFIED / REJECTED`. **Convert to quotation** (`POST /api/enquiries/[id]/convert`).
- **Follow-up scheduler:** due date, mode (Call / SMS / Email), notes; mark Done/Cancelled with outcome; list of upcoming/overdue follow-ups (`/api/followups`).
- **Reminder job:** `POST /api/cron/followups` emails one reminder per overdue follow-up (needs a scheduler + `CRON_SECRET`).

### A2. Quotations
- Stages: `ENQUIRY_RECEIVED → QUOTATION_SENT → UNDER_REVIEW → PO_RECEIVED` or `LOST_DECLINED`.
- **Versioned revisions** (Rev‑01, Rev‑02…) stored with items, totals, terms, tax summary; revise endpoint keeps history.
- GST computation with place of supply; **terms & conditions presets** and Incoterms (`lib/quoteTerms.ts`).
- **Domestic vs Export** quotes: currency, exchange rate, incoterm, ports, country.
- **Credit check** flag and notes.
- **Win/Loss gate:** marking lost requires a **loss category** (Competitor, Price, Lead time, Spec mismatch, Budget cancelled, Other) and reason; **Loss analytics** chart (`/api/quotations/loss-analytics`).
- **Proforma** number/date stored on the quotation when issued.
- **Discount requests** (`/api/quotations/[id]/discount`): the tier comes from the discount limits in Approval Policies — up to the Sales limit (10%) and the amount ceiling (₹50k) Sales applies it at once; up to the Finance limit (25%) a Manager or Finance Manager approves; above that only an Admin. Nobody approves their own request. An approved discount becomes a new revision (old prices kept). While a request waits, the quotation cannot be revised or marked won.

### A3. Sales orders (`/dashboard/orders`, `/dashboard/order-desk`)
- Created from a won quotation or by hand; domestic or export (currency, incoterm, ports).
- Status: `DRAFT → APPROVED → IN_FULFILLMENT → FULFILLED` (or `CANCELLED`).
- **Approval** reserves batch stock **earliest-expiry-first**; a partly covered order keeps what it got and records an **allocation shortfall** with a warning ("Run planning for this order").
- **Price lock:** orders created from a quotation freeze prices, item list and commercial terms; edits to locked fields need an **override with a reason**, recorded in `priceOverrides` and the audit log. Quantities and delivery details stay editable.
- **Approval matrix:** if a rule covers the order value, the order stays DRAFT (no stock reserved) until approved.
- **Cancel** releases reservations and work-order material; **stock top-up / reserve more** endpoint.
- **Order Desk:** one workspace for an order – approve, hold/release, edit (including a delivery date per line), reserve stock, order-specific planning, cancel, lineage chain, printable job cards.
- **Lines** are numbered 10, 20, 30… and can carry their own required delivery date; the order is due with its earliest dated line. Line dates stay editable after approval.
- **Hold / release** (Manager or Admin, with a reason): a held order cannot be approved, reserve stock, be planned, proformed or dispatched; reservations stay; it still counts against the credit limit; it can be cancelled. Release returns it to the state it was held in.
- **Minimum selling price at approval:** the approval dialog shows each line against the product's MSP and margin, plus the customer's credit position. A line below MSP needs a Manager or Admin with a written reason (stored on the order and audited).

### A4. Proforma invoice
- Issue a proforma from a sales order (items, HSN summary, taxes, bank details, terms, **advance requested**); status `ISSUED → CONVERTED / CANCELLED`; converts to the final invoice.

---

## B. Plan – MRP and procurement planning

### B1. MRP engine (`/dashboard/mrp`)
- **Demand** = approved / in-fulfilment sales orders **plus** monthly sales projections (forecast is reduced by confirmed orders due in the same month).
- **Multi-level BOM explosion** (RM, SFG, PM, FG) with wastage %, loop detection, depth limit 12. A **BOM tree explorer** shows quantities per unit.
- **Net requirement:** `(Gross + Reorder level) − (Available stock + Open PO qty + Open work orders)`; supply is consumed level by level so shared parts aren't double-counted.
- Row output: item type, gross, in stock, PO pipeline, open WOs, reorder level, **net indent qty**, and whether to **purchase** or **make** (work order).
- **Single-order planning (SO-driven):** plans only one order, ignores supply earmarked for other orders, excludes re-order level, counts stock already reserved and quantities already on open indents; runs are tagged `SO_DRIVEN`.
- Planned work orders are **scheduled** so sub-assemblies finish before their parents start (`workOrderPlan.ts`).
- Actions: create **Purchase Indents** and **Work Orders** from a run.

### B2. Forecasts
- Month-by-month target quantity per SKU (`/api/forecasts`).

### B3. Procurement planning (`/dashboard/procurement`)
- **Purchase Indents** (source: MRP, MRN shortfall, Manual) with approve/reject; **consolidation** into an **RFQ**.
- **RFQ & vendor comparison:** several suppliers, quotes with unit price per item, freight, GST %, lead time, payment terms; comparison matrix; **award** a supplier → creates the PO.
- POs/indents/work orders can be **tagged to a sales order** ("allocated for SO‑…").
- **Requisition lines → PO lines:** requisition lines are numbered; an RFQ keeps the requisition lines it combines and the awarded PO line records them; an approved requisition can also be ordered directly ("Order on a PO"). The requisition list shows ordered and open quantity per line. A PO cannot order more than is open; cancelling a PO frees it.
- **Source list** (`/dashboard/source-lists`): approved suppliers per product with validity dates, fixed and blocked flags. POs and RFQ awards for a listed product must use a listed, unblocked supplier; MRP requisitions propose the fixed supplier.

### B4. Auto-replenishment
- `runAutoReplenishmentScan` raises replenishment POs (`MRP_AUTO`, pending approval) when batch available stock falls below a safety threshold; `/api/inventory/replenish`.

---

## C. Buy – Purchasing, receiving and payables

### C1. Suppliers (`/dashboard/suppliers`)
- Master data following the ERP Vendor Master Template: general data (two names, account group, search term, address with country, PAN/GSTIN for India or tax id/VAT number for foreign vendors), company code data (reconciliation account, payment terms and method, tolerance group, withholding tax code) and purchasing data (purchasing org, order currency, Incoterm, minimum order value, pricing schema, ordering-address and invoicing-party partners).
- Edit and delete (`/api/suppliers/[id]`); a supplier used on POs, receipts or bills can only be made inactive.

### C2. Purchase orders (`/dashboard/purchase`)
- Status: `DRAFT → PENDING_APPROVAL → ORDERED → PARTIALLY_RECEIVED → RECEIVED` (`CANCELLED`).
- **Multi-level approval** by amount via the approval matrix; rejection sends the PO back to DRAFT with the reason.
- **Negotiation tracking:** original vs negotiated amount, savings %, notes, agreed by/at.
- **PDF generation** (`/api/purchase/[id]/pdf`) and **email dispatch to vendor** with the PDF and an **acknowledgement link** (`/vendor-ack/[token]`).
- **Payment status** derived from its vendor bills (Unpaid / Partly paid / Paid).
- **Lines** numbered 10, 20…, each with its own delivery date if needed; the PO is due with its earliest dated line.
- Optional link to project, MRP run, sales order.

### C3. Goods receipt – GRN with inward QC (`/dashboard/grn`)
- **Gate inward entry:** gate entry no., vendor challan no., vehicle no., physical checklist (quantity verified, packing intact, documents verified).
- Received stock goes to the **QUARANTINE** store until QC decides.
- **Per-line inspection:** Accepted / Partial / Rejected with accepted, **scrap** and **return-to-vendor** quantities, and parameter tests (name, standard, actual, pass/fail).
- **Put-away** of accepted stock to an active **storage location** with its zone, rack and bin (`lib/storageLocations.ts`).
- GRN status: `QUARANTINE → QC_DONE → PUT_AWAY`.
- Rejected-at-inspection goods: debit note for goods only (GST reaches the books only when the vendor bills what was kept); return reopens the PO quantity.

### C4. Purchase returns (RTV)
- RTV challan, status `RAISED → DISPATCHED`, linked debit note voucher.
- **Before billing:** returned at receipt price, no GST.
- **After billing:** requires the bill; debit note reverses the bill value, GST and price variance; a bill already **paid** is refused (supplier refund is not yet modelled).

### C5. Bill of Entry – imports (`/dashboard/bill-of-entry`)
- Record customs BoE against a GRN: port, assessable value, BCD, social welfare surcharge, IGST, other charges.
- **Duty + surcharge + other charges are capitalised into batch cost** (spread by value); **IGST goes to Input GST**; paid by bank or cash.
- **Cancel** posts an opposite entry and restores batch costs. Unique per number+port while posted.

### C6. Vendor bills & payables (`/dashboard/vendor-bills`)
- **Three-way match** (PO ↔ GRN ↔ bill): cannot bill more than received-accepted-unbilled; oldest receipts billed first at the price received; bill number unique per supplier.
- Posts **GST input credit** (CGST+SGST or IGST) and **price variance** vs order price.
- **Accounts payable list** with oldest due first, **as-of date** view, **CSV export**, note "material received for SO‑…".
- **Release payment:** amount, mode, date, **UTR/cheque (mandatory for bank)**; goes through the approval matrix when a rule covers the amount; refuses over-payment (counting payments queued for approval) and reused UTRs; safe against double click/retry.
- **Supplier advances:** payments with no bill; later **applied** to bills of the same supplier.
- **Creditors aging** includes **received-not-billed** goods (GRNI) aged from receipt date.

---

## D. Store – Inventory and warehouse

### D1. Inventory & stocks (`/dashboard/inventory`)
- Batch ledger with expiry, store, QC status, available vs allocated stock; **near-expiry** monitoring; FEFO.
- **Stock adjustments** with mandatory reason, logged.
- **Cycle counts:** `PLANNED → IN_PROGRESS → PENDING_APPROVAL → POSTED`; variance qty/value per batch; approval; posting adjusts stock.
- **Stock transfers** between warehouses: `DRAFT → DISPATCHED → RECEIVED`, shortage on receipt, vehicle/driver/e-way bill.
- **Valuation:** FIFO, Weighted Average, LIFO; can post a COGS journal.
- **Replenishment scan** (see B4).
- **Storage locations** (`/dashboard/storage-locations`): master data with optional zones, racks and bins; W1–W3 are created on first use. A location holding stock cannot be taken out of use. QUARANTINE, SFG, FG and SCRAP stay fixed system stores.

### D2. Material requisition (MRN)
- Created from a work order's BOM; **reserves** stock (approved, non-quarantined, earliest expiry); statuses `DRAFT / RESERVED / PARTIALLY_ISSUED / ISSUED / CANCELLED`, **shortfall** flag, top-up when stock arrives, release on cancel.
- **Material readiness** per work order: none / short / reserved / issued — gates the start of production.

### D3. Product catalog (`/dashboard/products`)
- Products with SKU, barcode, category (hierarchical), UoM, HSN, GST %, sale and purchase price, minimum selling price, min stock, **type: Raw material / Semi-finished / Finished good / Packaging / Trading good / Spare part / Service**; BOM link.
- Fields from the ERP Material Master Template: weights, OEM name and part number, plant, MRP type, safety stock, planned delivery days, storage bin, batch-managed flag, valuation class, price control. The material group can be given by name (it is the category).
- **BOM** versions (Draft/Active/Obsolete) with components (qty, wastage %), **routing steps** (step, description, machine type, estimated minutes).

---

## E. Make – Production

### E1. Work orders (`/dashboard/production`)
- WO number `WO-BIK-YYYYMMDD-001`; **MTO vs MTS**; priority; planned/actual dates; assigned machine; parent/sub-assembly link; sales-order link; status `PLANNED → IN_PROGRESS → COMPLETED` (`ON_HOLD`, `CANCELLED`).
- Auto-drafts an MRN from the BOM; **start gate** requires material readiness.
- **Printable job card** with stages, materials and barcode (`/api/production/[id]/jobcard`).

### E2. Routing & WIP board (`/dashboard/production/wip`)
- Configurable **stage routing** (e.g. Cutting → Welding → Powder coat → Assembly).
- **Log stage output:** input → good / scrap / rework (per operator, with notes); WIP counts per stage; scrap logged per stage.

### E3. Semi-finished goods (SFG) store
- Each approved stage lot becomes an **SFG lot** with batch code, conversion ratio, remaining qty.
- **SFG QC:** signed disposition (Approve/Reject) with reason; rejected qty goes to the **SFG reject store**; required **before re-issue**.
- **Re-issue** SFG lots into another (parent) work order; sub-assembly cost stays in WIP.

### E4. Final FG QC & labelling
- **FG sign-off** (approved vs scrap) before dispatch; defective goes to FG scrap store; creates FG batch with unit cost.
- **Barcode / QR label generator** (`/dashboard/labels`): GS1‑128 element strings (batch, serial, SKU, mfg date…) and thermal label sizes (e.g. 50×25, 100×50 mm); serial ranges.

### E5. Quality control (`/dashboard/quality`)
- Quality checks (Incoming / In-process / Final) with parameters (standard vs actual, pass/fail), inspector, status.
- **Quality standards** per product (parameter min/max, method, version).
- **Non-conformance reports (NCR):** type (Material/Process/Product), severity (Critical/Major/Minor), corrective action, disposition (Rework / Scrap / Use as is / Return), status Open → Closed.
- **Scrap register** by store: `SFG_SCRAP`, `SFG_REJECT`, `FG_SCRAP`, `RM_SCRAP`.

### E6. Machines & OEE (`/dashboard/oee`)
- Machine master (status Available / In use / Maintenance / Breakdown).
- **Machine runs** per machine/day/shift: scheduled minutes, downtimes by category, total/reject counts, ideal rate.
- **OEE = Availability × Performance × Quality**, planned stops excluded from planned time; performance capped at 100%; world-class band indicator.

### E7. Labour & payroll (`/dashboard/labour`)
- Workers (employee id, department, skills, shift, daily & overtime rate), **attendance** (Present/Absent/Half-day/Leave, overtime), **labour jobs** (hours × rate, linked to a work order), **payroll** run.

---

## F. Ship – Dispatch and GST documents (`/dashboard/dispatch`)

- **Delivery challan** (GST Rule 55): transporter, vehicle, LR no. are mandatory; reasons Supply / Job work / Sale on approval / Other; copies for consignee, transporter, consignor.
- **Partial dispatch:** one order can ship in several challans; quantities are claimed atomically so the same units can't ship twice.
- **Stock leaves at dispatch** (reserved-for-order first, then free stock earliest-expiry-first). If stock isn't on record, the challan still goes out and a **shortfall** is noted.
- **Cost of goods sold** is posted at dispatch (`Dr COGS / Cr FG inventory`) and **reversed** if the challan is cancelled.
- **Tax invoice** from a challan or order: HSN summary, CGST/SGST vs IGST by place of supply, amount in words, bank details/terms; sales journal posted (`Dr AR / Cr Sales + Output GST`). Partial invoicing supported.
- **E-invoice and e-way bill JSON** (NIC schema 1.1) and IRN hash; e-way validation (distance/vehicle/HSN/value threshold); portal acknowledgement/e-way number are recorded manually.
- Order status follows quantities: nothing sent = approved, some = in fulfilment, all = fulfilled; invoicing tracked the same way (`UNINVOICED / REQUESTED / PARTIAL / INVOICED`).
- Challan cancel allowed only for non-invoiced challans.

---

## G. Subcontracting – Job work (`/dashboard/jobwork`)

- **Outward job work** (we send material to a job worker): select batches, value on challan, nature of job, goods type Input/Capital; **approval matrix** may hold issue; stock is deducted atomically; **purchase order to the job worker** (`/api/jobwork/[id]/po`); record **receipts** (output qty, consumed/returned/scrap per line); scrap reconciliation.
- **Inward job work** (we process for customers): record customer material **without ownership valuation**, create a **service sales order** (`/sales-order`), record **return challans**, and invoice the **job-work service** (SAC 9988 default, 18% GST) with job-work income account.
- **ITC‑04 compliance:** inputs must return within **1 year**, capital goods within **3 years**; overdue status and quarter view (`/api/jobwork/itc04`).
- Statuses `OPEN → PARTIAL → CLOSED`.

---

## H. Finance and compliance

### H1. Financial accounting (`/dashboard/finance`)
- Chart of accounts (Asset/Liability/Equity/Revenue/Expense), live balances, **general ledger** with journal entries.
- **Fixed assets** (tag, category, cost, salvage, useful life, accumulated depreciation, status).
- **Receivables** with aging buckets.

### H2. Vouchers (`/dashboard/vouchers`)
- Types: **Debit note, Credit note, Bank payment, Bank receipt, Cash payment, Cash receipt, Petty cash, Expense, Journal, Contra**.
- Auto-balanced debit/credit lines, party, linked invoice (settles it), cheque/UTR, GST and **TDS**, cost centre, attachment, reconciled flag.
- Voucher types in the approval matrix: Expense, Payment (bank/cash payments) and Credit note.

### H3. Financial reports (`/dashboard/accounting-reports`)
- Trial balance, **Profit & Loss**, Balance sheet (as-of balances), debtors/creditors aging, drill-down ledger (`lib/reportMath.ts`).

### H4. GST compliance (`/dashboard/gst`)
- Prepare **GSTR‑1 / GSTR‑2B / GSTR‑3B** summaries by period (sales, purchases, CGST/SGST/IGST liability, ITC available, net payable); status Prepared / Filed / Error.

### H5. Tally export (`/dashboard/tally`)
- Date range + voucher types → **Tally Prime / ERP 9 import XML** for sales, purchase, receipts and payments; validates vouchers before export.

### H6. Period locking (`/dashboard/period-lock`)
- Separate **Accounting** and **Inventory** lock dates; entries on/before the date are blocked (HTTP 422).

---

## I. Governance and administration

| Feature | What it does |
|---|---|
| **Approval matrix & inbox** (`/approval-matrix`) | Rules per module (PO, Sales order, Expense voucher, Payment voucher, Credit note, Outward job work): minimum amount → ordered list of approver roles. "Pending my approval" inbox; Admin can act at any level; rejection loops back. |
| **Approval policies** (`/approvals`) | Legacy threshold settings: PO limits (Supply Chain ₹50k, Finance ₹5 lakh, above → Admin), discount limits (10% / 25% / ₹50k), write-off limits (₹15k floor / ₹1 lakh finance). |
| **Audit trail** (`/audit`) | Searchable log of CREATE / EDIT / APPROVE / DELETE / OVERRIDE / REJECT / LOGIN with user, role, resource, details, reason. |
| **Operations override** | Cross-department override gated to MANAGER/ADMIN; VIEWER is strictly read-only; always audited. |
| **Notifications** (`/notifications`) | Edit templates per event+channel with `{{variables}}`, enable/disable, view the communication log (Sent/Failed/Skipped). |
| **File attachments (DMS)** | Attach files to any document type (GRN, PO, invoice, voucher, job work, …); access follows the document's role rules. |
| **Document lineage ("Chain")** | Drawer on enquiry, quotation, order, PO, GRN, bill, BoE, work order, challan, invoice, indent showing the connected graph; role-filtered. |
| **Company settings** | Legal name, GSTIN, PAN, state code, bank details, invoice terms (used on invoices and party details). |
| **PII masking** | Executive Viewer sees masked phone/email/bank numbers. |

---

## J. Reporting, analytics and dashboards

- **Dashboard home** (`/dashboard`) – KPI cards from `/api/dashboard/stats` (orders, POs, stock, production) **(inferred layout)**.
- **Executive reports** (`/reports`) and **MIS report builder** (`/bi`) – pivot/query builder over modules (`lib/pivot.ts`), saved `ReportTemplate`s (Financial, Production, Inventory, Sales, Custom).
- **Supplier & logistics:** supply-chain routes and shipments (`Shipment`: inbound/outbound, carrier, tracking, ETA, delay reason codes, proof of delivery), export documents (Commercial invoice, Packing list, CoO, B/L, AWB, Shipping bill).
- **Customer projects:** projects, milestones, tasks, budget vs actual cost.
- **CSV export** helper for tables (`lib/export.ts`).

---

## K. Public website

`/` landing page (hero, feature tabs, ROI calculator, testimonials, demo modal), `/industries`, `/docs`; `/vendor-ack/[token]` public acknowledgement page for suppliers.

---

### Customer master
- Follows the ERP Customer Master Template: general data (account group, search term, address with region and country, PAN for India or tax id abroad), company code data (reconciliation account, payment terms and method, dunning procedure, credit limit) and sales areas (sales org, channel, division, district, pricing procedure, shipping conditions, Incoterm). A Customer ID from the template is kept.

### Payment terms
- Due dates for sales invoices and vendor bills use one rule (`lib/paymentTerms.ts`): "Net N" and "2% 10 Net 30" → N days; COD, advance and immediate → due at once; "N days" → N; anything else 30.

## L. Known gaps (from `docs/Pending-Items.md`)

Supplier refund on a paid bill · invoice cancellation (use credit notes) · order edit gaps · valuation of unbilled goods · Files buttons missing on some screens · job-worker service bill not booked as payable · no "unlinked documents" report · live email/SMS/WhatsApp and NIC upload need credentials · **a full browser pass is still pending**.
