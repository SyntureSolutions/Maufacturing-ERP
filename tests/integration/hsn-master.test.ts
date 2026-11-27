import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { startDb, stopDb, call, asAdmin, asRole } from './harness';

// HSN/SAC master: bulk import from Excel or CSV (checked first), search, and single changes from the screen.
describe('HSN/SAC master', () => {
  const r: any = {};
  const upload = async (name: string, data: BlobPart, dryRun = false) => {
    const fd = new FormData();
    fd.append('file', new File([data], name));
    if (dryRun) fd.append('dryRun', '1');
    const res: Response = await r.hsn.POST(new NextRequest('http://localhost/api/hsn', { method: 'POST', body: fd }));
    return { status: res.status, json: await res.json() };
  };
  const search = async (q: string, extra = '') => (await call(r.hsn.GET, 'GET', undefined, undefined, `?q=${encodeURIComponent(q)}${extra}`)).json;

  beforeAll(async () => {
    await startDb();
    r.hsn = await import('@/app/api/hsn/route');
    asAdmin();
  }, 120000);
  afterAll(stopDb);

  it('checks an Excel file like the GST portal one (HSN and SAC sheets) without saving, then imports it', async () => {
    const wb = new ExcelJS.Workbook();
    const hsn = wb.addWorksheet('HSN');
    hsn.addRow(['HSN_CD', 'HSN_Description']);
    hsn.addRow([101, 'Live horses, asses, mules and hinnies']); // a number: Excel dropped the leading zero
    hsn.addRow([8712, 'Bicycles and other cycles']);
    hsn.addRow(['87AB', 'Not a code']);
    const sac = wb.addWorksheet('SAC');
    sac.addRow(['SAC_CD', 'SAC_Description']);
    sac.addRow([998314, 'IT design and development services']);
    const xlsx = Buffer.from(await wb.xlsx.writeBuffer());

    const check = await upload('HSN_SAC.xlsx', xlsx, true);
    expect(check.status, JSON.stringify(check.json)).toBe(200);
    expect(check.json).toMatchObject({ dryRun: true, codes: 3, added: 3, updated: 0, problems: 1 });
    expect(check.json.issues[0]).toMatchObject({ sheet: 'HSN', line: 4 });
    expect((await search('')).all).toBe(0); // a check saves nothing

    const done = await upload('HSN_SAC.xlsx', xlsx);
    expect(done.json).toMatchObject({ added: 3, updated: 0 });
    const found = await search('');
    expect(found.rows.map((x: any) => x.code)).toEqual(['0101', '8712', '998314']);
    expect(found.rows.find((x: any) => x.code === '998314').kind).toBe('SAC');
  });

  it('a rate sheet in CSV updates descriptions and rates; a file without rates keeps the rates already set', async () => {
    const csv = 'HSN Code,Description,GST Rate\n8712,"Bicycles, not motorised",5\n8714,Parts of bicycles,18%\n';
    expect((await upload('rates.csv', csv)).json).toMatchObject({ added: 1, updated: 1, withRate: 2 });
    expect((await search('8712')).rows[0]).toMatchObject({ description: 'Bicycles, not motorised', gstRate: 5, source: 'rates.csv' });
    await upload('names.csv', 'Code,Description\n8712,Bicycles and cycles\n');
    expect((await search('8712')).rows[0]).toMatchObject({ description: 'Bicycles and cycles', gstRate: 5 });
  });

  it('searches by the start of the code or by words in the description', async () => {
    expect((await search('87')).rows.map((x: any) => x.code)).toEqual(['8712', '8714']);
    expect((await search('parts of')).rows.map((x: any) => x.code)).toEqual(['8714']);
    expect((await search('', '&kind=SAC')).rows.map((x: any) => x.code)).toEqual(['998314']);
    expect((await search('(unbalanced')).total).toBe(0); // typed brackets are text, not a pattern
  });

  it('adds or corrects one code from the screen, with the same checks as a file', async () => {
    const ok = await call(r.hsn.POST, 'POST', { rows: [{ code: '7318', description: 'Screws, bolts and nuts', gstRate: '18' }] });
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    expect((await search('7318')).rows[0]).toMatchObject({ gstRate: 18, kind: 'HSN' });
    expect((await call(r.hsn.POST, 'POST', { rows: [{ code: 'X', description: 'bad' }] })).status).toBe(400);
    expect((await call(r.hsn.POST, 'POST', { rows: [{ code: '7318', description: 'x', gstRate: 55 }] })).status).toBe(400);
  });

  it('refuses unreadable files and people who may not change the master', async () => {
    expect((await upload('list.pdf', 'not a sheet')).status).toBe(400);
    expect((await upload('empty.csv', 'Code,Description\n')).status).toBe(400);
    asRole('SALES');
    expect((await upload('rates.csv', 'Code,Description\n8712,x\n')).status).toBe(403);
    expect((await search('87')).rows.length).toBe(2); // everyone can search
    const tpl = await call(r.hsn.GET, 'GET', undefined, undefined, '?template=1');
    expect(tpl.text).toMatch(/^HSN\/SAC Code,Description,GST Rate/);
    asAdmin();
  });
});
