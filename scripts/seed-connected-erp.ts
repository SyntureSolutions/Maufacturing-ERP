import 'dotenv/config';
import mongoose from 'mongoose';
import dns from 'node:dns';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

import dbConnect from '../lib/mongodb';
import User from '../models/User';
import CompanySettings from '../models/CompanySettings';
import Category from '../models/Category';
import Product from '../models/Product';
import Supplier from '../models/Supplier';
import Customer from '../models/Customer';
import Machine from '../models/Machine';
import BillOfMaterials from '../models/BillOfMaterials';
import Batch from '../models/Batch';
import Quotation from '../models/Quotation';
import SalesOrder from '../models/SalesOrder';
import WorkOrder from '../models/WorkOrder';
import JobWorkOrder from '../models/JobWorkOrder';
import PurchaseOrder from '../models/PurchaseOrder';
import GRN from '../models/GRN';
import DeliveryChallan from '../models/DeliveryChallan';
import Invoice from '../models/Invoice';
import GSTReturn from '../models/GSTReturn';

async function seedConnectedERP() {
  try {
    console.log('Connecting to MongoDB Atlas database...');
    await dbConnect();
    console.log('Connected successfully. Initializing complete connected ERP workflow dataset...');

    // 1. Company Profile
    await CompanySettings.findOneAndUpdate(
      { key: 'company' },
      {
        key: 'company',
        legalName: 'Prodexa Manufacturing Ltd',
        gstin: '27AABCP1234F1Z8',
        pan: 'AABCP1234F',
        address1: 'Plot 42, Chakan Industrial Estate, Phase 2',
        city: 'Pune',
        pincode: '410501',
        stateCode: '27',
        phone: '+91 20 6789 0000',
        email: 'info@prodexa.local',
        bank: {
          name: 'HDFC Bank Ltd',
          accountNo: '50200012345678',
          ifsc: 'HDFC0001234',
          branch: 'Chakan Industrial Branch'
        },
        invoiceTerms: 'Goods once sold will not be taken back. Interest @18% p.a. charged on delayed payments beyond 30 days.'
      },
      { upsert: true, new: true }
    );
    console.log('✓ Company Profile seeded.');

    // 2. Executive Users (Safe Upsert)
    const users = [
      { name: 'Super Admin User', email: 'admin@inventorypro.com', password: '123456789', role: 'ADMIN' },
      { name: 'Production Manager', email: 'production@inventorypro.com', password: '123456789', role: 'PRODUCTION_MANAGER' },
      { name: 'Quality Inspector', email: 'quality@inventorypro.com', password: '123456789', role: 'QUALITY_INSPECTOR' },
      { name: 'Finance Manager (CFO)', email: 'finance@inventorypro.com', password: '123456789', role: 'FINANCE_MANAGER' },
      { name: 'Supply Chain Manager', email: 'supplychain@inventorypro.com', password: '123456789', role: 'SUPPLY_CHAIN_MANAGER' },
      { name: 'HR & Labour Manager', email: 'hr@inventorypro.com', password: '123456789', role: 'HR_MANAGER' },
      { name: 'B2B Sales Manager', email: 'sales@inventorypro.com', password: '123456789', role: 'SALES' },
      { name: 'Operations Manager', email: 'manager@inventorypro.com', password: '123456789', role: 'MANAGER' },
      { name: 'Warehouse Staff', email: 'staff@inventorypro.com', password: '123456789', role: 'STAFF' },
      { name: 'Executive Viewer', email: 'viewer@inventorypro.com', password: '123456789', role: 'VIEWER' }
    ];
    for (const u of users) {
      await User.findOneAndUpdate({ email: u.email }, u, { upsert: true });
    }
    console.log('✓ Executive Role Users verified.');

    // 3. Categories
    const categories = [
      { name: 'Finished Bicycles', slug: 'finished-bicycles', description: 'Complete urban, mountain, road, and electric bicycles' },
      { name: 'Frames & Chassis', slug: 'frames-chassis', description: 'Alloy & carbon frames, forks and sub-assemblies' },
      { name: 'Drivetrains & Transmission', slug: 'drivetrains', description: 'Gears, chains, derailleurs, cranksets, and bottom brackets' },
      { name: 'Brakes & Steering', slug: 'brakes-steering', description: 'Hydraulic disc brakes, brake levers, and handlebars' },
      { name: 'Wheels & Tires', slug: 'wheels-tires', description: 'Rims, spokes, and all-terrain tires' },
      { name: 'Packaging & Crates', slug: 'packaging-crates', description: 'Protective packaging, cartons, and wooden shipping crates' }
    ];
    const catMap = new Map();
    for (const c of categories) {
      const doc = await Category.findOneAndUpdate({ name: c.name }, c, { upsert: true, new: true });
      catMap.set(c.name, doc._id);
    }
    console.log('✓ Categories seeded.');

    // 4. Item Master (Products)
    const productData = [
      {
        name: 'Apex Urban Commuter Bicycle',
        sku: 'BIK-URB-001',
        category: catMap.get('Finished Bicycles'),
        uom: 'unit',
        minStockLevel: 20,
        price: 18500,
        purchasePrice: 13200,
        productType: 'FINISHED_GOOD',
        hsnCode: '8712',
        gstRate: 18,
        description: 'Premium lightweight 21-speed urban commuter bicycle with aluminum alloy frame.'
      },
      {
        name: 'Velocity Trail Mountain Bike 29er',
        sku: 'BIK-MTB-002',
        category: catMap.get('Finished Bicycles'),
        uom: 'unit',
        minStockLevel: 15,
        price: 32000,
        purchasePrice: 22800,
        productType: 'FINISHED_GOOD',
        hsnCode: '8712',
        gstRate: 18,
        description: 'Hardtail all-terrain mountain bike with hydraulic disc brakes and lock-out fork.'
      },
      {
        name: 'Powder-Coated Stealth Frame (Sub-Assembly)',
        sku: 'SFG-FRM-PNT',
        category: catMap.get('Frames & Chassis'),
        uom: 'pcs',
        minStockLevel: 30,
        price: 6500,
        purchasePrice: 4850,
        productType: 'SEMI_FINISHED',
        hsnCode: '8714',
        gstRate: 18,
        description: 'Heat-baked matte black powder coated alloy frame ready for final assembly line.'
      },
      {
        name: 'High-Grade Alloy Frame T6',
        sku: 'RAW-FRM-001',
        category: catMap.get('Frames & Chassis'),
        uom: 'pcs',
        minStockLevel: 100,
        price: 4500,
        purchasePrice: 4200,
        productType: 'RAW_MATERIAL',
        hsnCode: '8714',
        gstRate: 18,
        description: 'Hydroformed 6061-T6 aluminum aircraft alloy unpainted frame.'
      },
      {
        name: 'Carbon Front Suspension Fork',
        sku: 'RAW-FRK-001',
        category: catMap.get('Frames & Chassis'),
        uom: 'pcs',
        minStockLevel: 80,
        price: 2500,
        purchasePrice: 2200,
        productType: 'RAW_MATERIAL',
        hsnCode: '8714',
        gstRate: 18,
        description: '100mm travel hydraulic lock-out front suspension fork.'
      },
      {
        name: 'Shimano Deore 11-Speed Drivetrain',
        sku: 'CMP-DRV-001',
        category: catMap.get('Drivetrains & Transmission'),
        uom: 'set',
        minStockLevel: 50,
        price: 8000,
        purchasePrice: 7200,
        productType: 'RAW_MATERIAL',
        hsnCode: '8714',
        gstRate: 18,
        description: 'Complete 11-speed drivetrain set including cassette, derailleur, and shifter.'
      },
      {
        name: 'Hydraulic Disc Brake Assembly',
        sku: 'CMP-BRK-001',
        category: catMap.get('Brakes & Steering'),
        uom: 'set',
        minStockLevel: 80,
        price: 3500,
        purchasePrice: 3100,
        productType: 'RAW_MATERIAL',
        hsnCode: '8714',
        gstRate: 18,
        description: 'Dual-piston mineral oil hydraulic disc brakes with 160mm rotors.'
      },
      {
        name: 'Maxxis All-Terrain Tire 29x2.25',
        sku: 'CMP-TIR-001',
        category: catMap.get('Wheels & Tires'),
        uom: 'pcs',
        minStockLevel: 200,
        price: 1200,
        purchasePrice: 950,
        productType: 'RAW_MATERIAL',
        hsnCode: '4011',
        gstRate: 18,
        description: 'High-traction puncture resistant mountain bike tire.'
      },
      {
        name: 'Heavy-Duty Wooden Shipping Crate',
        sku: 'PKG-CRT-001',
        category: catMap.get('Packaging & Crates'),
        uom: 'unit',
        minStockLevel: 100,
        price: 450,
        purchasePrice: 380,
        productType: 'PACKAGING',
        hsnCode: '4415',
        gstRate: 12,
        description: 'Reinforced pine-wood bicycle transit crate with foam inserts.'
      }
    ];

    const prodMap = new Map();
    for (const p of productData) {
      const doc = await Product.findOneAndUpdate({ sku: p.sku }, p, { upsert: true, new: true });
      prodMap.set(p.sku, doc);
    }
    console.log('✓ Item Master (Products) seeded.');

    // 5. Bill of Materials (BOM)
    const bomBike = await BillOfMaterials.findOneAndUpdate(
      { product: prodMap.get('BIK-URB-001')._id, version: 'v2.0' },
      {
        product: prodMap.get('BIK-URB-001')._id,
        version: 'v2.0',
        status: 'ACTIVE',
        isDefault: true,
        baseQuantity: 1,
        activatedBy: 'Seed',
        components: [
          { product: prodMap.get('RAW-FRM-001')._id, quantity: 1, unit: 'pcs', wastagePercentage: 2 },
          { product: prodMap.get('RAW-FRK-001')._id, quantity: 1, unit: 'pcs', wastagePercentage: 1 },
          { product: prodMap.get('CMP-DRV-001')._id, quantity: 1, unit: 'set', wastagePercentage: 0 },
          { product: prodMap.get('CMP-BRK-001')._id, quantity: 1, unit: 'set', wastagePercentage: 0 },
          { product: prodMap.get('CMP-TIR-001')._id, quantity: 2, unit: 'pcs', wastagePercentage: 1 },
          { product: prodMap.get('PKG-CRT-001')._id, quantity: 1, unit: 'unit', wastagePercentage: 0 }
        ],
        routingSteps: [
          { stepNumber: 1, description: 'Frame Tube Cutting & Hydroforming', machineType: 'CNC Saws', estimatedTimeMinutes: 25 },
          { stepNumber: 2, description: 'Robotic Welding & Alignment', machineType: 'Robot Welder A', estimatedTimeMinutes: 40 },
          { stepNumber: 3, description: 'Electrostatic Powder Coating (Subcontract)', machineType: 'Job Work', estimatedTimeMinutes: 45 },
          { stepNumber: 4, description: 'Drivetrain, Brakes & Final Assembly Line', machineType: 'Line Bay 1', estimatedTimeMinutes: 60 }
        ]
      },
      { upsert: true, new: true }
    );
    await Product.findByIdAndUpdate(prodMap.get('BIK-URB-001')._id, { bomId: bomBike._id });
    console.log('✓ Bill of Materials (BOM) linked.');

    // 6. Machines
    const machines = [
      { name: 'Assembly Line #1 (Frame & Wheel Fit)', code: 'ASM-01', type: 'Assembly Line', status: 'IN_USE', capacity: 15 },
      { name: 'Robot Welding Station A', code: 'WLD-01', type: 'Robotic Welder', status: 'AVAILABLE', capacity: 10 },
      { name: 'CNC Tube Cutting & Hydroforming', code: 'CNC-01', type: 'CNC Machining', status: 'AVAILABLE', capacity: 25 },
      { name: 'Final Dyno & Roll Test Rig', code: 'TST-01', type: 'Quality Test Rig', status: 'AVAILABLE', capacity: 20 }
    ];
    const machineMap = new Map();
    for (const m of machines) {
      const doc = await Machine.findOneAndUpdate({ code: m.code }, m, { upsert: true, new: true });
      machineMap.set(m.code, doc);
    }
    console.log('✓ Plant Machinery & Stations seeded.');

    // 7. Customers
    const customerDecathlon = await Customer.findOneAndUpdate(
      { code: 'CUST-001' },
      {
        name: 'Decathlon Retail India Pvt Ltd',
        code: 'CUST-001',
        gstin: '27AABCM9912E1Z5',
        pan: 'AABCM9912E',
        contactPerson: 'Aditya Deshmukh',
        email: 'procurement@decathlon.in',
        phone: '+91 98220 54321',
        billingAddress: 'Logistics Center, Chakan Phase 2',
        city: 'Pune',
        pincode: '410501',
        stateCode: '27',
        paymentTerms: 'NET 30 Days',
        creditLimit: 2500000,
        isActive: true
      },
      { upsert: true, new: true }
    );

    const customerMetro = await Customer.findOneAndUpdate(
      { code: 'CUST-002' },
      {
        name: 'Metro Wheels & Distributors',
        code: 'CUST-002',
        gstin: '24AABCM8821F1Z1',
        pan: 'AABCM8821F',
        contactPerson: 'Bhavin Patel',
        email: 'bhavin@metrowheels.com',
        phone: '+91 98980 12345',
        billingAddress: '45 GIDC Industrial Estate',
        city: 'Vadodara',
        pincode: '390010',
        stateCode: '24',
        paymentTerms: 'NET 45 Days',
        creditLimit: 1500000,
        isActive: true
      },
      { upsert: true, new: true }
    );
    console.log('✓ B2B Customers seeded.');

    // 8. Suppliers (Raw Material Suppliers + Subcontractors)
    const supApex = await Supplier.findOneAndUpdate(
      { code: 'SUP-AF-001' },
      {
        name: 'Apex Alloy Frames Ltd',
        code: 'SUP-AF-001',
        contactPerson: 'Vikram Malhotra',
        email: 'sales@apexalloy.com',
        phone: '+91 98765 11111',
        address: 'Auto Cluster, Chakan, Pune',
        gstin: '27AABCA4567F1Z3'
      },
      { upsert: true, new: true }
    );

    const supShimano = await Supplier.findOneAndUpdate(
      { code: 'SUP-SH-002' },
      {
        name: 'Shimano Component Imports India',
        code: 'SUP-SH-002',
        contactPerson: 'Kenji Sato',
        email: 'supply@shimano-import.in',
        phone: '+91 91234 22222',
        address: 'Trade Tower, BKC, Mumbai',
        gstin: '27AABCS7890D1Z2'
      },
      { upsert: true, new: true }
    );

    // This is our External Job Worker / Subcontractor!
    const supJobWorker = await Supplier.findOneAndUpdate(
      { code: 'SUP-JW-003' },
      {
        name: 'Zenith Surface Coating & Plating Works',
        code: 'SUP-JW-003',
        contactPerson: 'Sanjay Kulkarni',
        email: 'info@zenithcoatings.com',
        phone: '+91 98500 77777',
        address: 'Plot S-14, MIDC Bhosari Industrial Area, Pune',
        gstin: '27AAACZ8901D1Z9'
      },
      { upsert: true, new: true }
    );
    console.log('✓ Suppliers & Job Workers verified.');

    // 9. Quotation (Connected to Sales)
    const quote = await Quotation.findOneAndUpdate(
      { quoteNumber: 'QT-2026-0042' },
      {
        quoteNumber: 'QT-2026-0042',
        customer: customerDecathlon._id,
        customerName: customerDecathlon.name,
        enquiryRef: 'ENQ-2026-0019',
        items: [
          {
            product: prodMap.get('BIK-URB-001')._id,
            productName: prodMap.get('BIK-URB-001').name,
            quantity: 50,
            unitPrice: 18500,
            totalPrice: 925000
          }
        ],
        totalAmount: 1091500,
        stage: 'PO_RECEIVED',
        poNumber: 'DEC-PO-8821',
        paymentTerms: 'NET 30 Days',
        orderType: 'DOMESTIC',
        taxSummary: {
          subTotal: 925000,
          totalCGST: 83250,
          totalSGST: 83250,
          totalIGST: 0,
          grandTotal: 1091500
        }
      },
      { upsert: true, new: true }
    );
    console.log('✓ Quotation QT-2026-0042 seeded.');

    // 10. Sales Order (Connected to Quotation & Customer)
    const so = await SalesOrder.findOneAndUpdate(
      { soNumber: 'SO-2026-0099' },
      {
        soNumber: 'SO-2026-0099',
        customer: customerDecathlon._id,
        customerName: customerDecathlon.name,
        quotationRef: quote.quoteNumber,
        quotation: quote._id,
        poNumber: 'DEC-PO-8821',
        items: [
          {
            product: prodMap.get('BIK-URB-001')._id,
            quantity: 50,
            unitPrice: 18500,
            totalPrice: 925000,
            dispatchedQty: 30,
            invoicedQty: 30
          }
        ],
        taxes: [
          { taxType: 'CGST', amount: 83250 },
          { taxType: 'SGST', amount: 83250 }
        ],
        totalAmount: 1091500,
        paymentTerms: 'NET 30 Days',
        deliveryDate: new Date('2026-05-15'),
        status: 'IN_FULFILLMENT',
        taxInvoiceStatus: 'PARTIAL',
        taxInvoiceNumber: 'INV/2026-27/0412'
      },
      { upsert: true, new: true }
    );
    console.log('✓ Sales Order SO-2026-0099 seeded.');

    // 11. Production Work Orders (Connected to Sales Order & BOM)
    const wo1 = await WorkOrder.findOneAndUpdate(
      { woNumber: 'WO-2026-0001' },
      {
        woNumber: 'WO-2026-0001',
        product: prodMap.get('BIK-URB-001')._id,
        bom: bomBike._id,
        salesOrder: so._id,
        salesOrderRef: so.soNumber,
        quantity: 50,
        demandType: 'MTO',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        assignedMachine: machineMap.get('ASM-01')._id,
        plannedStartDate: new Date('2026-04-01'),
        plannedEndDate: new Date('2026-04-20'),
        qcStatus: 'PENDING',
        qcGatePassed: false,
        fgReceivedQty: 30,
        fgApprovedQty: 30,
        stages: [
          { seq: 1, name: 'Frame Tube Cutting & Hydroforming', inQty: 50, good: 50, scrap: 0, rework: 0 },
          { seq: 2, name: 'Robotic Welding & Alignment', inQty: 50, good: 50, scrap: 0, rework: 0 },
          { seq: 3, name: 'Electrostatic Powder Coating (Subcontract)', inQty: 50, good: 35, scrap: 0, rework: 0 },
          { seq: 4, name: 'Drivetrain & Final Assembly Line', inQty: 35, good: 30, scrap: 0, rework: 5 }
        ],
        stageLogs: [
          { seq: 1, stageName: 'Frame Tube Cutting', input: 50, good: 50, scrap: 0, rework: 0, operator: 'Mahesh K.', at: new Date('2026-04-03') },
          { seq: 2, stageName: 'Robotic Welding', input: 50, good: 50, scrap: 0, rework: 0, operator: 'Prakash R.', at: new Date('2026-04-06') },
          { seq: 3, stageName: 'Powder Coating (Subcontract)', input: 50, good: 35, scrap: 0, rework: 0, operator: 'Vendor Zenith', notes: '35 received on Challan JW-OUT-2026-0001, 15 remaining at vendor', at: new Date('2026-04-12') }
        ]
      },
      { upsert: true, new: true }
    );

    const wo2 = await WorkOrder.findOneAndUpdate(
      { woNumber: 'WO-2026-0002' },
      {
        woNumber: 'WO-2026-0002',
        product: prodMap.get('BIK-MTB-002')._id,
        quantity: 25,
        demandType: 'MTS',
        priority: 'MEDIUM',
        status: 'IN_PROGRESS',
        assignedMachine: machineMap.get('WLD-01')._id,
        plannedStartDate: new Date('2026-04-10'),
        plannedEndDate: new Date('2026-04-25'),
        stages: [
          { seq: 1, name: 'Tube Cutting & Bending', inQty: 25, good: 25, scrap: 0, rework: 0 },
          { seq: 2, name: 'Robotic MIG Welding', inQty: 25, good: 20, scrap: 2, rework: 3 },
          { seq: 3, name: 'Heat Treatment & Tempering', inQty: 20, good: 0, scrap: 0, rework: 0 },
          { seq: 4, name: 'Hydraulic Disc Brake Assembly', inQty: 0, good: 0, scrap: 0, rework: 0 }
        ]
      },
      { upsert: true, new: true }
    );
    console.log('✓ Connected Work Orders WO-2026-0001 & WO-2026-0002 seeded.');

    // 12. External Job Work Orders & ITC-04 Tracking!
    // Challan 1: Partial Outward Subcontracting
    const jw1 = await JobWorkOrder.findOneAndUpdate(
      { number: 'JW-OUT-2026-0001' },
      {
        kind: 'OUTWARD',
        number: 'JW-OUT-2026-0001',
        party: supJobWorker._id,
        partyName: supJobWorker.name,
        partyGstin: supJobWorker.gstin,
        date: new Date('2026-04-07'),
        goodsType: 'INPUT',
        natureOfJob: 'Electrostatic Powder Coating (Matt Stealth Black)',
        vehicleNo: 'MH-12-QW-5678',
        poNumber: 'PO-JW-2026-001',
        poIssuedAt: new Date('2026-04-07'),
        processingCharge: 350,
        poGstRate: 18,
        poTerms: 'Processing charges ₹350 per frame + 18% GST. Material remains property of Prodexa.',
        dueDate: new Date('2027-04-07'), // 1 Year statutory limit under Section 143
        outputProduct: prodMap.get('SFG-FRM-PNT')._id,
        expectedOutputQty: 50,
        outputReceivedQty: 35,
        status: 'PARTIAL',
        createdBy: 'Production Manager',
        items: [
          {
            product: prodMap.get('RAW-FRM-001')._id,
            description: 'High-Grade Alloy Frame T6 (Unpainted)',
            hsnCode: '8714',
            quantity: 50,
            uom: 'pcs',
            value: 210000,
            consumed: 35,
            returned: 0,
            scrap: 0
          }
        ],
        receipts: [
          {
            challanNo: 'ZEN-RET-1042',
            at: new Date('2026-04-12'),
            outputQty: 35,
            note: '35 powder-coated frames received in prime quality. 15 frames still undergoing curing.',
            items: [{ index: 0, consumed: 35, returned: 0, scrap: 0 }]
          }
        ]
      },
      { upsert: true, new: true }
    );

    // Challan 2: Open Outward Subcontracting
    const jw2 = await JobWorkOrder.findOneAndUpdate(
      { number: 'JW-OUT-2026-0002' },
      {
        kind: 'OUTWARD',
        number: 'JW-OUT-2026-0002',
        party: supJobWorker._id,
        partyName: supJobWorker.name,
        partyGstin: supJobWorker.gstin,
        date: new Date('2026-04-15'),
        goodsType: 'INPUT',
        natureOfJob: 'Hard Anodizing & Laser Etching on Suspension Forks',
        vehicleNo: 'MH-12-TR-9001',
        poNumber: 'PO-JW-2026-002',
        poIssuedAt: new Date('2026-04-15'),
        processingCharge: 220,
        poGstRate: 18,
        dueDate: new Date('2027-04-15'),
        outputReceivedQty: 0,
        status: 'OPEN',
        createdBy: 'Production Manager',
        items: [
          {
            product: prodMap.get('RAW-FRK-001')._id,
            description: 'Carbon Front Suspension Fork',
            hsnCode: '8714',
            quantity: 25,
            uom: 'pcs',
            value: 55000,
            consumed: 0,
            returned: 0,
            scrap: 0
          }
        ]
      },
      { upsert: true, new: true }
    );
    console.log('✓ External Job Work & ITC-04 Outward Challans JW-OUT-2026-0001 & 0002 seeded.');

    // 13. Delivery Challan (Connected to Sales Order SO-2026-0099)
    const dc = await DeliveryChallan.findOneAndUpdate(
      { number: 'DC-2026-0045' },
      {
        number: 'DC-2026-0045',
        salesOrder: so._id,
        soNumber: so.soNumber,
        customer: customerDecathlon._id,
        customerName: customerDecathlon.name,
        date: new Date('2026-04-16'),
        reason: 'SUPPLY',
        placeOfSupply: '27-Maharashtra',
        transporterName: 'Blue Dart Logistics Express',
        vehicleNo: 'MH-14-GH-9988',
        lrNo: 'LR-BLU-90218',
        status: 'INVOICED',
        totalTaxable: 555000,
        invoiceNumber: 'INV/2026-27/0412',
        items: [
          {
            product: prodMap.get('BIK-URB-001')._id,
            description: 'Apex Urban Commuter Bicycle (Finished Assembly)',
            hsnCode: '8712',
            quantity: 30,
            unitPrice: 18500,
            taxableValue: 555000
          }
        ]
      },
      { upsert: true, new: true }
    );
    console.log('✓ Delivery Challan DC-2026-0045 seeded.');

    // 14. Official GST Tax Invoice (Connected to SO-2026-0099 & DC-2026-0045)
    const inv = await Invoice.findOneAndUpdate(
      { invoiceNumber: 'INV/2026-27/0412' },
      {
        invoiceNumber: 'INV/2026-27/0412',
        type: 'SALES',
        customer: customerDecathlon._id,
        salesOrder: so._id,
        soNumber: so.soNumber,
        deliveryChallan: dc._id,
        dcRef: dc.number,
        quotationRef: quote.quoteNumber,
        date: new Date('2026-04-16'),
        dueDate: new Date('2026-05-16'),
        placeOfSupply: '27-Maharashtra',
        reverseCharge: false,
        items: [
          {
            product: prodMap.get('BIK-URB-001')._id,
            description: 'Apex Urban Commuter Bicycle',
            hsnCode: '8712',
            quantity: 30,
            unitPrice: 18500,
            taxableValue: 555000,
            cgstRate: 9,
            cgstAmount: 49950,
            sgstRate: 9,
            sgstAmount: 49950,
            totalAmount: 654900
          }
        ],
        subTotal: 555000,
        totalCGST: 49950,
        totalSGST: 49950,
        totalIGST: 0,
        totalAmount: 654900,
        amountPaid: 0,
        status: 'ISSUED',
        irn: '4c9d7a2e8f1b6c3d5e7a9b0c2d4e6f8a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d9e',
        ackNo: '112610982345',
        ackDate: new Date('2026-04-16'),
        ewayBillNumber: '241098765432',
        einvoiceStatus: 'REGISTERED'
      },
      { upsert: true, new: true }
    );
    console.log('✓ Statutory GST Tax Invoice INV/2026-27/0412 seeded.');

    // 15. Purchase Orders & GRN
    const po = await PurchaseOrder.findOneAndUpdate(
      { poNumber: 'PO-20260401-001' },
      {
        poNumber: 'PO-20260401-001',
        supplier: supApex._id,
        status: 'RECEIVED',
        totalAmount: 420000,
        orderDate: new Date('2026-04-01'),
        receivedDate: new Date('2026-04-05'),
        items: [
          {
            product: prodMap.get('RAW-FRM-001')._id,
            quantity: 100,
            unitPrice: 4200,
            totalPrice: 420000
          }
        ]
      },
      { upsert: true, new: true }
    );

    const grn = await GRN.findOneAndUpdate(
      { number: 'GRN-2026-0012' },
      {
        number: 'GRN-2026-0012',
        po: po._id,
        poNumber: po.poNumber,
        supplier: supApex._id,
        gateEntryNo: 'GATE-2026-088',
        vendorChallanNo: 'APEX-DC-551',
        vehicleNo: 'MH-12-AX-3344',
        checklist: { quantityVerified: true, packingIntact: true, documentsVerified: true },
        status: 'PUT_AWAY',
        inspectedBy: 'Quality Inspector',
        inspectedAt: new Date('2026-04-05'),
        items: [
          {
            product: prodMap.get('RAW-FRM-001')._id,
            orderedQty: 100,
            receivedQty: 100,
            unitPrice: 4200,
            acceptedQty: 100,
            scrapQty: 0,
            returnQty: 0,
            inspection: 'ACCEPTED',
            expiryDate: new Date('2028-04-01'),
            tests: [
              { name: 'Tensile Strength ASTM B221', standard: '> 310 MPa', actual: '325 MPa', result: 'PASS' },
              { name: 'Dimensional Tolerances', standard: '± 0.2mm', actual: '+0.05mm', result: 'PASS' }
            ],
            putAway: { warehouse: 'W1', zone: 'Raw Stores', rack: 'A-01', bin: 'B1', at: new Date('2026-04-05') }
          }
        ]
      },
      { upsert: true, new: true }
    );
    console.log('✓ Inward PO & GRN-2026-0012 verified.');

    // 16. Warehouse Stock Batches
    await Batch.findOneAndUpdate(
      { batchNumber: 'BN-FRM-2026-01' },
      {
        product: prodMap.get('RAW-FRM-001')._id,
        batchNumber: 'BN-FRM-2026-01',
        initialQuantity: 100,
        currentQuantity: 50, // 50 sent for powder coating!
        allocatedQuantity: 0,
        purchasePrice: 4200,
        po: po._id,
        location: 'Rack A-01 (Raw Stores)',
        expiryDate: new Date('2028-04-01')
      },
      { upsert: true }
    );

    await Batch.findOneAndUpdate(
      { batchNumber: 'BN-BIK-2026-01' },
      {
        product: prodMap.get('BIK-URB-001')._id,
        batchNumber: 'BN-BIK-2026-01',
        initialQuantity: 30,
        currentQuantity: 30,
        allocatedQuantity: 30,
        purchasePrice: 13200,
        location: 'FG Warehouse Bay 4',
        expiryDate: new Date('2030-01-01')
      },
      { upsert: true }
    );
    console.log('✓ Warehouse Inventory Batches reconciled.');

    console.log('\n======================================================');
    console.log('🎉 COMPLETE CONNECTED ERP WORKFLOW DATASET SEEDED!');
    console.log('Enquiry/Quote -> Sales Order -> Work Order -> Job Work Outward -> Delivery Challan -> Tax Invoice');
    console.log('======================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('Seed Error:', error);
    process.exit(1);
  }
}

seedConnectedERP();
