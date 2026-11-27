import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startDb, stopDb, asRole, asAdmin, state } from './harness';
import { NextRequest } from 'next/server';
import { ATTACHMENT_TYPES } from '@/lib/attachmentAccess';

// Files can be attached to every kind of document; files on money documents are only for the roles that may see those documents
describe('attachments on every document', () => {
  const r: any = {};
  const upload = async (entityType: string, entityId = 'abc123', name = 'note.pdf') => {
    const fd = new FormData();
    fd.append('file', new File([new Uint8Array([1, 2, 3])], name, { type: 'application/pdf' }));
    fd.append('entityType', entityType); fd.append('entityId', entityId);
    const res = await r.list.POST(new NextRequest('http://localhost/api/attachments', { method: 'POST', body: fd }));
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const list = async (entityType: string, entityId = 'abc123') => {
    const res = await r.list.GET(new NextRequest(`http://localhost/api/attachments?entityType=${entityType}&entityId=${entityId}`));
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const open = async (id: string) => (await r.one.GET(new NextRequest('http://localhost/api/attachments/x'), { params: Promise.resolve({ id }) })).status;

  beforeAll(async () => { await startDb(); r.list = await import('@/app/api/attachments/route'); r.one = await import('@/app/api/attachments/[id]/route'); asAdmin(); }, 120000);
  afterAll(stopDb);

  it('every document type accepts a file from an allowed role, and the file can be listed and opened', async () => {
    asAdmin();
    for (const type of ATTACHMENT_TYPES) {
      const up = await upload(type, `id-${type}`);
      expect(up.status, type).toBe(201);
      const files = await list(type, `id-${type}`);
      expect(files.json, type).toHaveLength(1);
      expect(await open(files.json[0]._id), type).toBe(200);
    }
  });

  it('unknown kinds of document, viewers and bad files are refused', async () => {
    asAdmin();
    expect((await upload('SOMETHING_ELSE')).status).toBe(400);
    expect((await upload('GRN', 'x', 'virus.exe')).status).toBe(415);
    asRole('VIEWER'); expect((await upload('GRN')).status).toBe(403);
    asAdmin();
    state.user = null as any;
    expect((await upload('GRN')).status).toBe(401);
    expect((await list('GRN')).status).toBe(401);
    asAdmin();
  });

  it('files on money documents follow who may see the document', async () => {
    asAdmin();
    const made: Record<string, string> = {};
    for (const type of ['VENDOR_BILL', 'INVOICE', 'WORK_ORDER']) made[type] = (await upload(type, `own-${type}`)).json._id;
    const roles = { VENDOR_BILL: ['ADMIN', 'MANAGER', 'FINANCE_MANAGER', 'VIEWER'], INVOICE: ['ADMIN', 'MANAGER', 'FINANCE_MANAGER', 'VIEWER', 'SALES', 'SUPPLY_CHAIN_MANAGER', 'STAFF'] } as any;
    const everyone = ['ADMIN', 'MANAGER', 'FINANCE_MANAGER', 'VIEWER', 'SALES', 'SUPPLY_CHAIN_MANAGER', 'STAFF', 'PRODUCTION_MANAGER', 'HR_MANAGER', 'QUALITY_INSPECTOR'];
    for (const type of ['VENDOR_BILL', 'INVOICE']) for (const role of everyone) {
      asRole(role);
      const allowed = roles[type].includes(role);
      expect((await list(type, `own-${type}`)).status === 403, `list ${type} ${role}`).toBe(!allowed);
      expect((await open(made[type])) === 403, `open ${type} ${role}`).toBe(!allowed);
      if (role !== 'VIEWER') expect((await upload(type, `own-${type}`)).status === 403, `upload ${type} ${role}`).toBe(!allowed);
    }
    for (const role of everyone) { asRole(role); expect((await list('WORK_ORDER', 'own-WORK_ORDER')).status, role).toBe(200); }   // ordinary documents are open to every signed-in role
    asAdmin();
  });
});
