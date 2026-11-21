import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

const AVG_CONSULT_MINS = 7;
const EMERGENCY_DELAY_BUFFER_MINS = 10;

function openStatusDb(): Database.Database {
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const db = new Database(path.join(dataDir, 'relay.db'));
  db.pragma('foreign_keys = OFF');
  return db;
}

export async function GET(req: Request) {
  let db: Database.Database | null = null;
  try {
    db = openStatusDb();
    const { searchParams } = new URL(req.url);
    const phone = String(searchParams.get('phone') || '').trim();
    const tokenParam = String(searchParams.get('token') || '').trim();

    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='appointments'")
      .get() as { name?: string } | undefined;

    if (!tableExists?.name) {
      return NextResponse.json({
        appointment: null,
        queueAhead: 0,
        estimatedWaitMins: 0,
      });
    }

    let appointment: Record<string, unknown> | undefined;
    if (tokenParam && /^\d+$/.test(tokenParam)) {
      appointment = db
        .prepare('SELECT * FROM appointments WHERE token_number = ? ORDER BY rowid DESC LIMIT 1')
        .get(Number(tokenParam)) as Record<string, unknown> | undefined;
    } else if (phone) {
      appointment = db
        .prepare('SELECT * FROM appointments WHERE phone = ? ORDER BY rowid DESC LIMIT 1')
        .get(phone) as Record<string, unknown> | undefined;
    } else {
      appointment = db
        .prepare("SELECT * FROM appointments WHERE status IN ('waiting', 'in_progress') ORDER BY token_number ASC LIMIT 1")
        .get() as Record<string, unknown> | undefined;
    }

    if (!appointment) {
      return NextResponse.json({
        appointment: null,
        queueAhead: 0,
        estimatedWaitMins: 0,
      });
    }

    const tokenNumber = Number(appointment.token_number || 0);
    const aheadRow = db
      .prepare("SELECT COUNT(*) as cnt FROM appointments WHERE status = 'waiting' AND token_number < ?")
      .get(tokenNumber) as { cnt?: number } | undefined;

    const queueAhead = Number(aheadRow?.cnt || 0);
    const estimatedWaitMins =
      appointment.status === 'completed'
        ? 0
        : queueAhead * AVG_CONSULT_MINS + (queueAhead > 0 ? EMERGENCY_DELAY_BUFFER_MINS : 0);

    return NextResponse.json({
      appointment,
      queueAhead,
      estimatedWaitMins,
    });
  } catch (err) {
    console.error('GET /api/vaani/patient-status error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch patient status' },
      { status: 500 }
    );
  } finally {
    db?.close();
  }
}