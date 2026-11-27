# 🔄 System Flow Document

## 🏭 Inventory Management System – Inventry Pro Foods

---

# 1. 📌 Overview

This document defines the **end-to-end flow of the system**, covering:

* Purchase → Inventory → Order lifecycle
* Warehouse operations
* Stock adjustments

---

# 2. 🧠 High-Level Flow

```id="flow1"
Supplier → Purchase Order → GRN → Batch Creation → Inventory

Customer Order → Batch Allocation (FEFO) → Pick → Pack → Dispatch

Damage/Expiry → Stock Adjustment → Inventory Update
```

---

# 3. 📦 PRODUCT SETUP FLOW

```id="flow2"
Admin → Create Category → Create Product → Define Unit → Save Product
```

### Outcome:

* Product is ready for batch creation and inventory

---

# 4. 🧪 BATCH CREATION FLOW

## Triggered by: GRN (Stock In)

```id="flow3"
Purchase Order → Receive Goods → Create GRN → Create Batch → Assign Expiry → Add Quantity → Update Inventory
```

### Key Points:

* Each GRN creates **one or multiple batches**
* Batch must include:

  * Expiry date
  * Quantity
  * Product reference

---

# 5. 🏬 INVENTORY FLOW

```id="flow4"
Batch Created → Inventory Updated → Stock Available for Orders
```

### Rules:

* Inventory is always **batch-linked**
* Every update must create a **log entry**

---

# 6. 📑 PURCHASE FLOW

```id="flow5"
Admin/Manager → Create PO → Send to Supplier → Receive Goods → GRN → Batch Creation → Inventory Update
```

### Status Flow:

* Draft → Approved → Received → Completed

---

# 7. 🚚 ORDER FLOW (CRITICAL)

```id="flow6"
Sales → Create Order → Check Inventory → Allocate Batches (FEFO) → Confirm Order
```

---

## 🔥 FEFO ALLOCATION LOGIC

```id="flow7"
Sort Batches by Expiry Date (Ascending)
↓
Pick from earliest expiry
↓
Reduce batch quantity
↓
Continue until order fulfilled
```

---

# 8. 📦 PICK & PACK FLOW

```id="flow8"
Order Confirmed → Generate Pick List → Staff Picks Items → Pack Items → Mark as Packed
```

### Outcome:

* Items ready for dispatch

---

# 9. 🚛 DISPATCH FLOW

```id="flow9"
Packed Order → Dispatch → Reduce Inventory → Update Order Status
```

### Status:

* Packed → Dispatched → Completed

---

# 10. ⚠️ DAMAGE & EXPIRY FLOW

```id="flow10"
Identify Damaged/Expired Stock → Mark in System → Reduce Inventory → Log Entry
```

### Important:

* Cannot be used in orders
* Must be tracked separately

---

# 11. 🔄 STOCK ADJUSTMENT FLOW

```id="flow11"
Admin → Adjust Stock → Enter Reason → Update Inventory → Create Log
```

---

# 12. 📊 REPORTING FLOW

```id="flow12"
System Data → Aggregate → Generate Reports → Export (CSV/Excel)
```

---

# 13. 🔐 ROLE-BASED FLOW CONTROL

## Access Mapping:

* Admin → Full access
* Manager → Inventory + Purchase
* Staff → Pick/Pack + Damage
* Sales → Orders
* Viewer → Reports only

---

# 14. 🔁 SYSTEM DATA FLOW (IMPORTANT)

```id="flow13"
UI (Dashboard)
   ↓
API Route (/api/*)
   ↓
Service Layer
   ↓
Database (MongoDB)
   ↓
Response → UI
```

---

# 15. ⚙️ ERROR & EDGE CASE FLOW

## Case 1: Insufficient Stock

```id="flow14"
Order → Check Inventory → Not Enough → Show Error → Stop Order
```

---

## Case 2: Expired Batch

```id="flow15"
Batch Expired → Block Usage → Mark Expired → Remove from Allocation
```

---

## Case 3: Partial Allocation

```id="flow16"
Order Quantity > Single Batch → Allocate Multiple Batches → Complete Order
```

---

# 16. 🚀 DEVELOPMENT FLOW (WHAT TO BUILD FIRST)

## Phase 1 – Foundation

```id="flow17"
Auth → Roles → Product → Category
```

---

## Phase 2 – Core Inventory

```id="flow18"
Batch → Inventory → Logs
```

---

## Phase 3 – Purchase System

```id="flow19"
Supplier → PO → GRN → Batch Creation
```

---

## Phase 4 – Order System

```id="flow20"
Order → FEFO → Allocation → Pick & Pack → Dispatch
```

---

## Phase 5 – Advanced Features

```id="flow21"
Damage → Expiry → Adjustments → Reports
```

---

# 17. 🧠 KEY SYSTEM RULES

* Every stock movement must update inventory
* Every update must create a log
* Orders must use FEFO
* Expired stock cannot be used
* Batch tracking is mandatory

---

# ✅ FINAL UNDERSTANDING

This system is a **flow-driven system**, not just CRUD.

👉 Core backbone:

* Batch management
* Inventory consistency
* Order allocation logic

If flows are correct:
✅ System works smoothly
❌ If broken → entire system fails

---
