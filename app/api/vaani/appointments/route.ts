import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

function openAppointmentsDb(): Database.Database {
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const db = new Database(path.join(dataDir, 'relay.db'));
  db.pragma('foreign_keys = OFF');

  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      patient_id TEXT,
      token_number INTEGER NOT NULL DEFAULT 1,
      patient_name TEXT NOT NULL DEFAULT 'OPD Patient',
      patient_phone TEXT NOT NULL DEFAULT '',
      language_pref TEXT NOT NULL DEFAULT 'hinglish',
      chief_complaint TEXT NOT NULL DEFAULT 'General checkup',
      symptoms TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'waiting',
      estimated_wait_mins INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  const cols = db.prepare(`PRAGMA table_info(appointments)`).all() as Array<{ name: string }>;
  const existing = new Set(cols.map((c) => c.name));

  const required: Array<[string, string]> = [
    ['patient_id', 'TEXT'],
    ['token_number', 'INTEGER DEFAULT 1'],
    ['patient_name', "TEXT DEFAULT 'OPD Patient'"],
    ['patient_phone', "TEXT DEFAULT ''"],
    ['language_pref', "TEXT DEFAULT 'hinglish'"],
    ['chief_complaint', "TEXT DEFAULT 'General checkup'"],
    ['symptoms', "TEXT DEFAULT ''"],
    ['status', "TEXT DEFAULT 'waiting'"],
    ['estimated_wait_mins', 'INTEGER DEFAULT 0'],
    ['created_at', 'TEXT'],
  ];

  for (const [colName, colDef] of required) {
    if (!existing.has(colName)) {
      try {
        db.exec(`ALTER TABLE appointments ADD COLUMN ${colName} ${colDef}`);
      } catch {
        // ignore if already exists
      }
    }
  }

  return db;
}

function getTableColumns(
  db: Database.Database,
  tableName: string
): Array<{
  name: string;
  notnull: number;
  dflt_value: string | null;
}> {
  try {
    const exists = Boolean(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
        .get(tableName)
    );
    if (!exists) return [];
    return db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }>;
  } catch {
    return [];
  }
}

function resolvePatientId(
  db: Database.Database,
  body: Record<string, unknown>,
  patientName: string,
  patientPhone: string
): string {
  const explicit = String(body?.patientId ?? body?.patient_id ?? '').trim();
  if (explicit) return explicit;

  const pCols = getTableColumns(db, 'patients');
  if (pCols.length > 0) {
    try {
      const pColSet = new Set(pCols.map((c) => c.name));
      const cleanPhone = patientPhone.replace(/\D/g, '');

      if (cleanPhone && pColSet.has('phone')) {
        const existingByPhone = db
          .prepare('SELECT id FROM patients WHERE phone = ? ORDER BY rowid DESC LIMIT 1')
          .get(cleanPhone) as { id?: string } | undefined;
        if (existingByPhone?.id) return String(existingByPhone.id);
      }

      if (cleanPhone && pColSet.has('patient_phone')) {
        const existingByPatientPhone = db
          .prepare('SELECT id FROM patients WHERE patient_phone = ? ORDER BY rowid DESC LIMIT 1')
          .get(cleanPhone) as { id?: string } | undefined;
        if (existingByPatientPhone?.id) return String(existingByPatientPhone.id);
      }

      const newPatientId = `pat_${crypto.randomUUID()}`;
      const pValues: Record<string, unknown> = {
        id: newPatientId,
        name: patientName,
        patient_name: patientName,
        phone: cleanPhone || patientPhone,
        patient_phone: cleanPhone || patientPhone,
        created_at: new Date().toISOString(),
      };

      const insertCols: string[] = [];
      const insertVals: unknown[] = [];

      for (const col of pCols) {
        if (col.name in pValues) {
          insertCols.push(col.name);
          insertVals.push(pValues[col.name]);
        } else if (col.notnull === 1 && col.dflt_value === null) {
          insertCols.push(col.name);
          insertVals.push(`auto_${crypto.randomUUID().slice(0, 8)}`);
        }
      }

      if (insertCols.includes('id')) {
        db.prepare(
          `INSERT INTO patients (${insertCols.join(', ')}) VALUES (${insertCols
            .map(() => '?')
            .join(', ')})`
        ).run(...insertVals);
        return newPatientId;
      }
    } catch {
      // fallback if patients schema differs
    }
  }

  return `pat_${crypto.randomUUID()}`;
}

