# 📄 Software Requirements Specification (SRS)

## 🏭 Inventory Management System – Inventry Pro Foods

---

# 1. 📌 Introduction

## 1.1 Purpose

This document defines the requirements for developing an **Inventory Management System** for Inventry Pro Foods.

The system aims to:

* Efficiently manage stock and inventory
* Track batch-wise products with expiry dates
* Handle purchase and order workflows
* Improve warehouse operations and reduce losses

---

## 1.2 Scope

The system will:

* Manage product lifecycle (creation → storage → dispatch)
* Track inventory at batch level
* Support warehouse operations (GRN, Pick & Pack)
* Provide reporting and alerts

---

## 1.3 Definitions

* **Batch:** Group of products with same manufacturing & expiry date
* **GRN (Goods Receipt Note):** Record of received stock
* **FEFO:** First Expiry First Out (dispatch logic)

---

# 2. 🎯 Overall Description

## 2.1 Product Perspective

This is a **web-based system** accessible via browser, designed for internal business operations.

---

## 2.2 User Roles

### 1. Admin

* Full system access
* Manages users, products, and reports

### 2. Warehouse Manager

* Manages inventory and warehouse operations

### 3. Warehouse Staff

* Executes pick, pack, and stock updates

### 4. Sales / Order Manager

* Handles order creation and tracking

### 5. Viewer (Optional)

* Read-only access to reports and data

---

## 2.3 Operating Environment

* Web browser (Chrome, Edge, etc.)
* Server: Next.js application
* Database: MongoDB

---

# 3. 🧩 Functional Requirements

---

## 3.1 Product Management

* Create, update, delete products
* Manage product categories
* Define units and barcode

---

## 3.2 Batch Management

* Create and manage batches
* Store manufacturing and expiry dates
* Track batch-wise quantity
* Provide expiry alerts

---

## 3.3 Inventory Management

* Maintain real-time stock levels
* Track stock per batch
* Maintain inventory logs

---

## 3.4 Purchase Management

* Create Purchase Orders (PO)
* Manage suppliers
* Record GRN (stock entry)
* Auto-create batches during GRN

---

## 3.5 Order Management

* Create and manage orders
* Allocate inventory based on FEFO
* Track order status
* Support dispatch workflow

---

## 3.6 Pick & Pack Operations

* Generate pick list
* Confirm packing
* Update stock after dispatch

---

## 3.7 Damage & Expiry Handling

* Record damaged items
* Track expired stock
* Automatically adjust inventory

---

## 3.8 Stock Adjustment

* Manual stock correction
* Maintain audit logs for adjustments

---

## 3.9 Reporting

* Inventory reports
* Expiry reports
* Purchase and order reports
* Export data (CSV/Excel)

---

## 3.10 Alerts & Notifications

* Low stock alerts
* Expiry alerts
* Order-related notifications

---

# 4. 🔐 Non-Functional Requirements

## 4.1 Performance

* System should handle large inventory datasets efficiently
* Fast load times for dashboards and reports

---

## 4.2 Security

* Role-based access control
* Secure authentication
* Data protection

---

## 4.3 Scalability

* Support future expansion (multi-warehouse)
* Handle increasing data volume

---

## 4.4 Usability

* Simple and intuitive UI
* Minimal training required for staff

---

## 4.5 Reliability

* Accurate inventory tracking
* No data inconsistency

---

# 5. 🔁 System Workflow Overview

## 5.1 Purchase Flow

Purchase Order → GRN → Batch Creation → Inventory Update

---

## 5.2 Order Flow

Order Creation → Batch Allocation (FEFO) → Pick → Pack → Dispatch

---

## 5.3 Inventory Adjustment Flow

Damage/Expiry → Stock Adjustment → Inventory Update → Log Entry

---

# 6. ⚙️ Key Business Rules

* FEFO must be strictly followed
* Every stock movement must be logged
* Batch tracking is mandatory
* Inventory must always remain consistent

---

# 7. 🚀 Future Enhancements (Optional)

* Barcode scanning integration
* Mobile application for warehouse staff
* Multi-warehouse support
* Integration with accounting systems (Tally, Zoho)

---

# 8. 📊 Success Criteria

* Reduced stock wastage due to expiry
* Improved warehouse efficiency
* Accurate real-time inventory visibility
* Faster order processing

---

# ✅ Conclusion

This system will act as a **centralized inventory and operations platform**, enabling Inventry Pro Foods to streamline stock management, reduce losses, and improve operational efficiency.

---
