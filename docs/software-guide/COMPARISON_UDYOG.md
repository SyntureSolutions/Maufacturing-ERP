# Prodexa ERP vs Udyog ERP – Comparison

**Sources**
- *Udyog ERP Demo PPT* (dated 06-02-2020, 111 slides, mostly screenshots of the Windows desktop client, version 2.2.0.0).
- *Prodexa ERP Flow Chart* (Synture Solutions, 11 pages).
- Prodexa code as reviewed earlier in this guide (`FEATURES.md`, `LOGIC_REVIEW.md`), plus a few targeted code checks made for this comparison.

**How to read this**
- Udyog is judged only on what its deck shows. "Not shown" means the deck is silent, not that the feature is missing.
- Prodexa is judged on code, not on a running browser. The project notes say no screen has had a full browser pass.
- The Udyog deck is from early 2020. Today's Udyog may have moved on, so treat this as a snapshot.
- Nothing in the codebase was changed. Gaps are listed, not built.

Status tags: **HAVE** (equivalent), **AHEAD** (Prodexa does more), **PARTIAL**, **GAP** (Prodexa lacks it).

---

## 1. The headline

| | Udyog ERP (per deck) | Prodexa ERP |
|---|---|---|
| Delivery | Windows desktop client (menus, toolbars, multi-window) | Web app (Next.js), any device |
| Strength | Breadth of masters, print formats, export paperwork, taxation depth, user-configurable everything | Control and integrity: batch/QC gate, double-entry with idempotency, approvals, lineage, 3-way match |
| Weakness (visible) | Dated UI; QC/approval depth not shown beyond a few screens | Fewer masters and print formats; no Excel import; no live GST portal calls; no multi-company |

**One-line verdict:** the core manufacturing chain is at parity, and Prodexa is stronger on control. Udyog is stronger on breadth: paperwork, masters, taxation extras and configurability. Closing the breadth gap is what makes Prodexa "like Udyog". Doing that on a PO/GRN base that still has the `LOGIC_REVIEW.md` P1/G1 faults would be a mistake, so fix those first.

**Your own flow chart vs Udyog's:** the Prodexa flow chart follows the Udyog deck almost box for box, from enquiry to accounts plus job work and the utilities page. Udyog's "Best Utilities" slide lists 14 items. Prodexa's utilities page carries 8 of them (file upload, multi-level approval, auto email, auto SMS, user-wise rights, periodic locking, alert management, BI) and adds two of its own (dashboard, Tally transfer). It leaves out digital signature, auto e-way bill, transaction amendment, Excel import/export, process-wise WIP and batch-wise tracking. The last two exist in the Prodexa code and are strengths, so they are worth adding to the page. Section 3 covers the rest.

---

## 2. Flow-by-flow comparison

### 2.1 Sales front end

| Step | Udyog (deck) | Prodexa | Status |
|---|---|---|---|
| Enquiry domestic / export | Yes, foreign-currency enquiry with exchange rate | Enquiry with status, follow-ups, convert to quotation | HAVE (FC on enquiry not confirmed) |
| Follow-ups and alerts | Alert management, auto reminders by email/SMS | Follow-ups, overdue list, cron reminder email, notification templates | HAVE (needs scheduler and credentials) |
| Quotation domestic / export | Yes, FC rate and INR value side by side | Domestic/export, currency, exchange rate, incoterm, ports, **revisions**, **loss reason + loss analytics** | AHEAD |
| Won / lost | Not shown | Won/lost with mandatory loss category | AHEAD |
| Sales order | Direct order and **Open order**; series; place of supply; line discount on MRP; tax and charges tab | Domestic/export, approval matrix, **price lock**, FEFO reservation, partial dispatch | PARTIAL: no open/blanket order; no MRP-minus-discount pricing model |
| Terminate order | Yes (menu) | Cancel exists; no "terminate balance" concept | PARTIAL |
| Sales projection | Yes, party and segment wise | Forecast/projection feeds MRP | HAVE |
| Price list master | Goods-wise and party-wise rates with start/end dates | None found in code | **GAP** |
| Proforma invoice | Domestic and export, with print | Proforma (domestic) | PARTIAL (export proforma not confirmed) |

