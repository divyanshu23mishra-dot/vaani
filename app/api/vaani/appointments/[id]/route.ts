import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

function openRelayDb(): Database.Database {
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const db = new Database(path.join(dataDir, 'relay.db'));
  db.pragma('foreign_keys = OFF');
  return db;
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const db = openRelayDb();
  try {
    const resolvedParams = await Promise.resolve(context.params);
    const idOrToken = decodeURIComponent(String(resolvedParams?.id || '')).trim();

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const status = String(body?.status || '').trim().toLowerCase();

    const allowed = new Set(['waiting', 'in_progress', 'completed', 'cancelled']);
    if (!allowed.has(status)) {
      return NextResponse.json(
        { error: `Invalid status "${status}". Allowed: waiting, in_progress, completed, cancelled.` },
        { status: 400 }
      );
    }

    if (!idOrToken) {
      return NextResponse.json({ error: 'Appointment ID is required.' }, { status: 400 });
    }

    // Update by primary id first, fallback to token_number if numeric
    let result = db
      .prepare('UPDATE appointments SET status = ? WHERE id = ?')
      .run(status, idOrToken);

    if (result.changes === 0 && /^\d+$/.test(idOrToken)) {
      result = db
        .prepare('UPDATE appointments SET status = ? WHERE token_number = ?')
        .run(status, Number(idOrToken));
    }

    if (result.changes === 0) {
      return NextResponse.json(
        { error: `Appointment "${idOrToken}" not found in database.` },
        { status: 404 }
      );
    }

    // Recalculate estimated_wait_mins for remaining waiting tokens
    const waitingRows = db
      .prepare("SELECT id FROM appointments WHERE status = 'waiting' ORDER BY token_number ASC, rowid ASC")
      .all() as Array<{ id: string }>;

    const updateWaitStmt = db.prepare('UPDATE appointments SET estimated_wait_mins = ? WHERE id = ?');
    waitingRows.forEach((row, index) => {
      updateWaitStmt.run(index * 8, row.id);
    });

    const updated =
      db.prepare('SELECT * FROM appointments WHERE id = ?').get(idOrToken) ||
      (/^\d+$/.test(idOrToken)
        ? db.prepare('SELECT * FROM appointments WHERE token_number = ?').get(Number(idOrToken))
        : null);

    return NextResponse.json({
      success: true,
      appointment: updated,
    });
  } catch (err) {
    console.error('PATCH /api/vaani/appointments/[id] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update appointment status' },
      { status: 500 }
    );
  } finally {
    db.close();
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const db = openRelayDb();
  try {
    const resolvedParams = await Promise.resolve(context.params);
    const idOrToken = decodeURIComponent(String(resolvedParams?.id || '')).trim();
    if (!idOrToken) {
      return NextResponse.json({ error: 'Appointment ID is required.' }, { status: 400 });
    }

    db.prepare('DELETE FROM appointments WHERE id = ?').run(idOrToken);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete appointment' },
      { status: 500 }
    );
  } finally {
    db.close();
  }
}