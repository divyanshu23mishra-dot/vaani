import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data/relay.db');
const db = new Database(dbPath);

const AVG_CONSULT_MINS = 7;
const EMERGENCY_DELAY_BUFFER_MINS = 10;

interface AptRow {
  id: string;
  doctor_id: string;
  token_number: number;
  status: 'waiting' | 'in_progress' | 'completed' | 'cancelled' | 'emergency_delayed';
  chief_complaint: string;
  patient_name: string | null;
  patient_phone: string | null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const digits = String(searchParams.get('phone') || '').replace(/\D/g, '');

    if (digits.length !== 10) {
      return NextResponse.json(
        { error: 'Please enter a valid 10-digit mobile number' },
        { status: 400 }
      );
    }

    const allRows = db
      .prepare(
        `SELECT
          a.id,
          a.doctor_id,
          a.token_number,
          a.status,
          a.chief_complaint,
          p.name AS patient_name,
          p.phone AS patient_phone
        FROM appointments a
        LEFT JOIN patients p ON p.id = a.patient_id
        ORDER BY a.token_number ASC`
      )
      .all() as AptRow[];

    const hasEmergencyDelay = allRows.some((r) => r.status === 'emergency_delayed');
    let ahead = 0;

    const withEstimates = allRows.map((row) => {
      if (row.status === 'completed' || row.status === 'cancelled') {
        return { ...row, patients_ahead: 0, estimated_wait_mins: 0 };
      }
      if (row.status === 'in_progress') {
        ahead += 1;
        return { ...row, patients_ahead: 0, estimated_wait_mins: 0 };
      }
      const patientsAhead = ahead;
      const waitMins =
        patientsAhead * AVG_CONSULT_MINS + (hasEmergencyDelay ? EMERGENCY_DELAY_BUFFER_MINS : 0);
      if (row.status === 'waiting' || row.status === 'emergency_delayed') {
        ahead += 1;
      }
      return { ...row, patients_ahead: patientsAhead, estimated_wait_mins: waitMins };
    });

    const matched = withEstimates.filter((r) => {
      const pDigits = String(r.patient_phone || '').replace(/\D/g, '');
      return pDigits.endsWith(digits);
    });

    const hasRxTable = Boolean(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='prescriptions'")
        .get()
    );

    let prescriptions: unknown[] = [];
    if (hasRxTable && matched.length > 0) {
      const rxCols = new Set(
        (db.prepare('PRAGMA table_info(prescriptions)').all() as Array<{ name: string }>).map(
          (c) => c.name
        )
      );
      if (rxCols.has('appointment_id')) {
        const ids = matched.map((m) => m.id);
        const placeholders = ids.map(() => '?').join(', ');
        prescriptions = db
          .prepare(
            `SELECT
              pr.id,
              pr.appointment_id,
              pr.medicines,
              ${rxCols.has('notes') ? 'pr.notes' : 'NULL AS notes'},
              ${
                rxCols.has('pharmacy_status')
                  ? "COALESCE(pr.pharmacy_status, 'pending')"
                  : "'pending'"
              } AS pharmacy_status,
              a.token_number
            FROM prescriptions pr
            LEFT JOIN appointments a ON a.id = pr.appointment_id
            WHERE pr.appointment_id IN (${placeholders})
            ORDER BY pr.rowid DESC`
          )
          .all(...ids);
      }
    }

    return NextResponse.json({
      success: true,
      appointments: matched,
      prescriptions,
    });
  } catch (err) {
    console.error('Patient status error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}