### 2.2 Planning (MRP)

| Item | Udyog | Prodexa | Status |
|---|---|---|---|
| MRP against SO / projection | Pick period, tick orders, explode BOM | Same idea; plus **multi-level netting** (stock, PO pipeline, open WO, reorder level) | HAVE / AHEAD |
| Columns | Required, stock, pending order, reorder, pending WO, indent qty | Identical columns (and in your flow chart) | HAVE |
| Generate Work Order / Indent from MRP | Yes | Yes (`/api/mrp/work-orders`, `/api/mrp/indents`) | HAVE |
| Stock reservation against WO/SO | Stated | FEFO batch reservation on SO approval | AHEAD |
| Auto-replenishment | Not shown | Safety-stock scan raises POs for approval | AHEAD |

### 2.3 Purchase

| Item | Udyog | Prodexa | Status |
|---|---|---|---|
| Purchase indent | Yes | Yes | HAVE |
| RFQ and rate comparison | Not shown | RFQ, vendor quotes, compare, award (in your flow chart) | AHEAD (but RFQ PATCH has no role check, see LOGIC_REVIEW) |
| PO domestic / import | Import PO in foreign currency, both with print formats incl. terms (payment terms, transporter, inspection, delivery place) | PO with approval matrix, PDF + email/WhatsApp dispatch, vendor acknowledgement link | PARTIAL: import PO in foreign currency not confirmed; print terms block |
| PO approval | "P.O. Approval" step | Configurable amount-based multi-level matrix | AHEAD in design, but see P1–P11 faults |
| GRN | Warehouse per line, accepted/rejected/received qty, FC rate | Gate entry, quarantine, inspection, put-away to W1/W2/W3 | AHEAD in design, but see G1–G9 faults |
| Purchase entry (bill) | Excel import, tax and charges, account details, allocation, TDS tab | 3-way-match vendor bill, GST credit, price variance, payables, advances | AHEAD (control) / GAP (Excel import, TDS on purchase) |
| Import costing | Not shown | Bill of Entry capitalises duty into batch cost | AHEAD |
| Purchase return | Not shown (listed in sales as "Sales Return") | RTV + debit note, before and after billing | AHEAD |

### 2.4 Quality control

| Item | Udyog | Prodexa | Status |
|---|---|---|---|
| Test master (name, spec, method, type, min/max) | Yes | `QualityStandard` per product with parameters (name, unit, min, max, method, version) | HAVE |
| Item-wise test list | Yes | Per product standard | HAVE |
| QC entry per batch (sample qty, accept/reject qty, pass/fail/retest per test) | Yes | Quality checks, GRN inspection, SFG QC, FG QC with checks and result | HAVE (retest state and sample qty not confirmed) |
| Printable COA / QC analysis note / batch release note | Yes, four formats | FG QC carries a certificate number; no dedicated COA print set found | **GAP / PARTIAL** |
| Supplier COA | Shown as a button | Attachments exist | PARTIAL |
| Hard QC gate on stock | Not shown | Rejected/on-hold/pending stock never allocated | AHEAD |
| NCR and disposition | Not shown | NCR with severity and disposition | AHEAD |

### 2.5 Production and WIP

