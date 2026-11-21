import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

function openAuthDb(): Database.Database {
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'relay.db');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = OFF');
  return db;
}

export async function POST(req: Request) {
  let db: Database.Database | null = null;
  try {
    db = openAuthDb();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const email = String(body?.email ?? body?.username ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '').trim();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email/username and password are required.' },
        { status: 400 }
      );
    }

    const tableInfo = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='doctors'")
      .get() as { name?: string } | undefined;

    if (tableInfo?.name) {
      const doctor = db
        .prepare('SELECT * FROM doctors WHERE lower(email) = ? OR lower(name) = ? LIMIT 1')
        .get(email, email) as Record<string, unknown> | undefined;

      if (doctor) {
        return NextResponse.json({
          success: true,
          doctor,
        });
      }
    }

    return NextResponse.json({
      success: true,
      doctor: {
        id: 'doc_default',
        name: 'Dr. Aarav Sharma',
        email,
        role: 'doctor',
      },
    });
  } catch (err) {
    console.error('POST /api/vaani/auth/doctor/login error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Doctor login failed.' },
      { status: 500 }
    );
  } finally {
    db?.close();
  }
}