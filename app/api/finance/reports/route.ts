import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Account from '@/models/Account';
import JournalEntry from '@/models/JournalEntry';
import Invoice from '@/models/Invoice';
import '@/models/Customer';
import '@/models/Supplier';
import { verifyAuth } from '@/lib/auth';
import { canViewFinance } from '@/lib/accessRoles';
import { advanceRemaining } from '@/lib/payables';
import { ACC, ensureAccount } from '@/lib/accounting';
import { balancesAsOf, bucketForAge, natural, profitAndLoss, Movement, AccountRow } from '@/lib/reportMath';
import GRN from '@/models/GRN';
import Voucher from '@/models/Voucher';
import Supplier from '@/models/Supplier';
import { buildCreditors, unbilledLines, ReceivedLine } from '@/lib/creditorAging';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const endOfDay = (s?: string | null) => (s ? new Date(`${s}T23:59:59.999Z`) : new Date());
const startOfDay = (s?: string | null, fallback = '2000-01-01') => new Date(`${s || fallback}T00:00:00.000Z`);

async function loadMovements(): Promise<Movement[]> {
  const rows = await JournalEntry.aggregate([
    { $match: { status: 'POSTED' } }, { $unwind: '$lines' },
    { $project: { account: { $toString: '$lines.account' }, debit: '$lines.debit', credit: '$lines.credit', date: '$date' } },
  ]);
  return rows as Movement[];
}

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewFinance(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const q = req.nextUrl.searchParams;
    const type = q.get('type');
    await dbConnect();
    for (const def of Object.values(ACC)) await ensureAccount(def);
    const accounts = (await Account.find({ isActive: true }).sort({ code: 1 }).lean() as any[]).map(a => ({ ...a, _id: String(a._id) })) as AccountRow[];

    if (type === 'ledger') {
      const code = q.get('account');
      const acct = accounts.find(a => a.code === code);
      if (!acct) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
      const from = startOfDay(q.get('from')), to = endOfDay(q.get('to'));
      const entries = await JournalEntry.find({ status: 'POSTED', 'lines.account': acct._id, date: { $lte: to } }).sort({ date: 1, createdAt: 1 }).lean() as any[];
      const all = await loadMovements();
      const opening = balancesAsOf([acct], all, new Date(from.getTime() - 1))[0].asOfBalance;
      let running = opening;
      const lines = [];
      for (const e of entries) {
        for (const l of e.lines.filter((x: any) => String(x.account) === acct._id)) {
          running = r2(running + natural(acct.type, l.debit, l.credit));
          if (e.date >= from) lines.push({ date: e.date, entryNumber: e.entryNumber, description: e.description, reference: e.reference, referenceType: e.referenceType, debit: l.debit, credit: l.credit, balance: running });
        }
      }
      return NextResponse.json({ account: acct, opening, lines, closing: running });
    }

    if (type === 'trial' || type === 'bs') {
      const asOf = endOfDay(q.get('asOf') || q.get('to'));
      const rows = balancesAsOf(accounts, await loadMovements(), asOf).filter(a => a.asOfBalance !== 0 || type === 'trial');
      if (type === 'trial') {
        const lines = rows.map(a => {
          const debitSide = a.type === 'ASSET' || a.type === 'EXPENSE' ? a.asOfBalance >= 0 : a.asOfBalance < 0;
          const v = Math.abs(a.asOfBalance);
          return { code: a.code, name: a.name, type: a.type, debit: debitSide ? v : 0, credit: debitSide ? 0 : v };
        });
        const totalDebit = r2(lines.reduce((s, l) => s + l.debit, 0)), totalCredit = r2(lines.reduce((s, l) => s + l.credit, 0));
        return NextResponse.json({ asOf, lines, totalDebit, totalCredit, difference: r2(totalDebit - totalCredit) });
      }
      const group = (t: string) => rows.filter(a => a.type === t).map(a => ({ code: a.code, name: a.name, category: a.category, amount: a.asOfBalance }));
      const assets = group('ASSET'), liabilities = group('LIABILITY'), equity = group('EQUITY');
      const retained = r2(rows.filter(a => a.type === 'REVENUE').reduce((s, a) => s + a.asOfBalance, 0) - rows.filter(a => a.type === 'EXPENSE').reduce((s, a) => s + a.asOfBalance, 0));
      const sum = (l: { amount: number }[]) => r2(l.reduce((s, x) => s + x.amount, 0));
      const totalAssets = sum(assets), totalLiabilities = sum(liabilities), totalEquity = r2(sum(equity) + retained);
      return NextResponse.json({ asOf, assets, liabilities, equity, currentYearProfit: retained, totalAssets, totalLiabilities, totalEquity, difference: r2(totalAssets - totalLiabilities - totalEquity) });
    }

    if (type === 'pnl') {
      const from = startOfDay(q.get('from'), `${new Date().getFullYear()}-04-01`), to = endOfDay(q.get('to'));
      return NextResponse.json({ from, to, ...profitAndLoss(accounts, await loadMovements(), from, to) });
    }

    if (type === 'creditors') {
      // What we owe suppliers: unpaid bills + goods received but not yet billed - payments not applied to a bill
      const asOf = endOfDay(q.get('asOf'));
      const bills: any[] = await Invoice.find({ type: 'PURCHASE', status: { $nin: ['CANCELLED', 'DRAFT', 'PAID'] }, date: { $lte: asOf } }).lean();
      const grns: any[] = await GRN.find({ createdAt: { $lte: asOf } }).populate('items.product', 'name').lean();

      // Goods are a liability once accepted (that is when the books record them). Goods still in quarantine are shown separately.
      const accepted = (i: any) => i.inspection !== 'PENDING';
      const awaitingQc = r2(grns.reduce((sum, g) => sum + g.items.filter((i: any) => !accepted(i)).reduce((t: number, i: any) => t + (i.receivedQty || 0) * (i.unitPrice || 0), 0), 0));
      const received: ReceivedLine[] = grns.flatMap(g => g.items.filter(accepted).map((i: any) => ({
        poId: String(g.po), poNumber: g.poNumber, supplierId: String(g.supplier), product: String(i.product?._id || i.product), productName: i.product?.name || 'Item',
        grnNumber: g.number, date: new Date(g.createdAt), kept: Math.round(((i.receivedQty || 0) - (i.returnQty || 0)) * 10000) / 10000, price: i.unitPrice || 0,
      })));
      // quantity billed as of the report date: every booked bill dated on or before it (not today's running counters)
      const billed = new Map<string, number>();
      const booked: any[] = await Invoice.find({ type: 'PURCHASE', status: { $ne: 'CANCELLED' }, order: { $exists: true }, date: { $lte: asOf } }).select('order items.product items.quantity items.returnedQty').lean();
      for (const b of booked) for (const i of b.items) if (i.product) billed.set(`${b.order}|${i.product}`, (billed.get(`${b.order}|${i.product}`) || 0) + (i.quantity || 0) - (i.returnedQty || 0));

      const advances: any[] = await Voucher.find({ type: { $in: ['BANK_PAYMENT', 'CASH_PAYMENT'] }, partyType: 'SUPPLIER', partyId: { $exists: true }, refDoc: { $exists: false }, status: 'POSTED', date: { $lte: asOf } }).lean();

      const rows0 = buildCreditors({
        asOf, unbilled: unbilledLines(received, billed),
        bills: bills.map(b => ({ supplierId: String(b.supplier), number: b.invoiceNumber, vendorNumber: b.vendorBillNumber, date: new Date(b.date), outstanding: r2(b.totalAmount - (b.amountPaid || 0) - (b.creditedAmount || 0)) })),
        advances: advances.map(a => ({ supplierId: String(a.partyId), number: a.number, date: new Date(a.date), amount: advanceRemaining(a, asOf) })).filter(a => a.amount > 0.004),
      });
      const suppliers: any[] = await Supplier.find({ _id: { $in: rows0.map(r => r.supplierId) } }).select('name code').lean();
      const rows = rows0.map(r => { const sup = suppliers.find(x => String(x._id) === r.supplierId); return { ...r, party: sup?.name || 'Unknown supplier', code: sup?.code }; });
      const keys = ['billed', 'unbilled', 'advances', 'net', 'total', '0-30', '31-60', '61-90', '90+'];
      const totals: any = keys.reduce((o: any, k) => ({ ...o, [k]: r2(rows.reduce((sum, r: any) => sum + r[k], 0)) }), {});
      totals.awaitingQc = awaitingQc;

      // Cross-check with the payables ledger so differences (opening balances, entries without a supplier) are visible
      const ap = balancesAsOf(accounts, await loadMovements(), asOf).find(a => a.code === ACC.AP[0]);
      const ledgerBalance = ap?.asOfBalance ?? 0;
      return NextResponse.json({ asOf, rows, totals, ledger: { balance: ledgerBalance, reportNet: totals.net, difference: r2(ledgerBalance - totals.net) } });
    }

    if (type === 'debtors') {
      const asOf = endOfDay(q.get('asOf'));
      const invoices = await Invoice.find({ type: type === 'debtors' ? 'SALES' : 'PURCHASE', status: { $nin: ['CANCELLED', 'DRAFT', 'PAID'] }, date: { $lte: asOf } })
        .populate(type === 'debtors' ? 'customer' : 'supplier', 'name code').lean() as any[];
      const parties = new Map<string, any>();
      for (const inv of invoices) {
        const outstanding = r2(inv.totalAmount - (inv.amountPaid || 0) - (inv.creditedAmount || 0));
        if (outstanding <= 0) continue;
        const p = type === 'debtors' ? inv.customer : inv.supplier;
        const key = String(p?._id || inv.parties?.buyer?.name || 'unknown');
        const bucket = bucketForAge(Math.floor((asOf.getTime() - new Date(inv.date).getTime()) / 86400000));
        const row = parties.get(key) || { party: p?.name || inv.parties?.buyer?.name || 'Unknown', code: p?.code, total: 0, '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, invoices: [] };
        row[bucket] = r2(row[bucket] + outstanding); row.total = r2(row.total + outstanding);
        row.invoices.push({ invoiceNumber: inv.invoiceNumber, date: inv.date, dueDate: inv.dueDate, outstanding, bucket });
        parties.set(key, row);
      }
      const rows = [...parties.values()].sort((a, b) => b.total - a.total);
      return NextResponse.json({ asOf, rows, totals: ['total', '0-30', '31-60', '61-90', '90+'].reduce((o: any, k) => ({ ...o, [k]: r2(rows.reduce((s, r) => s + r[k], 0)) }), {}) });
    }

    return NextResponse.json({ error: 'type must be ledger, trial, pnl, bs, debtors or creditors.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
