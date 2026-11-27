# Pending UI and API work (since the schema and UI update)

As of 29 Oct 2026. This covers only what is left after two pieces of work:

1. The schema update from the ERP master templates (customer, material and vendor) and the line-detail / sales-controls work.
2. The new launchpad and object-page UI.

Both are on `main`. Work done since is listed in section 0 and is **not yet committed**. None of the screens below has been opened in a browser; they are type-checked and their APIs are covered by integration tests.

How this list was made: every field and endpoint added in that work was checked against the screens (`app/(dashboard)`, `components/`).

## 0. Done since this list was first written

| # | Item | What was done |
|---|---|---|
| A1 | Customer edit and delete | `GET/PATCH/DELETE /api/customers/[id]`. A customer used on a quotation, order or invoice is kept (deactivate it). Shared rules in `lib/customerMaster.ts`. |
| A2 | Storage location delete | `DELETE /api/storage-locations/[id]`. A location that held stock or is named on a receipt or transfer is kept. |
| A3 | Stock transfer by storage location | `POST /api/inventory/transfers` takes storage-location codes, checks both exist and are in use, and requires each batch to be in the origin. Received stock is stored in the destination. |
| U1 | Hold history | Shown on the sales order page (Header → Hold history), with who, when and why. |
| U2 | Below-MSP record | Shown on the sales order page (Header → Pricing) and flagged on the lines. |
| U3 | Requisition open quantity in the PO form | Each PO line can pick an open requisition line, shows the open quantity and warns when the order is more than is open. |
| U4 | Stock transfer form | Origin and destination are now storage-location pickers; only batches stored at the origin are offered. Sample vehicle and driver names removed. |
| P1 | Sales order object page | `/dashboard/order-desk/[id]` (the order number on the Order Desk opens it). New `GET /api/sales-orders/[id]`. |
| Customer list | Customer list screen | Already exists: Dispatch → "Customer GST details". It had its own 8-field inline form; it now opens the full customer form (new and edit) and shows account group, sales areas and credit limit. |
| Forms | Customer, material and vendor fields | The fields in section 2 are now on the customer, product and supplier forms, including MSP. |
| A4 | Product update takes only product fields | `lib/productInput.ts` lists the fields a create or update may set; the net weight is checked against the gross weight on the stored value too. |
| P8 | Customer, material and vendor object pages | `/dashboard/customers/[id]` (opened from Dispatch → Customer GST details), `/dashboard/products/[id]` (with stock by batch) and `/dashboard/suppliers/[id]`. Each has a Change button that opens the full form. |
| P2 | Quotation object page | `/dashboard/crm/[id]` (opened from the quotation number on CRM): sales, terms, tax, discount requests, revisions, status. New `GET /api/quotations/[id]`. The quotation list no longer answers with sample quotations when the database fails (only in DEMO_MODE). |
| P3 | RFQ object page | `/dashboard/procurement/rfqs/[id]`: rate comparison with the lowest landed total marked, vendors still to quote, award and purchase order, requisitions, and each vendor's price per line. New `GET /api/rfqs/[id]`. |
| P4 | Work order object page | `/dashboard/production/[id]`: general, material readiness, quality (including the finished-goods inspection), cost, sub-assemblies, routing and stage log, with the job card button. A malformed id on `GET /api/production/[id]` is now a 404 (it was a 500). |
| P5 | Delivery challan object page | `/dashboard/dispatch/challans/[id]`: transport, parties, stock taken and not found, cost (finance roles only). New `GET /api/delivery-challans/[id]`. |
| P6 | Pro-forma and tax invoice object pages | `/dashboard/dispatch/proformas/[id]` and `/dashboard/dispatch/invoices/[id]` (billing, tax, payment, e-invoice and e-way). New `GET /api/proforma/[id]`; `GET /api/dispatch/invoices/[id]` returns the invoice when no `?doc=` is given. |
| P7 | Vendor bill object page | `/dashboard/vendor-bills/[id]`: bill, tax, payment, lines with returned quantity. New `GET /api/vendor-bills/[id]`. |
| P9 | Picking | New pick lists (`/api/pick-lists`, Dispatch → Pick lists, `/dashboard/dispatch/picks/[id]`). A list is planned from the batches reserved for an approved sales order, then free usable stock by earliest expiry. The picker enters what was really picked (a short pick needs a reason) and confirms. **A delivery challan can only be issued for picked goods**; each challan takes its quantity from the picked lines atomically, and cancelling or failing a challan gives them back. A pick list can be printed as a sheet and cancelled until something is dispatched from it. |
| Leads | Enquiry (lead) entry, edit and cancel | One shared form (`EnquiryModal`) on CRM ("+ New enquiry", Edit, Cancel on each enquiry) and Sales Pipeline. Several items, phone, notes, domestic or export with country, and server errors shown in the form. Enquiry numbers are now sequential (`ENQ-year-0001`). `PATCH /api/enquiries/[id]` edits or cancels an enquiry that has not been quoted; once quoted or cancelled it is locked. Converting an enquiry claims it first, so a double click or a cancel at the same moment cannot make two quotations or quote a cancelled lead. Only Admin, Manager, Sales and Staff can add or change enquiries. |
| Fix | Product delete | Reported success when the database failed and removed products still in use. Now a real error, and a product on stock, a BOM or orders is kept (409). |

