# 🎬 Prodexa ERP – Official Product Presentation & Video Demo Script

> **Document Type:** Master Video Demo & Live Presentation Script  
> **Target Video Length:** ~7 to 8 Minutes (or modular chapter clips)  
> **Target Audience:** Manufacturing Directors, Operations Heads, Plant Managers, Supply Chain Executives, and CFOs  
> **Narrator Persona:** Confident, professional, clear, articulate, and enterprise-focused  
> **Voiceover (VO) Pacing:** Moderate (~135–145 words per minute) with intentional pauses for UI transitions  

---

## 📋 Production Cue Guide

| Cue Tag | Meaning / Action Required |
| :--- | :--- |
| **`[SCREEN]`** | Current web application route and UI layout being displayed |
| **`[ACTION]`** | Specific mouse movement, clicks, scrolling, drawer toggling, or data input |
| **`[ZOOM / HIGHLIGHT]`** | Visual focus, zoom-in effect, or glowing bounding box on an element |
| **`[LOWER-THIRD]`** | Animated text overlay / subtitle graphic on screen |
| **`[VO]`** | Exact spoken voiceover narration |

---

## ⏱️ Scene Overview & Timecode Map

```mermaid
timeline
    title Prodexa ERP Demo Video Timeline (7:30)
    00:00 - 00:45 : Scene 1: Introduction & The Modern Plant Challenge
    00:45 - 01:25 : Scene 2: Executive Command Center & RBAC
    01:25 - 02:15 : Scene 3: Master Data, Dual Pricing & Multi-Level BOM
    02:15 - 03:15 : Scene 4: Sales Desk & Intelligent FEFO Reservation
    03:15 - 04:05 : Scene 5: MRP Engine & Smart Production Planning
    04:05 - 05:00 : Scene 6: Shop Floor WIP, SFG Tracking & Machine OEE
    05:00 - 05:55 : Scene 7: Procure-to-Pay, Inward Gate Entry & QC
    05:55 - 06:40 : Scene 8: Warehouse Intelligence & Batch Traceability
    06:40 - 07:15 : Scene 9: Dispatch, Rule 55 Challan & GST E-Invoicing
    07:15 - 07:35 : Scene 10: 3-Way Match, Lineage Bar & Financial Control
    07:35 - 08:00 : Scene 11: Outro & Call to Action
```

---

## Scene 1: Introduction & The Modern Plant Challenge
* **Timecode:** `00:00 - 00:45` (45 seconds)  
* **Pacing:** Engaging, problem-focused opening  

### Visual Navigation & Screen Action
1. **[SCREEN]** Sleek cinematic intro graphic with Prodexa ERP logo and tagline: *"The Intelligent Manufacturing & Supply Chain Operating System"*.
2. **[ACTION]** Fade into Prodexa ERP Login screen at `http://localhost:3000/login`.
3. **[ZOOM / HIGHLIGHT]** Highlight the clean, modern login interface and quick-role switchers (Admin, Sales, Supply Chain, Production, Quality, Finance).
4. **[LOWER-THIRD]** `Prodexa ERP: Unified Manufacturing, Inventory & GST Compliance`

### Voiceover (VO) Script
> **[VO]**  
> Running a modern manufacturing plant is a game of precision. Yet, too many growing manufacturers are held back by fragmented systems—sales trapped in spreadsheets, production teams guessing material readiness, stock expiring in forgotten warehouse corners, and finance struggling with GST reconciliation.
>  
> Welcome to **Prodexa ERP**—an all-in-one, intelligent operating system purpose-built for process and discrete manufacturing.  
>  
> From customer enquiry to shop-floor execution, automated FEFO batch allocation, statutory GST compliance, and real-time financial control—Prodexa connects every single heartbeat of your factory into one single source of truth. Let’s take a look inside.

---

## Scene 2: Executive Command Center & Role-Based Cockpit
* **Timecode:** `00:45 - 01:25` (40 seconds)  
* **Pacing:** Dynamic, high-energy overview  

### Visual Navigation & Screen Action
1. **[SCREEN]** Log in as Admin (`admin@inventorypro.com`) ➔ Route: `/dashboard`.
2. **[ACTION]** Smooth downward scroll over the executive dashboard widgets:
   - Total Active Inventory Valuation
   - Live Production Work Order Status (Planned, In-Progress, Completed)
   - Critical Low-Stock & Near-Expiry Alerts
   - Pending Multi-Level Approvals Queue
3. **[ZOOM / HIGHLIGHT]** Hover over the real-time stock velocity chart, then zoom into the Role-Based Access Control indicator in the top-right header.
4. **[LOWER-THIRD]** `Role-Based Cockpits • Instant Factory Visibility`

