import React from 'react';
import { getSession } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import CompanySettings from '@/models/CompanySettings';
import WorkspaceShell from '@/components/workspace/WorkspaceShell';
import '../workspace.css';

/** The company name for the title and status bars; the shell still opens if the database is not reachable. */
async function companyName() {
  try {
    await dbConnect();
    const c: any = await CompanySettings.findOne({ key: 'company' }).select('legalName').lean();
    return c?.legalName || 'Company not set up';
  } catch {
    return 'Company not set up';
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const user = session?.user ? { name: session.user.name, email: session.user.email, role: session.user.role } : null;
  return <WorkspaceShell user={user} company={await companyName()}>{children}</WorkspaceShell>;
}
