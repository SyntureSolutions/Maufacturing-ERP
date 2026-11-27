# Prodexa ERP – Business-Logic Review (PO, GRN and neighbouring modules)

**Scope:** consistency across modules and faults in the current flow, with a close look at Purchase Orders and GRNs. **No code was changed.** Anything that would need new functionality is listed separately in section 6.

**Method and limits:** I read the source of `app/api/purchase*`, `grn*`, `rfqs/[id]`, `approvals/requests`, `lib/vendorBill.ts`, `lib/allocation.ts`, `lib/mrn.ts`, `lib/costing.ts`, `inventory/{adjust,batches,cycle-counts,transfers}`, `production/*`, `sfg/[id]/qc`, `mrn/[id]`, `delivery-challans`, `sales-orders*`, `quality` and the PO/GRN screens' API calls. Findings come from reading the code; **I did not run the app or reproduce them**, and I did not look at live data. "Race" findings are reasoned from the read-modify-write pattern, not demonstrated. Severity: **Critical** = money or stock can be wrong or approvals bypassed in normal use; **High** = wrong results under realistic conditions; **Medium** = inconsistency or edge-case fault; **Low** = polish.

---

## 1. The consistency picture

The codebase is **two generations of code living side by side**.

| Generation | Modules | Behaviour |
|---|---|---|
| **Modern** (guarded, undoable, tested) | vendor bills, payables, returns after billing, Bill of Entry, delivery challan / invoicing, vouchers, approval matrix, SFG QC, outward job work, sales-order approval and edit | Conditional atomic updates, "undo if a later step fails", idempotency, period lock, role lists, audit |
| **Legacy** (unguarded, memory fallbacks) | `purchase` route, `inventory/batches`, `inventory/adjust`, `inventory/transfers`, `inventory/cycle-counts`, `quality`, GRN create/inspect, FG QC, stage output, work-order status, sales-order create | Read-modify-write, swallowed errors, sample data, missing role checks, no ledger posting |

Most serious faults below are where a **legacy step feeds a modern one** (e.g., legacy GRN → modern vendor bill).

Other cross-module inconsistencies:

| Topic | Inconsistency |
|---|---|
| Document numbers | PO `PO-YYYYMMDD-001` (count-based) vs RFQ-awarded PO `PO-YYYY-0001`; GRN/DC/RTV `PREFIX-YYYY-0001`; transfers `STO-YYYYMM-<random>`; WO `WO-BIK-YYYYMMDD-001` |
| "PO total" | Manual PO = pre-tax Σ(qty×price). RFQ-awarded PO = **GST + freight included**, while lines hold pre-tax prices. Same field, two meanings |
| Minimum quantity | Indent/RFQ lines allow 0.0001, PO item schema requires **≥ 1**, GRN allows fractions |
| Approval | Legacy thresholds (`>` limit) vs approval matrix (`>=` minAmount); two engines (see P1, P7) |
| Quality status | GRN inspection and the Quality module both write `Batch.qualityStatus` (G5) |
| Where stock "is" | `store` (QUARANTINE/W1…) vs free-text `location`; transfers use free-text warehouse names |
| Expiry | Mandatory on every batch (food-era rule) – GRN asks the user, FG gets +5 years, transfers get +1 year |
| Reservations | `allocatedQuantity` is an anonymous counter; MRN keeps no batch references (I5) |

---

## 2. Purchase Orders

