import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import HsnCode from '@/models/HsnCode';
import { verifyAuth } from '@/lib/auth';
import { HttpError, statusOf } from '@/lib/httpError';
import { logAuditEvent } from '@/lib/audit';
import { mergeHsnSheets, readSpreadsheet, type HsnRow, type HsnIssue } from '@/lib/hsnImport';

// HSN/SAC master.
//  GET  ?q=8714            codes starting with the digits, or ?q=bicycle words in the description (50 at a time)
//  GET  ?template=1        a CSV to fill in
//  POST multipart file     bulk import of an .xlsx/.csv (dryRun=1 only checks and counts)
//  POST JSON { rows }      add or change a few codes from the screen
// An existing code gets the new description; its GST rate changes only when the file gives one.

const WRITE_ROLES = ['ADMIN', 'MANAGER', 'FINANCE_MANAGER'];
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_ROWS = 60000;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const p = req.nextUrl.searchParams;
    if (p.get('template')) {
      const csv = 'HSN/SAC Code,Description,GST Rate\n8712,"Bicycles and other cycles, not motorised",12\n998314,IT design and development services,18\n';
      return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="hsn-sac-template.csv"' } });
    }
    await dbConnect();
    const q = String(p.get('q') || '').trim();
    const kind = p.get('kind');
    const filter: any = { isActive: true };
    if (kind === 'HSN' || kind === 'SAC') filter.kind = kind;
    if (/^\d+$/.test(q)) filter.code = { $regex: `^${q}` };
    else if (q) filter.description = { $regex: escape(q), $options: 'i' };
    const limit = Math.min(200, Math.max(1, Number(p.get('limit')) || 50));
    const [rows, total, all] = await Promise.all([
      HsnCode.find(filter).sort({ code: 1 }).limit(limit).lean(),
      HsnCode.countDocuments(filter),
      HsnCode.estimatedDocumentCount(),
    ]);
    return NextResponse.json({ rows, total, all });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!WRITE_ROLES.includes(user.role)) return NextResponse.json({ error: 'Only Admin, Manager or Finance Manager can change the HSN/SAC master.' }, { status: 403 });

    let rows: HsnRow[], issues: HsnIssue[] = [], read = 0, repeated = 0, source = 'Entered on screen', dryRun = false;
    if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) throw new HttpError(400, 'Choose a file to import.');
      if (file.size > MAX_BYTES) throw new HttpError(413, 'The file is larger than 15 MB.');
      dryRun = form.get('dryRun') === '1';
      let sheets;
      try { sheets = await readSpreadsheet(file.name, await file.arrayBuffer()); } catch (e: any) { throw new HttpError(400, e.message || 'The file could not be read.'); }
      ({ rows, issues, read, repeated } = mergeHsnSheets(sheets));
      source = file.name;
    } else {
      const body = await req.json().catch(() => null);
      if (!body || !Array.isArray(body.rows)) throw new HttpError(400, 'Send { rows: [{ code, description, gstRate }] } or upload a file.');
      // the same reading rules as a file, so a code typed on screen is checked the same way
      ({ rows, issues, read, repeated } = mergeHsnSheets([{ name: 'Screen', rows: [['Code', 'Description', 'GST Rate'], ...body.rows.map((r: any) => [r.code, r.description, r.gstRate])] }]));
      dryRun = !!body.dryRun;
      if (issues.length) throw new HttpError(400, issues.map(i => i.message).join(' '));
    }
    if (!rows.length) throw new HttpError(400, issues.length ? `No code could be read. First problem: line ${issues[0].line} – ${issues[0].message}` : 'The file has no HSN or SAC codes. It needs a code column and a description column.');
    if (rows.length > MAX_ROWS) throw new HttpError(413, `The file has ${rows.length} codes; import at most ${MAX_ROWS} at a time.`);

    await dbConnect();
    const existing = new Set<string>();
    for (let i = 0; i < rows.length; i += 5000) {
      const found = await HsnCode.find({ code: { $in: rows.slice(i, i + 5000).map(r => r.code) } }).select('code').lean();
      found.forEach((f: any) => existing.add(f.code));
    }
    const summary = {
      read, codes: rows.length, added: rows.filter(r => !existing.has(r.code)).length, updated: rows.filter(r => existing.has(r.code)).length,
      withRate: rows.filter(r => r.gstRate !== undefined).length, repeated, problems: issues.length, issues: issues.slice(0, 200), dryRun,
    };
    if (dryRun) return NextResponse.json(summary);

    for (let i = 0; i < rows.length; i += 1000) {
      await HsnCode.bulkWrite(rows.slice(i, i + 1000).map(r => ({
        updateOne: {
          filter: { code: r.code },
          update: { $set: { kind: r.kind, isActive: true, source, ...(r.description ? { description: r.description } : {}), ...(r.gstRate !== undefined ? { gstRate: r.gstRate } : {}) } },
          upsert: true,
        },
      })), { ordered: false });
    }
    await logAuditEvent({
      userId: user.id, userName: user.name, userRole: user.role, action: 'EDIT', resource: 'HSN_MASTER', resourceId: source, resourceName: source,
      details: `Bulk import into the HSN/SAC master: ${summary.added} added, ${summary.updated} updated, ${summary.problems} lines skipped.`,
    });
    return NextResponse.json(summary);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