## 1. APIs pending

None of A1–A4 remains. Product creation is still open to any signed-in role (only update and delete are limited to Admin and Manager); say which roles should create products if that should change.

## 2. UI integration: new schema fields

Done. The customer, product and supplier forms carry the fields below, and each record has an object page (P8).

Fields now on the forms:

- **Customer:** account group, search term, PAN, tax ID, region, country; company code, reconciliation account, payment method, dunning procedure; sales areas (sales org, distribution channel, division, district, pricing procedure, shipping conditions, incoterm).
- **Material:** gross and net weight, OEM name and part number; plant, MRP type, safety stock, planned delivery days; storage bin, batch managed; valuation class, price control; minimum selling price. (Material group is the category.)
- **Vendor:** account group, search term, city, pincode, region, country, tax ID, VAT number; company code, reconciliation account, payment method, tolerance group, withholding tax code; purchasing org, order currency, incoterm, minimum order value, pricing schema group; ordering address and invoicing party.

## 3. UI pending: screens not yet in the new look

The shell, launchpad, tabs and panels apply to every page. These documents have full **object pages** (toolbar, header strip, sections, item table):

- Purchase order
- Purchase requisition
- GRN
- Stock transfer
- Sales order
- Customer, material and vendor masters
- Quotation, RFQ, work order, delivery challan, pro-forma and tax invoice, vendor bill

Nothing is left on this list: every document now has an object page, and picking exists.

Note on the sales order page: it is read-only apart from Hold and Release. Editing, approval, stock reservation, planning and cancelling stay on the Order Desk. The older `orders/[id]` page is for warehouse orders (the earlier `Order` model), not sales orders.

Not every tab and dialog inside the converted pages has been clicked through in a browser. Each page's main view and main forms were checked.

## 4. Suggested order

1. A browser pass over everything in section 0 (E4 in Pending-Items.md).

## 5. Item master details: stored, not yet connected (added 30 Oct 2026)

The Item screen (Masters > Items, `/dashboard/masters/items`) saves these fields on the item (`models/Product.ts`, checked in `lib/productInput.ts`). Nothing else reads them yet. Each row says what still has to use it.

| Field | Meaning | Still to connect |
|---|---|---|
| `salesUom`, `salesConversion` | Unit the item is sold in and how many stock units are in one (1 box = 10 pcs) | Sales order, challan and invoice lines in the sales unit, converted to stock units for reservation and dispatch |
| `purchaseUom`, `purchaseConversion` | Unit the item is bought in and stock units in one | PO and GRN lines in the purchase unit; GRN converts to stock units for batches; vendor bill matching per purchase unit |
| `stockType` (STOCKABLE / NON_STOCK) | Non-stock items (consumables, services) carry no stock | GRN should not create batches for non-stock items; MRP and reorder should skip them |
| `includeInValuation` | Whether the item counts in stock value | Inventory valuation report and GRNI |
| `isScrap` | The item is scrap | Scrap entries and the scrap store; sales of scrap |
| `rackNo` | Rack the item is kept on (bin already existed) | Put-away default at GRN; pick lists |
| `salesAccount`, `purchaseAccount` | Ledger codes for this item's sales and purchases (checked against the chart of accounts) | Invoice and vendor-bill postings use the item's ledger instead of the default sales/purchase account |
| `hsnDescription` | Tariff description of the HSN code | Tax invoice and e-invoice item description |
| `deactivatedFrom` | Date the item stops being used (`isActive` is still the switch) | Block the item on new documents from that date |
| `remarks` | Free text | — |

Also open: Excel/CSV import of items. The HSN/SAC master (Masters > HSN / SAC Codes) is loaded from the GST portal HSN/SAC Excel or a rate sheet; the files carry descriptions, and rates only when the sheet has a rate column. Product creation is still open to any signed-in role in the API; the Item screen lets only Admin and Manager create and change items.
