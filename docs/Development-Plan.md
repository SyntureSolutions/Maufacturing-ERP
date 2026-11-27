# Prodexa ERP: Development Plan

Sources: the Synture flow chart (11 pages) and the "Document Connectivity & Traceability" blueprint, compared against the code on 15 Oct 2026.
Effort: S = 1-2 days, M = 3-5 days, L = 1-2 weeks (one developer, including tests).


## Status (updated 15 Oct 2026)

| Phase | State |
|---|---|
| 1 Lineage foundation | **Done** (links on documents, one-time backfill, chain API with role filtering). |
| 2 Order-driven planning | **Done** (plan one order, tagged indents/POs/work orders, requisitions, start gate, release on cancel). |
| 3 Purchase to pay | **Done** (bill carries order and receipts, payment release with UTR and approval, advances, payables list/CSV, PO payment status). |
| 4 Dispatch to cash | **Done** (partial challans and invoices, stock at dispatch, challan cancel, partial reservation, cost of goods sold with reversal). |
| 5 Chain widget on screens | **Done** (Chain panel on enquiry, quotation, order desk, PO, GRN, vendor bill, Bill of Entry, work order, challan, invoice, indent), plus the Order Desk and the payables view. |
| 6 Remaining gaps | **Done** (SFG QC and reject store, job card, job-work documents, files on every document, Bill of Entry); also returns after billing. |

The decisions in section 2 were answered by assumption, not by you; see Pending-Items.md for the assumptions and everything still open. 347 automated tests pass; no screen has been run in a browser.

## Incoming commit update: `d3ffb55` (15 Oct 2026)

This commit completes the remaining document and production controls described in Phase 6 and adds their connected screens and API workflows:

- **Order Desk and job cards:** manage sales orders from one workspace, including stock reservation, order-specific planning, cancellation, document lineage, and printable production job cards.
- **Supplier and import purchasing:** book vendor bills against inspected receipts; record Bills of Entry; capitalize customs duty and eligible charges into inventory while keeping import IGST as input tax; reverse a cancelled entry cleanly.
- **Purchase returns:** return accepted goods before or after supplier billing, with the appropriate inventory, payable, price variance, and GST reversals.
- **Subcontracting documents:** create job-work purchase orders, record returned challan references, and prepare a sales order for inward job-work services.
- **Semi-finished goods quality:** require signed QC disposition before re-issue, route rejected quantities to the reject store, and retain an audit record.
- **Document support:** extend file attachments and access checks across document types and add lineage panels to more transaction screens.
- **Cost flow:** carry material cost through work in progress and finished goods to dispatch, with reversals when a delivery challan is cancelled.
- **Integration coverage:** add tests for job documents, post-billing purchase returns, semi-finished goods QC, costing, Bills of Entry, and attachment access; update the Vitest worker and timeout settings for the expanded suites.

The commit also updates the tester PDF and spreadsheet. The tests in the commit cover the new flows; this note does not claim a fresh test run against the current checkout.

## 1. Where we were (at the start of the plan)

Most chart boxes exist. What is not ready falls into two groups:

**A. Connectivity (the blueprint)** - documents exist but are linked loosely, often by a number typed as text, so you cannot walk from an enquiry to a payment.

| Link | Today |
|---|---|
| Enquiry -> Quotation | `Quotation.enquiryRef` (text) |
| Quotation -> Sales Order | `SalesOrder.quotationRef` (text) |
| Sales Order -> MRP / Indent / PO | None. `PurchaseOrder` has an `MRPRun` ref and `PurchaseIndent` has one, but nothing says which sales order they serve |
| Sales Order -> Work Order | `WorkOrder.salesOrderRef` (text) |
| PO -> GRN | Real ref |
| PO / GRN -> Vendor Bill | Bill has `order` (PO id) and PO number; no GRN ref |
| Vendor Bill -> Payment | Payment is a voucher settling the invoice; no UTR / release step on the bill, no PO payment status |
| Sales Order -> Delivery Challan | Real ref |
| Challan -> Invoice -> E-Way Bill | Invoice has SO ref and e-way/IRN fields; no challan ref; e-way not validated |
| One screen showing the whole chain | Does not exist |

**B. Flow-chart gaps**

| # | Gap | Size |
|---|---|---|
| G1 | Bill of Entry (customs) on import purchases | M |
| G2 | WIP semi-finished goods: QC approve/reject step and a separate SFG reject store | M |
| G3 | Printable Job Card from a work order | S |
| G4 | Purchase return posts a debit note automatically (not confirmed today) | M |
| G5 | Job work: separate "PO to job worker" and "PO from job worker -> prepare SO" documents (today folded into challans) | M |
| G6 | File upload available on every document (today only dispatch, GRN, job work) | S |
| G7 | NIC portal upload (e-invoice / e-way) and SMS/WhatsApp/email delivery need live credentials | needs your accounts |

## 2. Decisions needed before building (they change the design)