### Voiceover (VO) Script
> **[VO]**  
> Logging in as an executive, you’re greeted by the **Command Center**.  
>  
> At a single glance, plant leadership gets complete visibility over active inventory valuation, active work orders across assembly lines, pending purchase approvals, and mission-critical alerts like near-expiry batches.  
>  
> Prodexa features granular **Role-Based Access Control**. Whether you are a Sales Manager reviewing quotas, a Quality Inspector logging sample defects, a Shop-Floor Supervisor managing job cards, or a CFO managing liquidity—each user gets a purpose-built workspace with zero clutter and strict audit guardrails.

---

## Scene 3: Master Data Foundation – Products, Dual Pricing & Multi-Level BOM
* **Timecode:** `01:25 - 02:15` (50 seconds)  
* **Pacing:** Clear, instructional, highlighting depth  

### Visual Navigation & Screen Action
1. **[SCREEN]** Navigate to sidebar ➔ Click **Product Master** (`/dashboard/products`).
2. **[ACTION]** Click into product `Premium Roasted Almonds 500g` (SKU: `ALM-500G`).
3. **[ZOOM / HIGHLIGHT]**
   - Highlight **Dual Pricing Engine**: Purchase Price (`₹320.00`) vs. Standard Selling Price (`₹450.00`) and Minimum Selling Price (MSP).
   - Highlight Statutory Tax Fields: HSN code `200819`, GST Rate `12%`.
4. **[ACTION]** Click the **Bill of Materials (BOM)** tab.
5. **[ZOOM / HIGHLIGHT]** Expand the multi-level BOM explosion tree showing Raw Materials (RM), Packaging Materials (PM), and Routing Steps with estimated cycle times and machine allocations.
6. **[LOWER-THIRD]** `Smart Item Master • Dual Pricing • Multi-Level BOM Explosion`

### Voiceover (VO) Script
> **[VO]**  
> Every great manufacturing process starts with robust master data.  
>  
> Prodexa's **Product Master** goes beyond basic cataloging. Notice our intelligent **Dual Pricing Engine**—it automatically populates vendor procurement rates on purchase orders while locking standard selling prices and minimum price thresholds on commercial quotations.  
>  
> Full Indian statutory metadata—like 6-digit HSN codes and GST slabs—are baked directly into every SKU.  
>  
> Clicking into the **Bill of Materials**, Prodexa supports multi-level recursive BOMs with scrap allowances, sub-assembly routing steps, machine specifications, and target cycle times. When customer demand surges, your engineering definitions are already primed for flawless production.

---

## Scene 4: Sales Desk – Lead-to-Order with Intelligent FEFO Allocation
* **Timecode:** `02:15 - 03:15` (60 seconds)  
* **Pacing:** Fluid, highlighting smart automation  

### Visual Navigation & Screen Action
1. **[SCREEN]** Navigate to **Sales & CRM Desk** (`/dashboard/sales`).
2. **[ACTION]** 
   - Show an incoming Enquiry from `Apex Supermarket Retail Chain`.
   - Click `Convert to Quotation`. Show versioning (`Rev-01`).
   - Demonstrate the discount tier request modal—requesting a discount beyond the sales threshold immediately routes for Manager approval.
3. **[ACTION]** Advance status from `QUOTATION_SENT` ➔ `PO_RECEIVED` ➔ Click `Confirm as Sales Order`.
4. **[SCREEN]** Opens confirmed order `SO-2026-0089` in the **Order Desk** (`/dashboard/order-desk`).
5. **[ZOOM / HIGHLIGHT]** 
   - Highlight the customer's credit limit verification check.
   - Zoom in on the **FEFO Allocation Engine badge**: the system automatically scans active warehouse batches, identifies earliest-expiry batch `BAT-ALM-2610A`, and locks 100 packets into soft-reservation.
6. **[LOWER-THIRD]** `Automated FEFO Batch Reservation • Strict Credit Limit Governance`

### Voiceover (VO) Script
> **[VO]**  
> Let’s trace how revenue flows through Prodexa's **Order-to-Cash** engine.  
>  
> It starts at the **Sales Desk**. Incoming customer enquiries convert into versioned, auditable quotations in one click. If a sales representative offers an extraordinary commercial discount, Prodexa’s built-in **Approval Matrix** steps in—enforcing automated approval policies before the quote can be dispatched.  
>  
> Once the customer issues their PO, one click creates the confirmed **Sales Order**.  
>  
> Here is where Prodexa’s intelligence shines: the **FEFO Engine**—First Expiry, First Out—instantly scans your warehouse racks and reserves the earliest-expiring, QC-approved batches specifically for this order. No expired goods ever ship to customers, credit limits are validated in real time, and shortfall quantities are instantly flagged for planning.

