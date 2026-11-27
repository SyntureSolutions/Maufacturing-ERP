# 🏗️ Modules and Features – Inventory Management System

This document outlines the core modules and their features for the Inventry Pro Foods Inventory Management System, based on the Software Requirements Specification (SRS) and System Flow documents.

---

## 1. 🔐 User Authentication & Role Management
This module ensures secure access and defines what each user can see and do within the system.

*   **Secure Authentication:** Login and logout functionality with encrypted passwords.
*   **Role-Based Access Control (RBAC):**
    *   **Admin:** Full system access, user management, and configuration.
    *   **Warehouse Manager:** Manage inventory, batches, and warehouse operations.
    *   **Warehouse Staff:** Perform pick, pack, and record damages.
    *   **Sales / Order Manager:** Create and track customer orders.
    *   **Viewer:** Read-only access to reports and dashboards.
*   **User Management:** Add, update, or deactivate system users.

---

## 2. 📦 Product Management
The foundation of the system where products and their classifications are defined.

*   **Product Catalog (CRUD):** Create, view, update, and delete products.
*   **Category Management:** Organize products into hierarchical categories.
*   **Unit of Measure (UOM):** Define units (e.g., kg, pieces, boxes) for each product.
*   **Barcode/SKU Tracking:** Assign unique identifiers to products for easy identification.

---

## 3. 🧪 Batch Management
Crucial for food inventory to track freshness and ensure quality.

*   **Batch Creation:** Automatically or manually create batches during the goods receipt process.
*   **Date Tracking:** Store manufacturing and expiry dates for every batch.
*   **Batch-wise Quantity:** Track exactly how much stock belongs to which batch.
*   **Expiry Monitoring:** Identify batches that are near expiry or already expired.

---

## 4. 🏬 Inventory Management
Provides a real-time view of all stock held in the warehouse.

*   **Real-time Stock Levels:** Instant visibility of total and batch-wise stock.
*   **Inventory Logs (Audit Trail):** Every stock movement (In, Out, Adjust) is logged for accountability.
*   **Stock Availability:** View "Available" vs "Allocated" stock levels.

---

## 5. 🛒 Purchase Management
Handles the procurement process from suppliers to the warehouse.

*   **Supplier Management:** Maintain a database of vendors and contact information.
*   **Purchase Orders (PO):** Create, approve, and track orders sent to suppliers.
*   **Goods Receipt Note (GRN):** Record incoming stock against a PO.
*   **Auto-Batching:** Generate batches and update inventory immediately upon GRN completion.

---

## 6. 📑 Order & Sales Management
Manages customer demands and initiates the fulfillment process.

*   **Order Creation:** Capture customer details and requested products.
*   **FEFO Allocation (First Expiry First Out):** Automatically allocate stock from the batch with the earliest expiry date.
*   **Order Tracking:** Monitor order status from "Pending" to "Delivered."
*   **Constraint Checking:** Prevent orders if stock is insufficient or batches are expired.

---

## 7. 🚛 Warehouse Operations (Pick & Pack)
Streamlines the physical handling of goods within the warehouse.

*   **Pick List Generation:** Create a guide for staff to locate and retrieve specific batches for an order.
*   **Packing Confirmation:** Verify that the correct items and quantities have been packed.
*   **Dispatch Management:** Mark orders as ready for shipment and record shipping details.
*   **Inventory Sync:** Deduct stock from the system only when items are dispatched.

---

## 8. ⚠️ Stock Adjustment & Quality Control
Handles exceptions like damage, loss, or manual corrections.

*   **Damage Recording:** Log items that are broken or unfit for sale.
*   **Expiry Handling:** Specifically track and isolate expired stock to prevent sale.
*   **Manual Correction:** Adjust stock levels for discrepancies found during physical counts.
*   **Reason Tracking:** Mandatory reason codes for all manual adjustments.

---

## 9. 📊 Reporting & Analytics
Provides data-driven insights for better decision-making.

*   **Inventory Status Reports:** Current stock valuation and levels.
*   **Expiry Risk Reports:** Identify stock that needs to be sold urgently.
*   **Operations Performance:** Reports on purchase history and sales volume.
*   **Data Export:** Download reports in CSV or Excel format.

---

## 10. 🔔 Alerts & Notifications
Proactive system alerts to prevent operational bottlenecks.

*   **Low Stock Alerts:** Notify managers when items drop below a defined threshold.
*   **Near-Expiry Alerts:** Advanced warning for batches approaching their expiry date.
*   **Process Alerts:** Notifications for new orders, pending GRNs, or failed allocations.

---
