import { NextResponse } from 'next/server';
import dbConnect from '../../../../lib/mongodb';
import User from '../../../../models/User';
import { login } from '../../../../lib/auth';
import { demoMode, demoOrThrow } from '../../../../lib/demoMode';

// Built-in accounts for demos only. They never sign anyone in unless DEMO_MODE=true: on a real system they would let
// anyone who knows these well-known passwords in as Admin, whatever the real users and passwords are.
const DEMO_USERS = [
  { id: '1', name: 'Super Admin', email: 'admin@inventorypro.com', password: '123456789', role: 'ADMIN' },
  { id: '1', name: 'Super Admin', email: 'admin@auma.com', password: 'password123', role: 'ADMIN' },
  { id: '2', name: 'Production Manager', email: 'production@inventorypro.com', password: '123456789', role: 'PRODUCTION_MANAGER' },
  { id: '3', name: 'Quality Inspector', email: 'quality@inventorypro.com', password: '123456789', role: 'QUALITY_INSPECTOR' },
  { id: '4', name: 'Finance Manager (CFO)', email: 'finance@inventorypro.com', password: '123456789', role: 'FINANCE_MANAGER' },
  { id: '5', name: 'Supply Chain Manager', email: 'supplychain@inventorypro.com', password: '123456789', role: 'SUPPLY_CHAIN_MANAGER' },
  { id: '6', name: 'HR & Labour Manager', email: 'hr@inventorypro.com', password: '123456789', role: 'HR_MANAGER' },
  { id: '7', name: 'B2B Sales Manager', email: 'sales@inventorypro.com', password: '123456789', role: 'SALES' },
  { id: '8', name: 'Operations Manager', email: 'manager@inventorypro.com', password: '123456789', role: 'MANAGER' },
  { id: '9', name: 'Warehouse Staff', email: 'staff@inventorypro.com', password: '123456789', role: 'STAFF' },
  { id: '10', name: 'Executive Viewer', email: 'viewer@inventorypro.com', password: '123456789', role: 'VIEWER' }
];

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    let user: any = null;

    try {
      await dbConnect();
      user = await User.findOne({ email }).select('+password');
    } catch (dbErr) {
      demoOrThrow(dbErr); // the database is needed to sign in, except in demo mode
    }
    
    if (user && (await user.comparePassword(password))) {
      const sessionUser = {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role
      };
      await login(sessionUser);
      return NextResponse.json({ success: true, user: sessionUser });
    }

    // Static demo users: demo mode only
    const foundDemoUser = demoMode() && DEMO_USERS.find(u => u.email === email && u.password === password);
    if (foundDemoUser) {
      const sessionUser = {
        id: foundDemoUser.id,
        name: foundDemoUser.name,
        email: foundDemoUser.email,
        role: foundDemoUser.role
      };
      await login(sessionUser);
      return NextResponse.json({ success: true, user: sessionUser });
    }

    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