| ID | Sev | Where | What goes wrong |
|---|---|---|---|
| **P1** | Critical | `api/purchase` (UPDATE_STATUS, FINALIZE_NEGOTIATION), `api/purchase/[id]` PATCH | **Approval can be bypassed three ways.** (a) The tier check runs only when the PO needs FINANCE/ADMIN; for POs ≤ the Supply-Chain limit **any signed-in non-viewer** (HR, Quality, Sales, Staff…) can set `ORDERED`, and such POs are created already `ORDERED` with no human approval at all. (b) `PATCH /api/purchase/[id]` lets ADMIN/MANAGER/FINANCE_MANAGER set any status and overwrite `items` and `totalAmount` with no tier check – a Manager can order a ₹10 lakh PO that needs Admin. (c) `FINALIZE_NEGOTIATION` has no role check and rewrites prices/total even after the PO is ordered, received or billed; `approvalRequiredRole` is fixed at creation and never recomputed |
| **P2** | High | `api/purchase` UPDATE_STATUS | **No status machine.** Any `newStatus` is accepted: `RECEIVED` / `PARTIALLY_RECEIVED` can be set **without a GRN** (marks every line fully received, no stock, no books – the PO then can't be received or billed); `CANCELLED` after receipts or bills; `ORDERED` on a cancelled/received PO re-opens receiving. The PO screen itself calls UPDATE_STATUS with `PARTIALLY_RECEIVED` (purchase page ~line 164). (`PATCH /[id]` blocks only `RECEIVED`.) |
| **P3** | High | `api/purchase` POST | **Errors are swallowed into a fake success.** Creation is wrapped in `try { … } catch { memory fallback → 201 }`. A validation failure (e.g., quantity < 1), a duplicate `poNumber`, or any DB error returns "created" for a PO that exists only in server memory and vanishes on restart. Same pattern in UPDATE_STATUS and negotiation: the DB error is ignored and the in-memory sample PO is changed instead |
| **P4** | High | `api/purchase` POST | **No input validation.** Supplier and product ids not checked, no `quantity > 0` / `unitPrice ≥ 0` checks, duplicate product lines allowed, missing `items` crashes into the fallback. Duplicate product lines later break receiving (GRN finds only the first line) and billing (`billedQuantity` is incremented on **every** line of that product) |
| **P5** | Medium | `api/purchase` POST vs `api/rfqs/[id]` award | **Two numbering schemes and two meanings of total** (see section 1). RFQ quote's GST % and freight are folded into `totalAmount` and then **discarded**: freight never reaches cost or payables, and the vendor bill later uses each product's own GST rate, not the quote's. Approval thresholds therefore compare different bases |
| **P6** | Medium | `calculatePOTier` vs `pickRule` | Boundary mismatch (`> limit` vs `>= minAmount`) – a PO exactly at the limit is tiered differently by the two engines |
| **P7** | Medium | `lib/approvals.ts` + PO screen | **Two approval engines that don't interlock.** The PO screen only uses the legacy path (`UPDATE_STATUS`). The matrix accepts only **DRAFT** POs (`/api/approvals/requests`), but manual POs are created `ORDERED` or `PENDING_APPROVAL`, never DRAFT – so the matrix works only for RFQ-awarded POs. A DRAFT PO with a pending matrix request can also be moved to ORDERED through the legacy path; on final approval `applyOutcome` sets `ORDERED` without checking the PO is still DRAFT (could revive a cancelled/edited PO) |
| **P8** | Medium | `api/rfqs/[id]` PATCH | **No role check at all** (only "signed in"). Any user, including HR or Executive Viewer, can record quotes, award an RFQ (creating a PO and an approval request) or cancel it |
| **P9** | Medium | `api/purchase` GET | If the PO collection is **empty**, the API returns hard-coded sample POs (`po-1…po-6`) to real users. A new tenant sees fake orders |
| **P10** | Low | model vs UI | PO quantity `min: 1` blocks fractional orders (kg, m) that indents/RFQs/BOMs allow; an RFQ award for 0.5 units fails with a 500 |
| **P11** | Low | `api/purchase` | PO number from `countDocuments + 1` can repeat after deletions or concurrent creates (unique index then fails → see P3) |

---

## 3. GRN (goods receipt and inward QC)

| ID | Sev | Where | What goes wrong |
|---|---|---|---|
| **G1** | High | `api/grn` POST | **Over-receipt possible.** "Remaining" is computed per line from the PO *before* any line is applied, so two lines for the same product in one request (PO 100 → lines of 100 and 100) both pass and 200 are received. Concurrent GRNs on the same PO can also each pass the check and the last `po.save()` wins (no atomic `$inc`/guard like the modern code) |
| **G2** | High | `api/grn` POST | **Not atomic.** Sequence is number → `GRN.create` → create batches → `grn.save` → `po.save`, with no rollback. A failure after the batches exist leaves quarantine stock and a GRN while the PO still shows the goods as open → the same goods can be received again |
| **G3** | High | `api/grn/[id]` inspect | **Writes batches before the books and before the GRN is saved.** Batches are set `APPROVED` and saved first, then the journal, debit note, RTV and PO update run, and the GRN lines are saved last. If any later step throws, the stock is already approved and allocatable but the GRN still says `PENDING`, so it can be inspected **again** (double stock value and double journal). Also, two decisions for the same line index in one request both pass validation and are both journalled |
| **G4** | High | `api/grn/[id]` inspect + `api/quality` | **Two QC sources of truth.** A Quality-module check marked PASSED sets the batch `APPROVED` (and FAILED sets `REJECTED`) regardless of the GRN decision: a batch rejected/scrapped at the GRN (store `SCRAP`) can be flipped back to approved, and a FAILED check changes status without moving stock or posting anything |
| **G5** | Medium | `lib/allocation.ts` vs `mrn.ts` / `mrpEngine.ts` | **Quarantine is treated differently.** FEFO allocation (sales-order approval) ignores `store`, so QC-approved stock that has **not been put away** can be reserved and dispatched; MRN reservation and MRP exclude `QUARANTINE`. The same batch counts as stock for one function and not for another |
| **G6** | Medium | `api/grn` POST | **Expiry is mandatory and unvalidated.** Every line must have an expiry (even frames, tyres, steel). Past dates are accepted; there is no minimum or shelf-life logic. Users will type arbitrary dates, which then drive FEFO and "expired" exclusion |
| **G7** | Medium | `api/grn` POST | **PO shows RECEIVED at the gate, before QC.** `RECEIVED` is set as soon as quantities are booked into quarantine. Returned quantity re-opens the PO, but **scrap does not**, and inward scrap is not written to the scrap register (`RM_SCRAP` is used only by job work). The books take the scrap as a loss and still credit the vendor (so it is billable) – no vendor-claim/replacement path |
| **G8** | Low | `api/grn/[id]` putaway | Whole accepted quantity must go to one location (no split put-away); no bin capacity or duplicate check; `Batch.location` text and `store/zone/rack/bin` can drift (the batch screen's "transfer location" updates only the text) |
| **G9** | Low | `api/grn` | `po.receivedDate` is overwritten on every partial receipt; GRN read is open to any signed-in role (known H3); GRN price comes from the PO line, so a later renegotiation (P1c) leaves GRN price ≠ PO price (the vendor bill's variance logic absorbs it) |

What is solid in this area: the gate-entry checklist and mandatory challan/vehicle fields, the inspect-quantity rule (accepted + scrap + return = received), role limits on inspection, period-lock checks, and the **vendor bill three-way match** (`lib/vendorBill.ts`: guarded claims, undo on failure, unique bill number, price variance).

---

## 4. Other modules

| ID | Sev | Where | What goes wrong |
|---|---|---|---|
| **I1** | High | `api/inventory/adjust` | **No role check** (an Executive Viewer can adjust stock), reason not stored, no audit entry, no inventory log, no ledger entry, no period lock, read-modify-write race. Contradicts the SRS rule "every movement is logged / reason mandatory" |
| **I2** | High | `api/inventory/cycle-counts/[id]/post` | **No role or status check** – a POSTED or CANCELLED count can be posted again; stock is overwritten with the counted number (ignores movements since the count and reservations); no journal for the variance value; no period lock; per-batch failures are swallowed yet the count is marked POSTED; if the count isn't found it returns a success message |
| **I3** | High | `api/inventory/transfers` | **Dispatch/receive are not idempotent** (repeat DISPATCH deducts twice, repeat RECEIVE adds another batch); dispatch clamps to 0 instead of refusing on shortage and ignores reservations; receive creates a **new batch with an invented expiry (today + 1 year)**, default cost ₹2,500 and no QC/store; if the product lookup fails the stock has already left; no ledger entry; transit shortage isn't valued; warehouses are free text unrelated to W1/W2/W3; transfer numbers use a random suffix |
| **I4** | High | `api/inventory/batches` POST | Any signed-in role can create an arbitrary batch from the request body – stock with no GRN, QC or books |
| **I5** | High | `lib/mrn.ts`, `api/mrn/[id]` issue | **Reservations are anonymous.** MRN stores only a reserved *quantity*; on issue it takes stock from *any* batch with `allocatedQuantity > 0` (earliest expiry), so a work-order issue can consume units reserved for a **sales order**. The sales order's `allocatedBatches` then point to depleted stock; at dispatch the shortfall appears. Issue also uses unguarded read-modify-write |
| **I6** | High | `api/production/[id]` PATCH, `stage-output`, `fg-qc` | **Production can run with no material issued.** The start gate only blocks the `SHORTFALL` state and only for sales-order-linked WOs; `NO_MRN` and `READY` (reserved, not issued) both pass. Work-order creation does not create an MRN (only the MRP route or a manual MRN does). Stage output and FG sign-off never check issued material, so FG batches can be created at **₹0 unit cost** and COGS is wrong |
| **I7** | High | `api/production/[id]` PATCH | **Any signed-in non-viewer can change a work order's status** (cancel, hold, re-plan). Only the QC override is role-limited. No status machine: `COMPLETED → PLANNED` is possible, and a WO can be completed with stages unfinished |
| **I8** | Medium | `stage-output`, `sfg/[id]/qc` | SFG QC is not enforced inside the same work order: the next stage consumes SFG lots regardless of `qcStatus`; a QC rejection reduces the lot but **not the next stage's `inQty`**, so rejected units remain counted as available; once the next stage consumes a lot it can no longer be inspected. The QC gate only bites on cross-WO re-issue |
| **I9** | Medium | `lib/costing.ts` | **In-line scrap is never costed.** Scrap logged at intermediate stages posts nothing, and unit cost = remaining WIP ÷ (planned qty − decided qty) still counts units that were scrapped earlier, so good units are under-costed and the scrapped units' cost stays in WIP permanently (WIP is not cleared at WO completion) |
| **I10** | Medium | `api/production/[id]/fg-qc` | Unlike SFG QC there is no guarded update: two simultaneous sign-offs can both pass the pending-quantity check; the journal is posted before the batch is created (no undo); FG batches get an invented +5-year expiry; FG made for a sales order is not reserved to it (reservation happened earlier from existing stock) |
| **I11** | Medium | `api/sales-orders` POST | Trusts client `totalAmount` and `items` (no product check, no price/tax computation), hard-codes `creditCheckPassed: true`, stores only `customerName` (no customer reference), and on any error returns a fake in-memory order with a default total of ₹500,000 |
| **I12** | Medium | quotations / sales orders | **Credit limit** is checked only when a quotation is won (and can be bypassed with a flag); not at order approval or dispatch |
| **I13** | Low | multiple | Sample-data fallbacks (`memory…` arrays) exist in purchase, batches, transfers, work orders, sales orders, replenishment, audit – they hide outages and show fake records when a collection is empty (see P3, P9) |

---

## 5. Suggested fix order (corrections only, no new features)

1. **Close the approval bypasses** (P1, P2, P8): enforce tier + role on the server for every status change; remove the free-form `newStatus`; add the missing role checks (RFQ, adjust, batches, cycle-count post, transfers, work-order status).
2. **Stop faking success** (P3, P9, I11, I13): remove the in-memory fallbacks from write paths and return real errors; keep sample data behind an explicit demo flag.
3. **Make GRN and inspection transactional** (G1–G3): atomic `$inc` on PO `receivedQuantity` with a guard, merge duplicate lines, save the GRN state before approving batches, undo on failure.
4. **One QC authority and one reservation model** (G4, G5, I5): decide whether GRN inspection or the Quality module owns `Batch.qualityStatus`; make allocation/MRN/MRP agree on quarantine; record reservations per batch per document.
5. **Book every stock movement** (I1–I4): adjustments, cycle counts and transfers should be role-limited, idempotent, period-locked, logged and posted to the ledger.
6. **Production data integrity** (I6–I10): require issued material before stage output; fix the QC-reject quantity flow; cost in-line scrap and clear WIP at completion.
7. **Housekeeping** (P4–P6, P10, P11, G6–G9, I12): validate inputs, one numbering helper (`createNumbered`) everywhere, one definition of PO total, align minimum quantities, optional expiry.

## 6. Things that are *additions*, listed only (not for now)

- A single **PO state machine** and one approval engine (legacy thresholds merged into the matrix).
- A **stock-movement ledger** (every in/out/adjust/transfer with reason, user, document) tied to the GL.
- **Per-document batch reservations** (who holds which units).
- A **shelf-life flag per product** so non-perishables need no expiry.
- **Vendor claims / replacement tracking** for inward scrap and rejected goods; a return-to-vendor dispatch step.
- **Credit-limit check at sales-order approval and dispatch.**
- **WIP clearing / variance posting** when a work order closes.
- An environment switch **DEMO_MODE** that is the only place sample data and demo logins are allowed.
- Idempotency keys on GRN and dispatch creation.
- Duplicate-product-line rule (or line ids) on PO items.

---

## Fix status (updated 2026-10-27)

Fixed in code on branch `fix/logic-review-p1` (not committed). Tests: all 22 non-database files pass; the new `tests/integration/logic-fixes.test.ts` needs a machine with the MongoDB test binary.

| Item | Status | What changed |
|---|---|---|
| P1, P2, P7, P8 | Fixed | PO status moves follow a fixed set; received states only via GRN; approval needs the tier's role and no pending matrix request; negotiation limited to Admin/Finance and never lowers the tier |
| P3, P9 | Fixed | PO routes and PO form no longer invent a saved PO; real errors are returned |
| P4, P5, P10, P11 | Fixed | PO input validated on the server; edits reset approval; numbering via `createNumbered` |
| G1, G2 | Fixed | GRN takes the PO balance atomically (per product, so duplicate lines cannot over-receive); undone if a later step fails; expiry validated; `receivedDate` set once |
| G3 | Fixed | Each GRN line is claimed once before any stock or books are touched; journal, debit note, RTV, batches and PO are undone if a step fails |
| I1 | Fixed | Stock adjust: role check, period lock, reason list, atomic no-below-reserved guard, audit entry |
| I2 | Fixed | Cycle count post: role check, posted once, applies the difference instead of overwriting; submit uses frozen system quantity and cost |
| I3, I11 (transfers) | Fixed | Transfers: roles, real batches only, dispatch/receive claimed once, cannot receive more than sent, shortage kept, no sample data |
| I7 | Fixed | Work-order status changes limited to production-side roles |
| G4, G5, I4, I5, I6, I8-I10, I12, G6-G9, I11 (rest) | Open | Not yet done |

### Update: G4 and G5 (2026-10-27)

| Item | Status | What changed |
|---|---|---|
| G4 | Fixed | The inward GRN inspection is the only thing that approves or rejects a delivery at the gate. The Quality module (`app/api/quality`, `lib/stockRules.ts: applyCheckToBatch`) cannot approve an uninspected delivery, cannot flip a rejected or scrapped batch back to approved, and a FAILED check on accepted stock puts it `ON_HOLD` (not `REJECTED`) and raises an NCR. A later PASSED check can release an ON_HOLD batch. Checks are decided once; only Admin, Manager and Quality Inspector can record or decide them; failed saves return errors instead of a made-up 201. |
| G5 | Fixed | One definition of usable stock (`USABLE_STOCK` in `lib/stockRules.ts`: QC-approved and not in QUARANTINE or SCRAP) is used by sales allocation, MRN reservation, MRP and dispatch. Accepted goods that are not yet put away can no longer be reserved or shipped. |

### Update: I5 (2026-10-27)

| Item | Status | What changed |
|---|---|---|
| I5 | Fixed | A material requisition now records which batches each line reserved from (`items[].holds`). Issuing takes only from those batches, with guarded updates, so a work-order issue can no longer consume units reserved for a sales order or another work order. If reserved stock has gone, the issue stops with 409 and everything is put back. Cancelling releases exactly those batches. One change at a time per requisition (lock), so a double click cannot issue twice. Requisitions created before this change fall back to the old behaviour for their un-recorded quantity. |

### Update: I4, I12, G8, G9 (2026-10-27)

| Item | Status | What changed |
|---|---|---|
| I4 | Fixed | `POST /api/inventory/batches` no longer creates batches (410): stock enters through a GRN, production or a transfer. Moving a batch to another bin needs a stores-side role. GET no longer returns sample batches. |
| I12 | Fixed | Credit exposure is now real: unpaid issued sales invoices (less credit notes) plus approved orders not yet invoiced (`lib/creditExposure.ts`). Checked when a quotation is won (replacing the hard-coded ₹4,50,000) and at sales order approval. Overriding needs Admin, Manager or Finance Manager and is written to the audit log. Orders part-way invoiced are not counted (errs low). |
| G8 (part) | Fixed | A batch's text location and its warehouse/zone/rack/bin are changed together, in the form `W1/A/R1/B1`; free text is refused for a batch that has a stored place. Split put-away across locations and bin capacity are not done. |
| G9 (part) | Fixed | `receivedDate` is set once, when the PO is fully received. GRN read access and PO-price-vs-GRN-price are unchanged. |
| G6 | Partly open | Past and invalid expiry dates are refused. Making expiry optional for non-perishables needs FEFO and expiry filters to treat "no expiry" as never expires: not done. |
| G7 | Open | Needs a policy decision: should goods scrapped at inward QC re-open the PO quantity (vendor replaces) and should they be written to the scrap register? |

### Update: G7 (2026-10-27)

| Item | Status | What changed |
|---|---|---|
| G7 (part) | Fixed | Inward scrap is written to the scrap register (`RM_SCRAP`) in the same undoable step as the books. |
| G7 (rest) | Open - decision needed | Scrap still does **not** re-open the PO, on purpose: the books charge it as a loss and still credit the vendor, so re-opening it for a replacement would pay for the same goods twice (`partial-receipts` test "non-returnable scrap is not re-opened on the PO" pins this). To let the vendor replace scrapped goods, scrap would have to be treated like a return (debit note for the scrapped value, PO re-opened) or have its own vendor-claim step. |

### Update: production integrity (2026-10-27)

| Item | Status | What changed |
|---|---|---|
| I6 | Fixed (at stage output) | Stage output is refused when no material has been issued to the work order (`materialCost` is zero) unless a Manager/Admin overrides with a written reason (10+ characters), which is audited. Starting a work order is still gated only for sales-order work with a short requisition. |
| I9 (part) | Fixed | Scrap logged on the line (any stage) is costed when it is logged: scrap loss debited, work in progress credited, at the cost per unit still to come out. The FG cost per unit now divides by the units that can still come out (planned less line scrap less decided), so good units carry the full cost. Undone if a later step fails. |
| I9 (rest) | Open - decision needed | Work-in-progress is not cleared when a work order completes with units never produced: the leftover material cost stays in WIP. |
| I10 (part) | Fixed | FG sign-off claims its units in one guarded update (two at once cannot both pass), books the cost, creates the batch and scrap entry, and undoes everything if a step fails. Stage output is serialised per work order and undone on failure; SFG lot consumption is guarded. Invented +5 year expiry on FG remains (tied to G6). FG made for a sales order is still not reserved to it. |
| I8 (part) | Fixed | Units rejected at SFG QC are taken off the next stage's input. |
| I8 (rest) | Open - decision needed | The next stage still consumes SFG lots that are PENDING QC. Requiring QC on every intermediate lot before the next stage is a process choice. |

---

## Fix status: I11 (fake-success fallbacks)

When a save failed, these routes used to answer with invented data and a success code. They now return the real error, and the new test file `tests/integration/no-fake-success.test.ts` covers them.

| Route | Change |
|---|---|
| `POST /api/sales-orders` | Rewritten. Roles limited to sales-side roles. Customer and every product must exist. Quantity and price are validated. Totals are worked out on the server (missing price falls back to the product price). `creditCheckPassed` is no longer taken from the client. |
| `customers`, `products`, `enquiries`, `enquiries/[id]/convert` | No sample data on failure. Validation errors return 400, duplicates 409, other failures 500. |
| `quotations/[id]` | A deal can no longer be reported as won when nothing was saved. |
| `sales-orders/[id]/approval` | No more "Demo Mode" approval. |
| `production` (POST) and `production/[id]` (PATCH) | Unknown work order returns 404. A database failure is an error, not an in-memory success. |
| `lib/httpError.ts` `statusOf` | Also maps validation, cast and duplicate-key errors. |

**Left as they are on purpose:** `finance/invoices`, `proforma`, `gst`, `supply-chain`, `labour/attendance`, `finance/assets`, `inventory/replenish`, `settings/approval-thresholds`, `lib/salesStore.ts`, `lib/audit.ts`. The existing unit tests (`quote-invoice-separation`, `governance-audit`) depend on their demo fallbacks. Fixing them properly is a finance design change, not a corrections-only edit.

**Separate finding (finance/invoices):** `RECORD_PAYMENT` changes `amountPaid` with no ledger posting, no role restriction and no overpayment check. Invoice creation also trusts client totals and uses random numbers.