1. **Vendor bill at GRN.** The blueprint says the system auto-creates the bill at GRN. Recommendation: do not. The bill number, date, GST and price come from the supplier's invoice, and today's three-way match checks them against what was received. Instead: after QC, the GRN lands in an "Awaiting vendor bill" queue (already visible in the Creditors report) and one click opens Vendor Bills pre-filled from the GRN. Finance still sees it as payable under "received, not billed". OK?
2. **Where links live.** The blueprint stores arrays on both sides (`SalesOrder.linkedPurchaseOrders` and `PurchaseOrder.salesOrder`). Recommendation: store the link on the child only (PO -> SO, WO -> SO, challan -> SO, invoice -> challan) and compute the parent's lists with queries. Two copies drift apart.
3. **Stock reservation.** Approving a sales order already reserves batches earliest-expiry-first. The blueprint reserves at "Run MRP". Which moment is right: at approval (today) or when MRP is run for the order?
4. **Payment release.** Should releasing a vendor payment always go through the approval matrix (already supported for payments above a threshold) and record a UTR?
5. **Partial dispatch.** Can one sales order ship in several challans and invoices? (Recommended yes; links are one-to-many.)
6. **Import purchases.** Is Bill of Entry needed now, or only when you start importing?

## 3. Phases

### Phase 1 - Lineage foundation (L)
Goal: every document knows its parents, and one query returns the whole chain.
1. Add real refs on the child documents: `PurchaseIndent.salesOrder`, `PurchaseOrder.salesOrder` + `purchaseIndent` + `rfq`, `WorkOrder.salesOrder`, `MRPRun.salesOrder` (optional), `SalesOrder.enquiry` + `quotation`, `Invoice.deliveryChallan` + `grn`, `DeliveryChallan.invoice`. Keep the existing text numbers for display.
2. One-time migration script that fills the new refs from the existing numbers (`quotationRef`, `salesOrderRef`, `poNumber`, ...). Dry-run first, report anything it cannot match.
3. `GET /api/lineage?type=SALES_ORDER&id=...` returns the connected graph (nodes: type, number, status, amount; edges), built by following refs both ways. Role-filtered: finance nodes only for finance-view roles.
4. Tests: chain integrity, role filtering, unmatched legacy records.

### Phase 2 - Sales order driven planning (L)
1. "Run MRP for this order" on the sales order: explodes only that order's BOM, nets against free stock, tags planned orders `SO_DRIVEN` with the order id.
2. Indents created from that run carry the sales order; RFQ and the awarded PO inherit it ("Allocated for SO-...").
3. Work order creation from the order sets `WorkOrder.salesOrder`; status `PENDING_MATERIAL` until required materials are issued, then `READY_FOR_PRODUCTION`; MRN auto-drafted from the BOM.
4. Sub-assembly work orders (already built) inherit the order.
5. Tests: shortfall -> indent -> PO tagging, no duplicates on re-run, readiness flips when material arrives.

### Phase 3 - Purchase to pay (M)
1. GRN passes QC -> appears in "Awaiting vendor bill" (decision 1); "Create bill" opens the existing form pre-filled; bill stores `grn` and inherits `salesOrder` from the PO.
2. Payment release on the vendor bill: amount, mode, date, UTR; goes through the approval matrix when over threshold; posts the existing payment voucher and settles the bill atomically.
3. PO shows derived payment status (Unpaid / Partly paid / Paid) from its bills.
4. Finance screen: Accounts Payable list with the note "Material received for SO-..." and a Release Payment button.
5. Tests: partial payment, over-payment refused, retry does not double-post, role limits.

### Phase 4 - Dispatch to cash (L)
1. "Generate delivery challan" from the order (vehicle, transporter, LR number); supports partial dispatch (decision 5).
2. "Convert to tax invoice" from the challan, GST split by state; invoice stores the challan.
3. E-way bill: validate distance, vehicle number, HSN, value threshold before generating; store number, validity, vehicle on the invoice. Live NIC upload only once credentials exist (G7).
4. Invoice lands in receivables; customer receipt settles it (already built).
5. Tests: partial dispatch totals never exceed the order, one invoice per challan, validation failures, role limits.

### Phase 5 - Lineage bar on screens (M)
1. Reusable `DocumentLineageBar` component fed by the Phase 1 API: nodes coloured by status (done / in progress / not started), click opens a side drawer with that document's summary.
2. Add it to: sales order, PO, GRN, vendor bill, work order, challan, invoice.
3. One-click "next action" buttons per document state (Receive material, Create bill, Run MRP, Prepare dispatch).
4. Needs a browser check; none of our screens have been run in a browser yet.

### Phase 6 - Remaining flow-chart gaps (M each, can run in parallel with 3-5)
- G2 SFG QC step + reject store (model fields, WIP page actions, scrap posting).
- G4 Purchase return -> debit note posted with the return, reduces the vendor's payable; check GST treatment.
- G3 Job card print from the work order (stages, materials, barcode).
- G5 Job work documents (decide whether needed; challan covers the movement today).
- G6 Attachment widget added to every document page.
- G1 Bill of Entry (after decision 6).

## 4. Cross-cutting rules for every phase
- Test first for each change, as in earlier work; the whole suite (241 tests today) stays green and the auth-coverage test keeps every new endpoint behind a login.
- Every new write endpoint gets a role list; read endpoints that expose money use the finance-view roles.
- Anything that posts money is idempotent, guarded against double clicks, rolled back on failure, and respects period lock.
- Update the Excel test plan and tester PDF at the end of each phase.

## 5. Suggested order
Decisions -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5, with Phase 6 items slotted in as capacity allows. Phase 1 first because everything else hangs on it. Rough total: 6-8 weeks for one developer.

## 6. Risks
- Migrating text numbers to refs may leave unmatched old records; the dry run will show how many.
- Real NIC / SMS / email behaviour cannot be verified without credentials.
- Screens have never been checked in a browser, so Phase 5 will surface visual issues.
- The blueprint's auto-created vendor bill would bypass the three-way match if built literally (decision 1).
