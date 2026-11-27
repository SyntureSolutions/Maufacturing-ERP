import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dns from 'node:dns';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import Category from '@/models/Category';
import Product from '@/models/Product';
import Supplier from '@/models/Supplier';
import PurchaseOrder from '@/models/PurchaseOrder';
import Batch from '@/models/Batch';
import Order from '@/models/Order';
import GSTReturn from '@/models/GSTReturn';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');
    
    if (key !== 'auma-seed-2026') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      Product.deleteMany({}),
      Supplier.deleteMany({}),
      PurchaseOrder.deleteMany({}),
      Batch.deleteMany({}),
      Order.deleteMany({}),
      GSTReturn.deleteMany({})
    ]);

    // Create 7 Executive Role Users
    await Promise.all([
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

    return NextResponse.json({ message: 'Database seeded successfully into MongoDB Atlas with all 7 Role-Based User Accounts!' });
  } catch (error: any) {
    console.error('API Seed Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
