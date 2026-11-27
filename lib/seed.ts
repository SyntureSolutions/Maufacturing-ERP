import 'dotenv/config';
import mongoose from 'mongoose';
import dns from 'node:dns';

// Bypass local DNS blocking for MongoDB Atlas
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env');
}

// Import models
import dbConnect from './mongodb';
import User from '../models/User';
import Category from '../models/Category';
import Product from '../models/Product';
import Supplier from '../models/Supplier';
import PurchaseOrder from '../models/PurchaseOrder';
import Batch from '../models/Batch';
import Order from '../models/Order';
import GSTReturn from '../models/GSTReturn';
import QualityCheck from '../models/QualityCheck';

async function seed() {
  try {
    console.log('Connecting to MongoDB Atlas cluster0.4xbx0uu.mongodb.net...');
    await dbConnect();
    console.log('Connected successfully to MongoDB Atlas database "manufacturing-erp".');

    // 1. Clear existing data
    console.log('Clearing existing collections in MongoDB Atlas...');
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      Product.deleteMany({}),
      Supplier.deleteMany({}),
      PurchaseOrder.deleteMany({}),
      Batch.deleteMany({}),
      Order.deleteMany({}),
      GSTReturn.deleteMany({}),
      QualityCheck.deleteMany({})
    ]);
    console.log('Collections cleared.');

    // 2. Create 7 Executive Role Users
    console.log('Seeding 7 Executive Role Users into MongoDB Atlas...');
    const users = await Promise.all([
      User.create({ name: 'Super Admin User', email: 'admin@inventorypro.com', password: '123456789', role: 'ADMIN' }),
      User.create({ name: 'Production Manager', email: 'production@inventorypro.com', password: '123456789', role: 'PRODUCTION_MANAGER' }),
      User.create({ name: 'Quality Inspector', email: 'quality@inventorypro.com', password: '123456789', role: 'QUALITY_INSPECTOR' }),
      User.create({ name: 'Finance Manager (CFO)', email: 'finance@inventorypro.com', password: '123456789', role: 'FINANCE_MANAGER' }),
      User.create({ name: 'Supply Chain Manager', email: 'supplychain@inventorypro.com', password: '123456789', role: 'SUPPLY_CHAIN_MANAGER' }),
      User.create({ name: 'HR & Labour Manager', email: 'hr@inventorypro.com', password: '123456789', role: 'HR_MANAGER' }),
      User.create({ name: 'B2B Sales Manager', email: 'sales@inventorypro.com', password: '123456789', role: 'SALES' }),
      User.create({ name: 'Operations Manager', email: 'manager@inventorypro.com', password: '123456789', role: 'MANAGER' }),
      User.create({ name: 'Warehouse Staff', email: 'staff@inventorypro.com', password: '123456789', role: 'STAFF' }),
      User.create({ name: 'Executive Viewer', email: 'viewer@inventorypro.com', password: '123456789', role: 'VIEWER' })
    ]);

    // 3. Create Categories
    console.log('Seeding Categories...');
    const [bikes, frames, drivetrains, brakes, wheels, packaging] = await Promise.all([
      Category.create({ name: 'Finished Bicycles', slug: 'finished-bicycles', description: 'Complete urban, mountain, road and electric bikes' }),
      Category.create({ name: 'Frames & Chassis', slug: 'frames-chassis', description: 'Aluminum alloy, carbon fiber frames & forks' }),
      Category.create({ name: 'Drivetrains & Transmission', slug: 'drivetrains', description: 'Gears, chains, derailleurs, cranksets, and pedals' }),
      Category.create({ name: 'Brakes & Steering', slug: 'brakes-steering', description: 'Hydraulic disc brakes, brake levers, handlebars & cables' }),
      Category.create({ name: 'Wheels & Tires', slug: 'wheels-tires', description: 'Alloy rims, spokes, inner tubes, and all-terrain tires' }),
      Category.create({ name: 'Packaging & Crates', slug: 'packaging-crates', description: 'Wooden crates, protective foam, and bulk shipping boxes' })
    ]);

    // 4. Create Suppliers
    console.log('Seeding Suppliers...');
    const [supApex, supShimano, supMaxxis, supPrecision, supPack] = await Promise.all([
      Supplier.create({ name: 'Apex Alloy Frames Ltd.', code: 'SUP-AF-001', contactPerson: 'Vikram Malhotra', email: 'sales@apexalloy.com', phone: '+91 98765 11111', address: 'Auto Cluster, Chakan, Pune' }),
      Supplier.create({ name: 'Shimano Component Imports', code: 'SUP-SH-002', contactPerson: 'Kenji Sato', email: 'supply@shimano-import.in', phone: '+91 91234 22222', address: 'Trade Tower, BKC, Mumbai' }),
      Supplier.create({ name: 'Maxxis Rubber Tech India', code: 'SUP-MX-003', contactPerson: 'Rajesh Sharma', email: 'orders@maxxisrubber.com', phone: '+91 90000 33333', address: 'Industrial Estate, Chennai' }),
      Supplier.create({ name: 'Precision Brake Dynamics', code: 'SUP-PB-004', contactPerson: 'Anita Roy', email: 'anita@precisionbrakes.com', phone: '+91 98888 44444', address: 'GIDC Phase 2, Vadodara' }),
      Supplier.create({ name: 'Industrial Wooden Crates Co.', code: 'SUP-PK-005', contactPerson: 'Sunil Verma', email: 'contact@indpack.com', phone: '+91 97777 55555', address: 'Packaging Hub, Ludhiana' })
    ]);

    // 5. Create Products
    console.log('Seeding Products...');
    const products = await Promise.all([
      Product.create({ name: 'Apex Urban Commuter Bicycle', sku: 'BIK-URB-001', category: bikes._id, uom: 'unit', minStockLevel: 20 }),
      Product.create({ name: 'Velocity Trail Mountain Bike 29er', sku: 'BIK-MTB-002', category: bikes._id, uom: 'unit', minStockLevel: 15 }),
      Product.create({ name: 'AeroPro Carbon Road Bike', sku: 'BIK-ROD-003', category: bikes._id, uom: 'unit', minStockLevel: 10 }),
      Product.create({ name: 'E-Glide Electric Hybrid Bike 250W', sku: 'BIK-ELE-004', category: bikes._id, uom: 'unit', minStockLevel: 10 }),
      
      Product.create({ name: 'High-Grade Alloy Frame T6', sku: 'RAW-FRM-001', category: frames._id, uom: 'pcs', minStockLevel: 100 }),
      Product.create({ name: 'Carbon Front Suspension Fork', sku: 'RAW-FRK-001', category: frames._id, uom: 'pcs', minStockLevel: 80 }),
      
      Product.create({ name: 'Shimano Deore 11-Speed Drivetrain', sku: 'CMP-DRV-001', category: drivetrains._id, uom: 'set', minStockLevel: 50 }),
      Product.create({ name: 'Hydraulic Disc Brake Assembly', sku: 'CMP-BRK-001', category: brakes._id, uom: 'set', minStockLevel: 80 }),
      Product.create({ name: 'Maxxis All-Terrain Tire 29x2.25', sku: 'CMP-TIR-001', category: wheels._id, uom: 'pcs', minStockLevel: 200 }),
      Product.create({ name: 'Heavy-Duty Wooden Crate', sku: 'PKG-CRT-001', category: packaging._id, uom: 'unit', minStockLevel: 100 })
    ]);

    // Helpers
    const getProd = (sku: string) => products.find(p => p.sku === sku)!;
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    // 6. Create Purchase Orders & Batches
    console.log('Seeding Purchase Orders and Batches...');
    
    const po1 = await PurchaseOrder.create({
      poNumber: 'PO-20251001-001', supplier: supApex._id, status: 'RECEIVED', totalAmount: 70000, originalAmount: 78000,
      negotiatedAmount: 70000, savingsAmount: 8000, savingsPercentage: 10,
      negotiationStatus: 'AGREED',
      negotiationNotes: 'CFO negotiated 10% volume discount on frame and fork bulk bundle. Agreed payment terms: Net-30.',
      negotiationAgreedAt: new Date(now - 175 * dayMs),
      negotiationAgreedBy: 'Finance Manager (CFO)',
      approvalTier: 'TIER_2_FINANCE', approvalRequiredRole: 'FINANCE_MANAGER',
      orderDate: new Date(now - 180 * dayMs), receivedDate: new Date(now - 170 * dayMs),
      items: [
        { product: getProd('RAW-FRM-001')._id, quantity: 100, unitPrice: 450, totalPrice: 45000, originalUnitPrice: 500, negotiatedUnitPrice: 450, negotiatedTotalPrice: 45000 },
        { product: getProd('RAW-FRK-001')._id, quantity: 100, unitPrice: 250, totalPrice: 25000, originalUnitPrice: 280, negotiatedUnitPrice: 250, negotiatedTotalPrice: 25000 }
      ]
    });
    const b1 = await Batch.create({ product: getProd('RAW-FRM-001')._id, batchNumber: 'BN-FRM-1001', expiryDate: new Date(now + 365 * dayMs), initialQuantity: 100, currentQuantity: 80, allocatedQuantity: 10, purchasePrice: 4500, po: po1._id, location: 'Rack A-01 (Frames)' });
    const b2 = await Batch.create({ product: getProd('RAW-FRK-001')._id, batchNumber: 'BN-FRK-1001', expiryDate: new Date(now + 365 * dayMs), initialQuantity: 100, currentQuantity: 70, allocatedQuantity: 0, purchasePrice: 2500, po: po1._id, location: 'Rack A-01 (Frames)' });

    const po2 = await PurchaseOrder.create({
      poNumber: 'PO-20260315-001', supplier: supShimano._id, status: 'RECEIVED', totalAmount: 57500, originalAmount: 62500,
      negotiatedAmount: 57500, savingsAmount: 5000, savingsPercentage: 8,
      negotiationStatus: 'IN_NEGOTIATION',
      negotiationNotes: 'CFO submitted 8% counter-offer: Proposed ₹57,500 based on quarterly volume commitment.',
      approvalTier: 'TIER_2_FINANCE', approvalRequiredRole: 'FINANCE_MANAGER',
      orderDate: new Date(now - 20 * dayMs), receivedDate: new Date(now - 15 * dayMs),
      items: [
        { product: getProd('CMP-DRV-001')._id, quantity: 50, unitPrice: 800, totalPrice: 40000, originalUnitPrice: 870, negotiatedUnitPrice: 800, negotiatedTotalPrice: 40000 },
        { product: getProd('CMP-BRK-001')._id, quantity: 50, unitPrice: 350, totalPrice: 17500, originalUnitPrice: 380, negotiatedUnitPrice: 350, negotiatedTotalPrice: 17500 }
      ]
    });
    const b3 = await Batch.create({ product: getProd('CMP-DRV-001')._id, batchNumber: 'BN-DRV-0315', expiryDate: new Date(now + 365 * dayMs), initialQuantity: 50, currentQuantity: 45, allocatedQuantity: 5, purchasePrice: 8000, po: po2._id, location: 'Bay B-03 (Drivetrains)' });
    const b4 = await Batch.create({ product: getProd('CMP-BRK-001')._id, batchNumber: 'BN-BRK-0315', expiryDate: new Date(now + 365 * dayMs), initialQuantity: 50, currentQuantity: 50, allocatedQuantity: 0, purchasePrice: 3500, po: po2._id, location: 'Bay B-03 (Drivetrains)' });

    const po3 = await PurchaseOrder.create({
      poNumber: 'PO-20260401-002', supplier: supMaxxis._id, status: 'ORDERED', totalAmount: 24000, originalAmount: 24000,
      approvalTier: 'TIER_1_SUPPLY_CHAIN', approvalRequiredRole: 'SUPPLY_CHAIN_MANAGER',
      orderDate: new Date(now - 5 * dayMs),
      items: [
        { product: getProd('CMP-TIR-001')._id, quantity: 200, unitPrice: 120, totalPrice: 24000 }
      ]
    });

    // PO4: Pending Approval - Tier 2 (Finance Manager / CFO Sign-off)
    await PurchaseOrder.create({
      poNumber: 'PO-20260408-003', supplier: supMaxxis._id, status: 'PENDING_APPROVAL', totalAmount: 72000, originalAmount: 72000,
      approvalTier: 'TIER_2_FINANCE', approvalRequiredRole: 'FINANCE_MANAGER',
      orderDate: new Date(now - 1 * dayMs),
      items: [
        { product: getProd('CMP-TIR-001')._id, quantity: 400, unitPrice: 120, totalPrice: 48000 },
        { product: getProd('RAW-FRK-001')._id, quantity: 96, unitPrice: 250, totalPrice: 24000 }
      ],
      notes: 'Urgent production batch requirement. Exceeds ₹50,000 Supply Chain threshold.'
    });

    // PO5: Pending Approval - Tier 3 (Super Admin Sign-off)
    await PurchaseOrder.create({
      poNumber: 'PO-20260408-004', supplier: supShimano._id, status: 'PENDING_APPROVAL', totalAmount: 785000, originalAmount: 785000,
      approvalTier: 'TIER_3_EXECUTIVE', approvalRequiredRole: 'ADMIN',
      orderDate: new Date(now),
      items: [
        { product: getProd('CMP-DRV-001')._id, quantity: 650, unitPrice: 800, totalPrice: 520000 },
        { product: getProd('CMP-BRK-001')._id, quantity: 750, unitPrice: 350, totalPrice: 262500 },
        { product: getProd('RAW-FRK-001')._id, quantity: 10, unitPrice: 250, totalPrice: 2500 }
      ],
      notes: 'Major quarterly drivetrain import. Exceeds Finance limit (₹5,00,000), requires Super Admin authorization.'
    });

    // PO6: In-Negotiation + Pending Approval
    await PurchaseOrder.create({
      poNumber: 'PO-20260409-005', supplier: supPrecision._id, status: 'PENDING_APPROVAL', totalAmount: 189000, originalAmount: 210000,
      negotiatedAmount: 189000, savingsAmount: 21000, savingsPercentage: 10,
      negotiationStatus: 'IN_NEGOTIATION',
      negotiationNotes: 'Finance Manager proposed 10% price concession for 600 hydraulic brake sets with scheduled bi-weekly dispatch.',
      approvalTier: 'TIER_2_FINANCE', approvalRequiredRole: 'FINANCE_MANAGER',
      orderDate: new Date(now),
      items: [
        { product: getProd('CMP-BRK-001')._id, quantity: 600, unitPrice: 315, totalPrice: 189000, originalUnitPrice: 350, negotiatedUnitPrice: 315, negotiatedTotalPrice: 189000 }
      ],
      notes: 'High volume brake order currently in vendor discount negotiation & pending CFO approval.'
    });

    // 7. Create Orders
    console.log('Seeding Sales Orders...');
    
    await Order.create({
      orderNumber: 'ORD-20260110-001', customerName: 'Decathlon Retail India', shippingAddress: 'Logistics Center, Chakan, Pune', status: 'SHIPPED', totalAmount: 92500,
      items: [
        { product: getProd('BIK-URB-001')._id, quantity: 50, price: 1850 }
      ],
      allocations: [
        { batch: b1._id, quantity: 50 } 
      ]
    });

    await Order.create({
      orderNumber: 'ORD-20260405-001', customerName: 'Metro Wheels & Distributors', shippingAddress: '45 GIDC Industrial Estate, Vadodara', status: 'ALLOCATED', totalAmount: 112000,
      items: [
        { product: getProd('BIK-MTB-002')._id, quantity: 20, price: 3200 },
        { product: getProd('BIK-ELE-004')._id, quantity: 10, price: 4800 }
      ],
      allocations: [
        { batch: b1._id, quantity: 10 },
        { batch: b3._id, quantity: 5 }
      ]
    });

    // 8. Create GST Returns
    console.log('Seeding GST Returns...');
    await GSTReturn.create({
      returnPeriod: '2026-03',
      formType: 'GSTR-3B',
      status: 'FILED',
      totalSales: 302000,
      totalPurchases: 156500,
      taxLiabilityCGST: 18120,
      taxLiabilitySGST: 18120,
      taxLiabilityIGST: 0,
      itcAvailableCGST: 9390,
      itcAvailableSGST: 9390,
      itcAvailableIGST: 0,
      netTaxPayable: 17460,
      arn: 'AA2703260192837'
    });

    console.log('🎉 ALL DATA SEEDED SUCCESSFULLY INTO MONGODB ATLAS DATABASE "manufacturing-erp"!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seed();