---

## Scene 5: MRP Engine & Smart Production Planning
* **Timecode:** `03:15 - 04:05` (50 seconds)  
* **Pacing:** Strategic, data-driven  

### Visual Navigation & Screen Action
1. **[SCREEN]** Navigate to **MRP Planning Engine** (`/dashboard/mrp`).
2. **[ACTION]** 
   - Select `Sales-Order-Driven MRP` and pick order `SO-2026-0089`.
   - Click **Run MRP Calculation**.
3. **[ZOOM / HIGHLIGHT]** 
   - The calculation grid generates net requirements:
     - Gross Demand vs. Free Available Stock vs. Inward Pipeline.
   - Show split actions: Items tagged **PURCHASE** vs. Items tagged **WORK ORDER**.
4. **[ACTION]** Click `Generate Indents & Work Orders` button. Show toast notification confirming synchronized creation of Purchase Indents and Planned Work Orders.
5. **[LOWER-THIRD]** `MRP Engine • Gross-to-Net Explosion • Synchronized Indents & Work Orders`

### Voiceover (VO) Script
> **[VO]**  
> When demand exceeds on-hand stock, there’s no need to manually calculate spreadsheets. Enter the **Prodexa MRP Engine**.  
>  
> With a single click, you can execute a full plant-wide MRP run or run order-specific planning. The engine calculates gross demand, explodes all BOM levels, deducts free floor stock, accounts for existing open POs and WIP lots, and computes the exact **Net Requirement**.  
>  
> It then bifurcates the plan automatically: raw materials and packaging generate **Purchase Indents** for procurement, while finished and semi-finished items create scheduled **Work Orders** for the factory floor. Everything is linked, scheduled, and perfectly synchronized.

---

## Scene 6: Shop Floor Execution – WIP Routing, SFG Tracking & Machine OEE
* **Timecode:** `04:05 - 05:00` (55 seconds)  
* **Pacing:** Fast-paced, dynamic factory atmosphere  

### Visual Navigation & Screen Action
1. **[SCREEN]** Navigate to **Production Work Orders** (`/dashboard/production`).
2. **[ACTION]** Open Work Order `WO-2026-0042`.
3. **[ZOOM / HIGHLIGHT]**
   - Show the **Material Readiness Gate** (All BOM components reserved via MRN ➔ Start Production button unlocked).
   - Click `Print Job Card` to show the printable barcode-enabled job traveler.
4. **[SCREEN]** Navigate to **WIP Tracking Board** (`/dashboard/production/wip`).
5. **[ACTION]** 
   - Demonstrate dragging a job lot through routing stages: *Mixing ➔ Roasting ➔ Packaging*.
   - Click **Log Stage Output**: input 200 units, log 195 Good, 5 Scrap, record operator ID.
6. **[SCREEN]** Quick cut to **Machine OEE Dashboard** (`/dashboard/oee`).
7. **[ZOOM / HIGHLIGHT]** Point to the live Availability, Performance, and Quality gauges indicating world-class line efficiency.
8. **[LOWER-THIRD]** `WIP Shop-Floor Routing • Stage-wise SFG Control • Real-Time Machine OEE`

### Voiceover (VO) Script
> **[VO]**  
> On the production floor, discipline meets speed.  
>  
> Prodexa enforces a strict **Material Readiness Start Gate**. Supervisors cannot accidentally start a batch until all required materials are staged and cleared by an issued Material Requisition Note. Job cards with scannable barcodes keep operators focused on the floor.  
>  
> As batches advance along the line, the interactive **WIP Board** logs stage-wise output, scrap counts, and operator accountability. Semi-finished goods receive dedicated lot codes and quality clearance before advancing to parent assemblies.  
>  
> Meanwhile, plant managers monitor real-time **Machine OEE**, tracking line availability, operational speed, and quality ratios to eliminate bottlenecks before they become downtime.

---

## Scene 7: Supply Chain & Procure-to-Pay (P2P)
* **Timecode:** `05:00 - 05:55` (55 seconds)  
* **Pacing:** Thorough, demonstrating procurement compliance  

### Visual Navigation & Screen Action
1. **[SCREEN]** Navigate to **Procurement Desk** (`/dashboard/procurement`).
2. **[ACTION]** 
   - Consolidate MRP indents into a unified **RFQ (Request for Quotation)**.
   - Show the side-by-side **Vendor Comparison Matrix** (Comparing price, freight, GST, lead time, and payment terms).
   - Click `Award Supplier` ➔ Auto-generates **Purchase Order** (`/dashboard/purchase`).