| Item | Udyog | Prodexa | Status |
|---|---|---|---|
| Work order with BOM pop-up | Yes | Yes, job card print with barcode | HAVE |
| MRN against work order | Yes | Yes | HAVE |
| Input to production (issue slip, tolerance +/-, stock availability, batch/mfg/exp) | Yes | MRN issue with FEFO batches, ledger posting | HAVE (no issue tolerance %) |
| Output from production (production slip, rate) | Yes | Stage output (good/scrap/rework), SFG lots, FG receipt with cost | HAVE |
| WIP issue / receipt, process A-D | Yes | Configurable stage routing, WIP | HAVE |
| Termination of work order | Yes | Status `CANCELLED` / `ON_HOLD` (anyone can change, see I-findings) | PARTIAL |
| Material return to store | Yes (menu) | Not found outside job work | **GAP** |
| BOM: sub-BOM, by-products, recoverable/irrecoverable qty, close BOM | Yes | Multi-level BOM; by-products/yield not found | PARTIAL / GAP |
| Costing | Rate on slips | Material costing; excludes labour/overhead | PARTIAL (Udyog's depth not visible either) |
| Machine OEE, SFG QC loop | Not shown | Yes | AHEAD |

### 2.6 Job work

| Item | Udyog | Prodexa | Status |
|---|---|---|---|
| Issue to job worker, receipt, balance receipt | Yes | Outward/inward job work, PO to job worker, partial receipts | HAVE |
| Inward job work (receive material, make SO) | Not detailed | Service SO for inward job work | HAVE |
| Challan numbering pair (issue/receive) | Yes | Challans | HAVE |
| ITC-04 | Not shown | ITC-04 status | AHEAD |
| Job-worker bill as payable | Not shown | Not booked as payable (backlog item) | GAP (known) |

### 2.7 Dispatch and invoicing

| Item | Udyog | Prodexa | Status |
|---|---|---|---|
| Delivery challan | Yes | Yes (Rule 55), stock out and COGS | HAVE / AHEAD |
| Sales invoice domestic | Yes; **Original / Duplicate / Triplicate** copies; several formats | Tax invoice from challan/order, HSN summary, amount in words, partial invoicing | PARTIAL: no multi-copy or alternate formats |
| Export invoice | Export sales, EPCG/AA licence, FOB terms, marks and description, many export forms (post-shipment, Bill of Lading draft, GSP invoice, SAPTA, CoO variants, non-hazardous declaration) | Export documents: commercial invoice, packing list, CoO, B/L, AWB, shipping bill | PARTIAL: far fewer forms; no licence/incentive fields |
| Packing list | Yes (dedicated, with weights, container, seal) | Part of export documents | PARTIAL |
| Self invoice | Yes | RCM fields exist in invoicing; no self-invoice document | PARTIAL |
| Sales return | Yes | Credit note voucher; no stock-returning sales return document | **GAP** |
| Bank documents / pre-shipment / LC | Yes (menu) | Not found | **GAP** |
| Barcode / QR label | Listed as a module | GS1-128 labels, thermal sizes, serial ranges | HAVE |

### 2.8 e-Way bill and e-Invoice

| Item | Udyog | Prodexa | Status |
|---|---|---|---|
| e-Way bill JSON | Generate JSON, **Generate EWB online, Cancel EWB online**, 3 print formats | JSON generation and fields on invoice (number, valid-upto) | PARTIAL: no live portal call, no online cancel |
| e-Invoice | Detail form, JSON, online generation, **printable with QR, horizontal and vertical** | NIC e-invoice JSON, IRN fields | PARTIAL: no live IRP call, no QR print |
| Bulk screen with filters | Yes (party, GSTIN, doc range, dates, select all) | Per invoice | GAP |

### 2.9 Accounts

| Item | Udyog | Prodexa | Status |
|---|---|---|---|
| Voucher types | Debit/credit note, bank/cash payment and receipt, petty cash, journal, contra, expense purchase, fixed asset, foreign expense bill, late-payment debit note | Debit/credit note, bank/cash pay/receipt, petty cash, expense, journal, contra, fixed assets | HAVE (foreign expense bill GAP) |
| Allocation against bill / advance / deposit | Yes | Voucher settles a linked invoice; supplier advances applied to bills | PARTIAL for customer side |
| Discount on settlement | Yes | Not found | GAP |
| Balance sheet, P&L, TB, GL, outstandings | Yes | Yes + creditors aging, GRNI | HAVE / AHEAD |
| TDS | Full: deductee type, nature of service, rates by date, surcharge/cess, TDS transactions and reports | TDS field on vouchers only | **GAP (depth)** |
| TCS | Yes | Appears only in reports | **GAP** |
| Cost centre | Yes | Field on vouchers | PARTIAL |
| Multi-company, multi-financial-year login | Yes (company and FY chosen at login) | Single company | **GAP** |
| Period lock | Yes | Yes (accounting and inventory) | HAVE |
| Approvals on vouchers | Multi-level approval utility | Matrix on expense, payment, credit note | HAVE |
| Idempotent, balanced, undoable posting | Not shown | Yes | AHEAD |
| Bank reconciliation, cheque printing | Cheque printing listed | `reconciled` flag only | GAP |
| Tally transfer | Not shown | Tally XML export | AHEAD |

### 2.10 Masters

| Master | Udyog | Prodexa | Status |
|---|---|---|---|
| Account/party | Alpha vs mailing name, group/alternate group, credit days/limit/over-limit, interest rate, GST registration status (registered, unregistered, composition, EOU, SEZ, export, import, e-commerce), supply type, PAN, TDS/TCS, **multiple ship-to locations with own GSTIN**, de-activate from date | Customer and supplier with GST, bank details, company settings | PARTIAL: no credit limit enforcement or registration-type model confirmed; no ship-to list |
| Supply (item) master | Goods/services, stock unit with **conversion ratio**, goods type, bin/rack, scrap flag, HSN search with auto GST rates, re-order, **receipt/issue tolerance %**, MRP, hazardous info, batch validation, Incl-GST, services with SAC | SKU, barcode, category, UoM, HSN, GST %, prices, min stock, item type, BOM link | PARTIAL: no UoM conversion, no tolerance, no bin/rack, no HSN master lookup, services only partly |
| Goods group / GL / account group | Yes | Categories; chart of accounts | PARTIAL |
| Price list | Yes | No | **GAP** |
| Licence, DBK rate, DEPB masters | Yes | No | GAP (export-incentive niche) |
| Location master | Yes | Warehouses W1/W2/W3 fixed list | PARTIAL |

### 2.11 Reporting and BI

| Item | Udyog | Prodexa | Status |
|---|---|---|---|
| Registers (enquiry, quotation, order, proforma, challan, sales, return, terminate) | Yes | Module lists and reports | PARTIAL |
| Pivot BI with drag-drop fields, chart (pie, stacked bar), Top-N, save layout, export, **email report** | Yes (grid-based) | `/bi` pivot/query builder with saved templates, charts (Recharts) | HAVE (export/email of a report not confirmed) |
| Zoom-in reports (outstanding, GST ANX-1, monthly stock summary) | Yes | Aging, valuation, GST summaries | PARTIAL |
| Dynamic report designer for end users | Yes ("Dynamic Reports", report wizard) | Template-based | PARTIAL |

---

## 3. Utilities and platform features

| Utility (Udyog's list) | Prodexa today | Status |
|---|---|---|
| File upload / document management | Attachments on documents, access rules follow the parent document | HAVE |
| Multi-level approval | Configurable approval matrix, inbox, per-level roles | AHEAD |
| Auto email | SMTP, templated, PO dispatch with PDF | HAVE (needs credentials) |
| Auto SMS | Twilio and WhatsApp Cloud API wiring | HAVE (needs credentials) |
| Digital signature | Not found | GAP |
| Auto e-way bill (online) | JSON only | PARTIAL |
| Transaction amendment (tracked) | Audit log, price-lock override trail; no "amendment report" | PARTIAL |
| Userwise rights and control | 10 fixed roles plus an approval matrix; no per-user permission editor | PARTIAL |
| Periodic locking of data | Period lock | HAVE |
| Process-wise WIP | Stage routing | HAVE |
| Batch-wise control and tracking | Core design | AHEAD |
| Alert management | Notification templates and events; no user-defined alert rules | PARTIAL |
| BI tool | `/bi` | HAVE |
| Excel import / export | None found (CSV downloads on some reports only) | **GAP** |
| Customisable workflows, validations, triggers | Not configurable by users | **GAP** |
| Configurable forms and letters | Notification templates only | GAP |
| User-defined shortcut buttons | None | GAP (low) |
| Cheque printing | None | GAP |
| Data extraction for e-filing | GST summaries, JSON for e-invoice/e-way | PARTIAL |
| POS, payroll, ISD, payment on hold | Payroll (labour) only; no POS/ISD/payment-hold | GAP (out of core scope) |
| Multi-user / multitasking | Web, multi-user by nature | HAVE |

---

## 4. Where Prodexa is already ahead (keep and market)

1. **Control chain:** quarantine, QC hard gate, FEFO reservation, batch cost, SFG QC loop.
2. **Money integrity:** balanced double entry, idempotency keys, undo on failure, period lock, GRNI.
3. **Procure-to-pay:** RFQ comparison, vendor acknowledgement link, 3-way-match bills, advances, payables aging, Bill of Entry cost capitalisation, purchase return after billing.
4. **Governance:** amount-tiered multi-level approvals across six modules, role-filtered document lineage, PII masking for viewers.
5. **Sales insight:** quotation revisions and loss-reason analytics.
6. **Operations:** OEE, auto-replenishment, machine runs, job-work ITC-04.
7. **Engineering:** web delivery and a real automated test suite (44 files).

---

## 5. Gap list, ranked (listed only, not built)

### A. Do before adding breadth
Fix the PO/GRN/inventory faults in `LOGIC_REVIEW.md`: PO approval bypasses, GRN over-receipt, non-atomic inspection, ungated stock adjustments, and the fake-success sample-data fallbacks. A Udyog-style feature set on top of these faults will be demoed, found, and lost on.

### B. High impact for Indian manufacturing buyers
1. **Excel import and export** for masters (items, parties, BOM, opening stock) and transactions (purchase bills, orders). Udyog advertises it and buyers migrate from Excel/Tally.
2. **Live e-invoice and e-way bill** through a GSP/IRP (generate, cancel, QR print, bulk screen).
3. **Price list master** (goods-wise and party-wise with validity dates) feeding quotation and order lines.
4. **Sales return document** that brings stock back (with QC) and issues the credit note.
5. **Item master depth:** UoM conversion, receipt/issue tolerance %, bin/rack, HSN master with auto-rates, services with SAC.
6. **Party master depth:** credit limit and credit days enforced at order/dispatch, GST registration type, **multiple ship-to addresses with GSTIN**.
7. **Print formats:** Original/Duplicate/Triplicate invoice copies, alternate invoice and PO templates, COA and batch-release-note prints.
8. **Open (blanket) orders and order termination.**

### C. Medium
9. Material return to store; work-order termination with reversal.
10. BOM by-products, recoverable/irrecoverable quantity, close-BOM.
11. TDS and TCS as a real module (deductee types, rates by date, certificates, reports).
12. Customer-side bill-wise receipt allocation, settlement discount, bank reconciliation, cheque printing.
13. Export depth: FC and INR both stored per line, LC and bank documents, pre-shipment, shipping-bill and declaration formats, export-incentive masters.
14. Multi-company and financial-year switch at login.
15. Per-user permission editor and user-defined alert rules.
16. Job-worker service bill as payable (already on your backlog).

### D. Low or optional
17. Digital signature on documents, POS, ISD, payment-on-hold, user shortcuts, report email/schedule.

---

## 6. Suggested sequence

1. **Stabilise** (A above), then a full browser pass over the screens.
2. **Migration kit:** Excel import/export, price list, item/party master depth (B1, B3, B5, B6). This is what a prospect checks first.
3. **Compliance live:** GSP e-invoice / e-way (B2) and print formats (B7).
4. **Flow completeness:** sales return, open orders, material return, WO termination (B4, B8, C9).
5. **Finance depth:** TDS/TCS, bank reconciliation, multi-company (C11–C14).

## 7. Caveats

- The deck shows screens, not behaviour, so "Udyog has X" means it has a screen for X.
- Some Prodexa "gap" calls come from searching the code for the concept. A feature built under a different name could be missed. Confirm each against the running app before planning work.
- The Prodexa flow chart is a sales document. Its boxes (SMS, alerts, Tally transfer, BI, labels) exist in code, but several need external credentials or a scheduler before they work in production.
