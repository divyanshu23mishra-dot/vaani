import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data/relay.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS doctors (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    location TEXT NOT NULL,
    languages TEXT NOT NULL DEFAULT 'English, Hindi',
    phone TEXT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avg_consultation_min INTEGER NOT NULL DEFAULT 10,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    dob TEXT,
    language_pref TEXT NOT NULL DEFAULT 'Hindi',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    patient_id TEXT NOT NULL REFERENCES patients(id),
    doctor_id TEXT NOT NULL REFERENCES doctors(id),
    token_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting'
      CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled', 'emergency_delayed')),
    chief_complaint TEXT NOT NULL,
    symptoms TEXT,
    booking_method TEXT DEFAULT 'voice' CHECK (booking_method IN ('voice', 'text')),
    booked_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS consultations (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    appointment_id TEXT NOT NULL REFERENCES appointments(id),
    agora_channel TEXT NOT NULL,
    recording_url TEXT,
    transcript TEXT,
    raw_ai_report TEXT,
    edited_report TEXT,
    report_approved INTEGER NOT NULL DEFAULT 0,
    approved_at TEXT,
    pdf_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS prescriptions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    consultation_id TEXT NOT NULL REFERENCES consultations(id),
    doctor_id TEXT NOT NULL REFERENCES doctors(id),
    patient_id TEXT NOT NULL REFERENCES patients(id),
    medications TEXT NOT NULL,
    instructions TEXT,
    pharmacy_contact TEXT,
    dispatch_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (dispatch_status IN ('pending', 'demo_simulated', 'sent', 'failed')),
    dispatch_note TEXT,
    dispatched_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS patient_reports (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    patient_id TEXT NOT NULL REFERENCES patients(id),
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS queue_events (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    doctor_id TEXT NOT NULL REFERENCES doctors(id),
    event_type TEXT NOT NULL
      CHECK (event_type IN ('emergency_added', 'appointment_started', 'appointment_completed', 'queue_paused', 'queue_resumed')),
    affected_token INTEGER,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_appointments_doctor_status
    ON appointments (doctor_id, status, token_number);

  CREATE INDEX IF NOT EXISTS idx_appointments_patient
    ON appointments (patient_id);

  CREATE INDEX IF NOT EXISTS idx_consultations_appointment
    ON consultations (appointment_id);
`);

console.log('Vaani migration completed successfully.');