3. **[SCREEN]** Navigate to **Goods Receipt Note (GRN)** (`/dashboard/grn`).
4. **[ACTION]** 
   - Log Inward Gate Entry (Supplier Challan number, Transporter vehicle number).
   - Inward goods automatically route into the **QUARANTINE** location.
5. **[ACTION]** Switch user role or open **Quality Inspection** modal:
   - Perform parameter sampling tests (Moisture %, Purity, Packaging Seal).
   - Click `Approve QC` ➔ Assign physical storage bin `Bay-A / Cold Storage Rack 2`.
6. **[LOWER-THIRD]** `RFQ Comparison Matrix • Quarantine Gate Entry • Inward QC Parameter Sampling`

### Voiceover (VO) Script
> **[VO]**  
> On the procurement side, Prodexa’s **Procure-to-Pay** workflow protects your margins and quality standards.  
>  
> Material indents consolidate into structured **RFQs**. Our visual comparison matrix empowers purchasing teams to evaluate vendor quotes across landed costs, lead times, and commercial terms before awarding the order.  
>  
> When supplier shipments arrive at your gate, the inward **GRN** captures vehicle details and immediately holds stock in a locked **Quarantine Store**.  
>  
> Nothing enters active inventory until your Quality Control team conducts parameter sampling tests. Passed stock is placed into designated storage bins; any defective lots trigger immediate Non-Conformance Reports with return-to-vendor documentation.

---

## Scene 8: Warehouse Intelligence, Batch Tracking & Storage Bins
* **Timecode:** `05:55 - 06:40` (45 seconds)  
* **Pacing:** Crisp, emphasizing control and zero waste  

### Visual Navigation & Screen Action
1. **[SCREEN]** Navigate to **Inventory & Warehouse** (`/dashboard/inventory`).
2. **[ACTION]**
   - Filter by Warehouse Locations: `Raw Material Store`, `Finished Goods`, `Cold Storage`.
   - Toggle the **Batch Expiry Heatmap**: show green, amber (approaching expiry), and red indicators.
3. **[ZOOM / HIGHLIGHT]** Click into batch `BAT-ALM-2610A` showing manufacturing date, expiry date, current bin location, and reserved vs. free balance.
4. **[ACTION]** Quick look at **Barcode & Thermal Label Generator** (`/dashboard/labels`).
5. **[ZOOM / HIGHLIGHT]** Preview GS1-128 compliant thermal labels with QR codes and human-readable serial data ready for 1-click printing.
6. **[LOWER-THIRD]** `Batch-Level Traceability • Expiry Heatmaps • GS1-128 Label Printing`

### Voiceover (VO) Script
> **[VO]**  
> For manufacturing operations, inventory blindness is fatal. Prodexa gives you surgical control.  
>  
> Every item is tracked by batch, manufacturing date, expiry date, and physical bin location. Our **Expiry Monitoring Engine** provides proactive early warnings on near-expiry items, helping you re-allocate stock well before shelf life deteriorates.  
>  
> Need physical floor identification? Prodexa includes a built-in **Thermal Label Generator**, producing GS1-128 and QR labels directly from the system for effortless pallet and carton scanning.

---

## Scene 9: Dispatch & Statutory GST Compliance (Rule 55 Challan to E-Invoice)
* **Timecode:** `06:40 - 07:15` (35 seconds)  
* **Pacing:** Confident, compliance-focused  

### Visual Navigation & Screen Action
1. **[SCREEN]** Navigate to **Dispatch Desk** (`/dashboard/dispatch`).
2. **[ACTION]** Select confirmed order `SO-2026-0089` ➔ Click `Generate Delivery Challan (Rule 55)`.
3. **[ZOOM / HIGHLIGHT]**
   - Input Transporter (`SafeXpress Logistics`), Vehicle No. (`MH-04-AB-1234`), LR No.
   - Show the generated **Triplicate Challan** (*Original for Consignee, Duplicate for Transporter, Triplicate for Consignor*). Commercial pricing is suppressed per statutory guidelines.
4. **[ACTION]** Click `Convert to Tax Invoice`.
5. **[SCREEN]** Invoice preview showing 6-digit HSN breakdown, taxable value, IGST/CGST/SGST tax calculation, and E-Invoice IRN / E-Way bill JSON integration placeholders.
6. **[LOWER-THIRD]** `Rule 55 Triplicate Delivery Challans • GST Tax Invoicing • NIC E-Invoice & E-Way Bill Ready`

