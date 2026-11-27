import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import Voucher from '@/models/Voucher';
import CompanySettings from '@/models/CompanySettings';
import '@/models/Supplier';
import '@/models/Customer';
import { verifyAuth } from '@/lib/auth';
import { buildTallyXml, moneyVoucher, purchaseVoucher, salesVoucher, validateVoucher, TallyVoucher } from '@/lib/tally';

const TYPES = ['SALES', 'PURCHASE', 'RECEIPT', 'PAYMENT'] as const;

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&types=SALES,RECEIPT[&preview=1]
export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'FINANCE_MANAGER'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const q = req.nextUrl.searchParams;
    const from = q.get('from'), to = q.get('to');
    if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) return NextResponse.json({ error: 'Choose a valid date range.' }, { status: 400 });
    const types = (q.get('types') || '').split(',').filter(t => (TYPES as readonly string[]).includes(t));
    if (!types.length) return NextResponse.json({ error: 'Choose at least one voucher type.' }, { status: 400 });
    const range = { $gte: new Date(`${from}T00:00:00.000Z`), $lte: new Date(`${to}T23:59:59.999Z`) };

    await dbConnect();
    const company: any = await CompanySettings.findOne({ key: 'company' }).lean();
    const vouchers: TallyVoucher[] = [];
    const warnings: string[] = [];
    const push = (v: TallyVoucher) => { const e = validateVoucher(v); if (e) warnings.push(e); else vouchers.push(v); };

    for (const [kind, build] of [['SALES', salesVoucher], ['PURCHASE', purchaseVoucher]] as const) {
      if (!types.includes(kind)) continue;
      const invoices = await Invoice.find({ type: kind, status: { $nin: ['CANCELLED', 'DRAFT'] }, date: range }).populate('customer', 'name').populate('supplier', 'name').sort({ date: 1 }).lean() as any[];
      for (const i of invoices) {
        const party = (kind === 'SALES' ? i.customer?.name || i.parties?.buyer?.name : i.supplier?.name) || '';
        if (!party) { warnings.push(`${i.invoiceNumber}: party name is missing`); continue; }
        push(build({ number: i.invoiceNumber, date: new Date(i.date), party, subTotal: i.subTotal, totalCGST: i.totalCGST || 0, totalSGST: i.totalSGST || 0, totalIGST: i.totalIGST || 0, totalAmount: i.totalAmount }));
      }
    }
    for (const [kind, set] of [['RECEIPT', ['BANK_RECEIPT', 'CASH_RECEIPT']], ['PAYMENT', ['BANK_PAYMENT', 'CASH_PAYMENT']]] as const) {
      if (!types.includes(kind)) continue;
      const rows = await Voucher.find({ type: { $in: set }, status: 'POSTED', date: range }).sort({ date: 1 }).lean() as any[];
      for (const v of rows) {
        if (!v.partyName) { warnings.push(`${v.number}: party name is missing`); continue; }
        push(moneyVoucher(kind === 'RECEIPT' ? 'Receipt' : 'Payment', { number: v.number, date: new Date(v.date), party: v.partyName, amount: v.amount, mode: v.type.startsWith('CASH') ? 'CASH' : 'BANK', narration: v.narration }));
      }
    }

    if (q.get('preview')) {
      const counts: Record<string, number> = {};
      vouchers.forEach(v => { counts[v.type] = (counts[v.type] || 0) + 1; });
      return NextResponse.json({ counts, total: vouchers.length, warnings });
    }
    const xml = buildTallyXml(vouchers, company?.legalName || 'Company');
    return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="tally-${from}-to-${to}.xml"` } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
