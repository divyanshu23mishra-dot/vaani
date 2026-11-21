import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

function getDb() {
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return new Database(path.join(dataDir, 'relay.db'));
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const db = getDb();
  try {
    const resolvedParams = await Promise.resolve(context.params);
    const id = String(resolvedParams?.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'Prescription ID is required' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const rawStatus = String(body?.pharmacyStatus ?? body?.status ?? '')
      .toLowerCase()
      .trim();

    const allowed = new Set(['in_queue', 'preparing', 'ready']);
    if (!allowed.has(rawStatus)) {
      return NextResponse.json(
        { error: 'Invalid status. Allowed: in_queue, preparing, ready' },
        { status: 400 }
      );
    }

    const existing = db.prepare('SELECT id FROM prescriptions WHERE id = ?').get(id);
    if (!existing) {
      return NextResponse.json({ error: 'Prescription not found' }, { status: 404 });
    }

    db.prepare('UPDATE prescriptions SET pharmacy_status = ? WHERE id = ?').run(rawStatus, id);

    const updated = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(id);
    return NextResponse.json({
      success: true,
      prescription: updated,
    });
  } catch (err) {
    console.error('PATCH /api/vaani/pharmacy/[id] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update pharmacy status' },
      { status: 500 }
    );
  } finally {
    db.close();
  }
}