### Voiceover (VO) Script
> **[VO]**  
> When goods are ready to leave the plant, Prodexa handles Indian statutory compliance effortlessly.  
>  
> The Dispatch Desk creates official **Rule 55 Delivery Challans** complete with vehicle numbers, transporter LR details, and statutory triplicate copies for consignee, transporter, and consignor.  
>  
> With one click, convert the dispatch into a full **GST Tax Invoice**—complete with automatic place-of-supply tax calculations, HSN summaries, and compliant schema exports ready for national E-Invoice IRN and E-Way bill generation.

---

## Scene 10: Finance, 3-Way Match & End-to-End Document Lineage
* **Timecode:** `07:15 - 07:35` (20 seconds)  
* **Pacing:** Authoritative, concluding the workflow  

### Visual Navigation & Screen Action
1. **[SCREEN]** Navigate to **Finance Desk** (`/dashboard/finance`).
2. **[ACTION]**
   - Demonstrate the automated **3-Way Match** on vendor bills (PO vs. GRN vs. Invoice).
   - Show Payment Release with mandatory Bank UTR tracking.
3. **[ZOOM / HIGHLIGHT]** Open any transaction and zoom into the **Document Lineage Bar**:
   `[Enquiry] ➔ [Quotation] ➔ [Sales Order] ➔ [Delivery Challan] ➔ [Tax Invoice] ➔ [Payment Receipt]`
   - Click across the nodes to demonstrate instant 1-click historical drawer inspection.
4. **[LOWER-THIRD]** `Automated 3-Way Match • Bank UTR Reconciliation • Complete Document Lineage`

### Voiceover (VO) Script
> **[VO]**  
> In the finance suite, your books stay audit-ready 24/7.  
>  
> Automated **3-Way Matching** prevents billing discrepancies between purchase orders, warehouse receipts, and vendor invoices. Bank payments require verified UTR entries, locking reconciliation.  
>  
> And best of all, every single transaction features our interactive **Document Lineage Bar**. In one click, auditors and managers can trace an invoice all the way back to the delivery challan, sales order, initial quote, and original enquiry. Total transparency, zero audit headaches.

---

## Scene 11: Summary & Outro Call to Action
* **Timecode:** `07:35 - 08:00` (25 seconds)  
* **Pacing:** Inspiring, decisive closing  

### Visual Navigation & Screen Action
1. **[SCREEN]** Cut back to a wide, polished panoramic shot of the executive dashboard and mobile/tablet responsive views.
2. **[ZOOM / HIGHLIGHT]** Four visual feature pillars animate onto the screen:
   - ⚡ *Zero Batch & Shelf-Life Leakage*
   - 🏭 *Real-Time Shop Floor & WIP Visibility*
   - 📜 *100% Statutory GST & E-Invoicing Compliance*
   - 📈 *End-to-End Audit & Financial Control*
3. **[ACTION]** Fade to closing title card with URL, contact email, and Demo Booking button:
   - **Website:** `www.prodexaerp.com`  
   - **Book a Live Demo:** `contact@prodexaerp.com`  
   - **Support Line:** `+91 (0) 800-PRODEXA`

### Voiceover (VO) Script
> **[VO]**  
> Prodexa ERP isn’t just software—it’s the operational backbone your factory needs to scale profitably, eliminate waste, and stay compliant at every turn.  
>  
> Experience the next generation of manufacturing intelligence.  
>  
> Visit **prodexaerp.com** today to schedule your personalized plant walkthrough and live demo. Transform your manufacturing with Prodexa ERP.

---

## 🎙️ Recording & Voiceover Actor Quick Reference

| Term | Pronunciation Guide | Context |
| :--- | :--- | :--- |
| **Prodexa** | `Pro-DEX-uh` | Brand Name |
| **FEFO** | `FEE-foh` (First Expiry, First Out) | Inventory Allocation Logic |
| **BOM** | `B-O-M` or `Bomb` | Bill of Materials |
| **MRP** | `M-R-P` | Material Requirements Planning |
| **OEE** | `O-E-E` | Overall Equipment Effectiveness |
| **GRN** | `G-R-N` | Goods Receipt Note |
| **WIP** | `Wip` | Work In Progress |
| **HSN** | `H-S-N` | Harmonized System of Nomenclature (Tax Code) |
| **IRN** | `I-R-N` | Invoice Reference Number (GST E-Invoice) |
| **UTR** | `U-T-R` | Unique Transaction Reference (Banking) |
| **SFG** | `S-F-G` | Semi-Finished Goods |
