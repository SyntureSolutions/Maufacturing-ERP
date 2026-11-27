# Test plan: LOGIC_REVIEW fixes (branch `fix/logic-review-p1`)

Paste this whole file into Claude Code on your Windows machine. Nothing is committed yet.

## Instructions for Claude Code
1. Check out `fix/logic-review-p1`. Run `npx tsc --noEmit -p .` (expect no errors).
2. Run `npx vitest run` (full suite). `tests/integration/logic-fixes.test.ts` is new and has never been run: it was written without a MongoDB binary. If a test fails, decide whether the TEST or the CODE is wrong, say which, and fix only that. Do not weaken an assertion just to pass.
3. Report: failures, what you changed, and anything in the checklist below with no automated test. Add tests for the gaps.
4. Do not commit until I say so.

## A. Already covered by `logic-fixes.test.ts` (confirm they pass)
- PO above the finance limit: supply chain manager cannot release it (403); PO cannot be set to RECEIVED by hand (409).
- Sales role cannot create a PO (403); negative quantity returns 400.
- ORDERED PO cannot be edited; cannot be cancelled once goods are received (409).
- GRN with two lines of the same product that together exceed the open quantity is refused (400), and no GRN is created.
- Two simultaneous GRNs for the same balance: exactly one succeeds.
- Past or invalid expiry date is refused.
- A GRN line cannot be inspected twice (same request: 400, second request: 409); only one GRN_RECEIPT journal exists.
- Inspecting with a return quantity re-opens that quantity on the PO.

## B. Missing tests to add (not yet written)
**Purchase orders**
1. Under the supply-chain limit, a new PO is auto-ORDERED; over it, PENDING_APPROVAL.
2. Editing lines of a PENDING_APPROVAL PO recomputes total and tier, and clears `approvedBy`.
3. A PO with a pending matrix ApprovalRequest cannot be released or edited by hand (409).
4. Negotiation: SUBMIT/FINALIZE only for ADMIN or FINANCE_MANAGER; FINALIZE never lowers `approvalRequiredRole`.
5. VIEWER gets the existing read-only 403 message.
6. GET /api/purchase returns 503 (not sample data) when the DB is down.

**GRN**
7. Failure undo: make `Batch.create` throw on the second line; afterwards no GRN, no batches, PO `receivedQuantity` unchanged.
8. Failure undo on inspect: make `postVoucher` throw (return quantity > 0); afterwards GRN line is PENDING again, batch restored, no journal left.
9. `receivedDate` is set only when the PO becomes fully received.
10. Same-product lines get distinct batch numbers.

**Stock**
11. `POST /api/inventory/adjust`: STAFF 403; invalid reason 400; decrement below reserved quantity 409; INCREMENT on a non-APPROVED batch 409; locked inventory period refused; audit entry written.
12. Transfers: STAFF can create; SALES 403; batch with insufficient free stock 409; DISPATCH twice -> second 409 and stock deducted once; RECEIVE before DISPATCH 409; receive more than sent 400; shortage stored; destination batch keeps product, expiry, cost; failed dispatch on line 2 restores line 1 stock.
13. Cycle count: only PLANNED/IN_PROGRESS editable; client-sent `systemQuantity`/`unitCost` ignored; POST twice -> second 409 and stock changed once; stock moved after the count -> delta applied, not overwritten; delta below reserved -> 409 and count back to PENDING_APPROVAL; REJECT only from PENDING_APPROVAL/IN_PROGRESS; SALES/VIEWER 403.
14. Work orders: SALES and FINANCE_MANAGER get 403 on `PATCH /api/production/[id]`; PRODUCTION_MANAGER still works.

## C. Manual checks in the browser (not automatable here)
- Purchase page: create a PO with the supplier service stopped, expect an error toast and no PO row.
- Purchase page: "Partial receive" now opens `/dashboard/grn?po=<id>`; confirm the GRN page pre-selects that PO.
- Inventory page: create a transfer, dispatch, receive; check the UI still sends `batchId` and `requestedQuantity`, and that the list shows real data only.
- Cycle count screen: counted quantities save by line order; submit; approve as MANAGER.

## D. Regression watch
Run these specifically: `approval-tiering`, `governance-audit`, `approvals`, `procurement`, `integration/purchase-to-pay`, `procure-to-production`, `partial-receipts`, `auth-coverage`, `open-items`, `sfg-qc`.