export async function GET() {
  const db = openAppointmentsDb();
  try {
    const appointments = db
      .prepare('SELECT * FROM appointments ORDER BY rowid DESC')
      .all() as Array<Record<string, unknown>>;

    const waitingCount = appointments.filter((a) => a.status === 'waiting').length;
    const avgConsultationMins = 8;

    return NextResponse.json({
      success: true,
      appointments,
      avgConsultationMins,
      delayBufferMins: 0,
      waitingCount,
    });
  } catch (err) {
    console.error('GET /api/vaani/appointments error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch appointments' },
      { status: 500 }
    );
  } finally {
    db.close();
  }
}

export async function POST(req: Request) {
  const db = openAppointmentsDb();
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const patientName =
      String(body?.patientName ?? body?.patient_name ?? body?.name ?? 'OPD Patient').trim() ||
      'OPD Patient';
    const patientPhone = String(
      body?.patientPhone ?? body?.patient_phone ?? body?.phone ?? ''
    ).trim();
    const languagePref =
      String(body?.languagePref ?? body?.language_pref ?? 'hinglish').trim() || 'hinglish';
    const chiefComplaint =
      String(
        body?.chiefComplaint ?? body?.chief_complaint ?? body?.complaint ?? 'General checkup'
      ).trim() || 'General checkup';
    const symptoms = String(body?.symptoms ?? chiefComplaint).trim();
    const doctorName = String(body?.doctorName ?? body?.doctor_name ?? 'Dr. Aarav Sharma').trim();
    const slotTime = String(body?.slotTime ?? body?.slot_time ?? '').trim();

    const patientId = resolvePatientId(db, body, patientName, patientPhone);

    const maxRow = db
      .prepare('SELECT COALESCE(MAX(token_number), 0) AS max_token FROM appointments')
      .get() as { max_token?: number } | undefined;

    const nextToken = Number(maxRow?.max_token || 0) + 1;
    const waitingCount =
      (
        db.prepare("SELECT COUNT(*) AS cnt FROM appointments WHERE status = 'waiting'").get() as {
          cnt?: number;
        }
      )?.cnt || 0;

    const estimatedWaitMins = waitingCount * 8;
    const id = `apt_${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();

    const aptCols = getTableColumns(db, 'appointments');
    const valueMap: Record<string, unknown> = {
      id,
      patient_id: patientId,
      token_number: nextToken,
      patient_name: patientName,
      name: patientName,
      patient_phone: patientPhone,
      phone: patientPhone,
      language_pref: languagePref,
      chief_complaint: chiefComplaint,
      complaint: chiefComplaint,
      symptoms,
      doctor_name: doctorName,
      slot_time: slotTime,
      status: 'waiting',
      estimated_wait_mins: estimatedWaitMins,
      created_at: createdAt,
    };

    const insertCols: string[] = [];
    const insertVals: unknown[] = [];

    for (const col of aptCols) {
      if (col.name in valueMap) {
        insertCols.push(col.name);
        insertVals.push(valueMap[col.name]);
      } else if (col.notnull === 1 && col.dflt_value === null) {
        insertCols.push(col.name);
        insertVals.push(`auto_${crypto.randomUUID().slice(0, 8)}`);
      }
    }

    db.prepare(
      `INSERT INTO appointments (${insertCols.join(', ')}) VALUES (${insertCols
        .map(() => '?')
        .join(', ')})`
    ).run(...insertVals);

    const created = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);

    return NextResponse.json(
      {
        success: true,
        id,
        patientId,
        tokenNumber: nextToken,
        estimatedWaitMins,
        appointment: created,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/vaani/appointments error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create appointment' },
      { status: 500 }
    );
  } finally {
    db.close();
  }
}