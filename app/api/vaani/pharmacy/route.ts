import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

function openRelayDb(): Database.Database {
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'relay.db');
  const db = new Database(dbPath);

  db.pragma('foreign_keys = OFF');

  db.exec(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      id TEXT PRIMARY KEY,
      consultation_id TEXT,
      appointment_id TEXT,
      token_number INTEGER,
      patient_name TEXT,
      patient_phone TEXT,
      doctor_name TEXT NOT NULL DEFAULT 'Dr. Aarav Sharma',
      medicines TEXT NOT NULL,
      notes TEXT,
      pharmacy_status TEXT NOT NULL DEFAULT 'in_queue',
      created_at TEXT NOT NULL
    )
  `);

  const cols = db.prepare(`PRAGMA table_info(prescriptions)`).all() as Array<{ name: string }>;
  const existing = new Set(cols.map((c) => c.name));

  const optionalCols: Array<[string, string]> = [
    ['consultation_id', 'TEXT'],
    ['appointment_id', 'TEXT'],
    ['token_number', 'INTEGER'],
    ['patient_name', 'TEXT'],
    ['patient_phone', 'TEXT'],
    ['doctor_name', "TEXT DEFAULT 'Dr. Aarav Sharma'"],
    ['medicines', 'TEXT'],
    ['notes', 'TEXT'],
    ['pharmacy_status', "TEXT DEFAULT 'in_queue'"],
    ['created_at', 'TEXT'],
  ];

  for (const [colName, colDef] of optionalCols) {
    if (!existing.has(colName)) {
      try {
        db.exec(`ALTER TABLE prescriptions ADD COLUMN ${colName} ${colDef}`);
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

function resolveConsultationId(
  db: Database.Database,
  body: Record<string, unknown>,
  appointmentId: string
): string {
  const explicit = String(body?.consultationId ?? body?.consultation_id ?? '').trim();
  if (explicit) return explicit;

  const consCols = getTableColumns(db, 'consultations');
  if (consCols.length > 0) {
    try {
      const hasAptCol = consCols.some((c) => c.name === 'appointment_id');
      if (appointmentId && hasAptCol) {
        const matchRow = db
          .prepare('SELECT id FROM consultations WHERE appointment_id = ? ORDER BY rowid DESC LIMIT 1')
          .get(appointmentId) as { id?: string } | undefined;
        if (matchRow?.id) return String(matchRow.id);
      }
      const latestCons = db
        .prepare('SELECT id FROM consultations ORDER BY rowid DESC LIMIT 1')
        .get() as { id?: string } | undefined;
      if (latestCons?.id) return String(latestCons.id);
    } catch {
      // ignore if consultations schema differs
    }
  }

  return appointmentId ? `cons_${appointmentId}` : `cons_${crypto.randomUUID()}`;
}

function resolveAppointmentMeta(
  db: Database.Database,
  requestedAptId: string,
  requestedToken: number
): {
  id: string;
  tokenNumber: number | null;
  patientName: string;
  patientPhone: string;
} {
  const aptCols = getTableColumns(db, 'appointments');
  if (aptCols.length === 0) {
    return {
      id: requestedAptId,
      tokenNumber: requestedToken > 0 ? requestedToken : null,
      patientName: 'OPD Patient',
      patientPhone: '',
    };
  }

  const colNames = new Set(aptCols.map((c) => c.name));
  const selectParts = ['id'];
  if (colNames.has('token_number')) selectParts.push('token_number');
  if (colNames.has('patient_name')) selectParts.push('patient_name');
  else if (colNames.has('name')) selectParts.push('name AS patient_name');
  if (colNames.has('patient_phone')) selectParts.push('patient_phone');
  else if (colNames.has('phone')) selectParts.push('phone AS patient_phone');

  const baseSelect = `SELECT ${selectParts.join(', ')} FROM appointments`;
  let row: Record<string, unknown> | undefined;

  try {
    if (requestedAptId) {
      row = db.prepare(`${baseSelect} WHERE id = ?`).get(requestedAptId) as
        | Record<string, unknown>
        | undefined;
    }
    if (!row && requestedToken > 0 && colNames.has('token_number')) {
      row = db
        .prepare(`${baseSelect} WHERE token_number = ? ORDER BY rowid DESC LIMIT 1`)
        .get(requestedToken) as Record<string, unknown> | undefined;
    }
    if (!row && colNames.has('status')) {
      row = db
        .prepare(`${baseSelect} WHERE status = 'in_progress' ORDER BY rowid DESC LIMIT 1`)
        .get() as Record<string, unknown> | undefined;
    }
    if (!row) {
      row = db.prepare(`${baseSelect} ORDER BY rowid DESC LIMIT 1`).get() as
        | Record<string, unknown>
        | undefined;
    }
  } catch {
    row = undefined;
  }

  return {
    id: String(row?.id || requestedAptId || ''),
    tokenNumber:
      Number(row?.token_number || requestedToken || 0) > 0
        ? Number(row?.token_number || requestedToken)
        : null,
    patientName: String(row?.patient_name || 'OPD Patient').trim() || 'OPD Patient',
    patientPhone: String(row?.patient_phone || '').trim(),
  };
}

export async function GET(req: Request) {
  const db = openRelayDb();
  try {
    const { searchParams } = new URL(req.url);
    const phoneFilter = String(searchParams.get('phone') || '').replace(/\D/g, '');
    const tokenFilter = String(searchParams.get('token') || '').replace(/\D/g, '');

    const rxCols = getTableColumns(db, 'prescriptions');
    const rxColSet = new Set(rxCols.map((c) => c.name));
    const aptCols = getTableColumns(db, 'appointments');
    const aptColSet = new Set(aptCols.map((c) => c.name));

    const hasAptIdCol = rxColSet.has('appointment_id');
    const canJoinApt = hasAptIdCol && aptColSet.size > 0;

    const pPrefix = canJoinApt ? 'p.' : '';
    const tokenCol = rxColSet.has('token_number')
      ? canJoinApt && aptColSet.has('token_number')
        ? `COALESCE(${pPrefix}token_number, a.token_number)`
        : `${pPrefix}token_number`
      : canJoinApt && aptColSet.has('token_number')
      ? 'a.token_number'
      : 'NULL';

    const nameCol = rxColSet.has('patient_name')
      ? canJoinApt && aptColSet.has('patient_name')
        ? `COALESCE(NULLIF(${pPrefix}patient_name, ''), a.patient_name, 'OPD Patient')`
        : canJoinApt && aptColSet.has('name')
        ? `COALESCE(NULLIF(${pPrefix}patient_name, ''), a.name, 'OPD Patient')`
        : `COALESCE(NULLIF(${pPrefix}patient_name, ''), 'OPD Patient')`
      : `'OPD Patient'`;

    const phoneCol = rxColSet.has('patient_phone')
      ? canJoinApt && aptColSet.has('patient_phone')
        ? `COALESCE(NULLIF(${pPrefix}patient_phone, ''), a.patient_phone, '')`
        : canJoinApt && aptColSet.has('phone')
        ? `COALESCE(NULLIF(${pPrefix}patient_phone, ''), a.phone, '')`
        : `COALESCE(${pPrefix}patient_phone, '')`
      : `''`;

    const doctorCol = rxColSet.has('doctor_name')
      ? `COALESCE(NULLIF(${pPrefix}doctor_name, ''), 'Dr. Aarav Sharma')`
      : `'Dr. Aarav Sharma'`;

    const medCol = rxColSet.has('medicines')
      ? `${pPrefix}medicines`
      : rxColSet.has('prescription')
      ? `${pPrefix}prescription`
      : `''`;

    const notesCol = rxColSet.has('notes') ? `${pPrefix}notes` : `''`;

    const statusCol = rxColSet.has('pharmacy_status')
      ? `COALESCE(NULLIF(${pPrefix}pharmacy_status, ''), 'in_queue')`
      : rxColSet.has('status')
      ? `COALESCE(NULLIF(${pPrefix}status, ''), 'in_queue')`
      : `'in_queue'`;

    const createdCol = rxColSet.has('created_at') ? `${pPrefix}created_at` : `''`;
    const aptIdCol = rxColSet.has('appointment_id') ? `${pPrefix}appointment_id` : `''`;

    const query = canJoinApt
      ? `SELECT
          p.id,
          ${aptIdCol ? `${aptIdCol} AS appointment_id,` : `'' AS appointment_id,`}
          ${tokenCol} AS token_number,
          ${nameCol} AS patient_name,
          ${phoneCol} AS patient_phone,
          ${doctorCol} AS doctor_name,
          ${medCol} AS medicines,
          ${notesCol} AS notes,
          ${statusCol} AS pharmacy_status,
          ${createdCol ? `${createdCol} AS created_at` : `'' AS created_at`}
        FROM prescriptions p
        LEFT JOIN appointments a ON p.appointment_id = a.id
        ORDER BY p.rowid DESC`
      : `SELECT
          id,
          ${aptIdCol ? `${aptIdCol} AS appointment_id,` : `'' AS appointment_id,`}
          ${tokenCol} AS token_number,
          ${nameCol} AS patient_name,
          ${phoneCol} AS patient_phone,
          ${doctorCol} AS doctor_name,
          ${medCol} AS medicines,
          ${notesCol} AS notes,
          ${statusCol} AS pharmacy_status,
          ${createdCol ? `${createdCol} AS created_at` : `'' AS created_at`}
        FROM prescriptions
        ORDER BY rowid DESC`;

    let rows = db.prepare(query).all() as Array<Record<string, unknown>>;

    if (tokenFilter) {
      rows = rows.filter((r) => String(r.token_number ?? '') === tokenFilter);
    } else if (phoneFilter.length >= 6) {
      rows = rows.filter((r) =>
        String(r.patient_phone ?? '').replace(/\D/g, '').includes(phoneFilter)
      );
    }

    return NextResponse.json({
      success: true,
      prescriptions: rows,
      items: rows,
    });
  } catch (err) {
    console.error('GET /api/vaani/pharmacy error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch pharmacy queue' },
      { status: 500 }
    );
  } finally {
    db.close();
  }
}

export async function POST(req: Request) {
  const db = openRelayDb();
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const medicines = String(
      body?.medicines ?? body?.prescription ?? body?.adviceText ?? ''
    ).trim();

    if (!medicines) {
      return NextResponse.json(
        { error: 'Medicines text is required to send to pharmacy queue.' },
        { status: 400 }
      );
    }

    const requestedAptId = String(body?.appointmentId ?? body?.appointment_id ?? '').trim();
    const requestedToken = Number(body?.tokenNumber ?? body?.token_number ?? 0);
    const aptMeta = resolveAppointmentMeta(db, requestedAptId, requestedToken);
    const consultationId = resolveConsultationId(db, body, aptMeta.id);

    const id = `rx_${crypto.randomUUID()}`;
    const tokenNumber = requestedToken > 0 ? requestedToken : aptMeta.tokenNumber;
    const patientName = String(body?.patientName || aptMeta.patientName || 'OPD Patient').trim();
    const patientPhone = String(body?.patientPhone || aptMeta.patientPhone || '').trim();
    const doctorName = String(body?.doctorName || 'Dr. Aarav Sharma').trim();
    const notes = String(body?.notes || 'Doctor prescription').trim();
    const createdAt = new Date().toISOString();

    const incomingStatus = String(body?.pharmacyStatus || body?.status || 'in_queue')
      .toLowerCase()
      .trim();
    const pharmacyStatus =
      incomingStatus === 'ready' ||
      incomingStatus === 'preparing' ||
      incomingStatus === 'in_queue'
        ? incomingStatus
        : 'in_queue';

    const rxCols = getTableColumns(db, 'prescriptions');

    const valueMap: Record<string, unknown> = {
      id,
      consultation_id: consultationId,
      appointment_id: aptMeta.id || null,
      token_number: tokenNumber,
      patient_name: patientName,
      patient_phone: patientPhone,
      doctor_name: doctorName,
      medicines,
      prescription: medicines,
      notes,
      pharmacy_status: pharmacyStatus,
      status: pharmacyStatus,
      created_at: createdAt,
    };

    const insertCols: string[] = [];
    const insertVals: unknown[] = [];

    for (const col of rxCols) {
      if (col.name in valueMap) {
        insertCols.push(col.name);
        insertVals.push(valueMap[col.name]);
      } else if (col.notnull === 1 && col.dflt_value === null) {
        insertCols.push(col.name);
        insertVals.push(`auto_${crypto.randomUUID().slice(0, 8)}`);
      }
    }

    const placeholders = insertCols.map(() => '?').join(', ');
    db.prepare(
      `INSERT INTO prescriptions (${insertCols.join(', ')}) VALUES (${placeholders})`
    ).run(...insertVals);

    const created = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(id);

    return NextResponse.json(
      {
        success: true,
        id,
        consultationId,
        tokenNumber,
        prescription: created,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/vaani/pharmacy error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save prescription' },
      { status: 500 }
    );
  } finally {
    db.close();
  }
}