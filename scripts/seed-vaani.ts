import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data/relay.db');
const db = new Database(dbPath);

async function seed() {
  const passwordHash = await bcrypt.hash('Doctor@123', 10);

  db.prepare(`
    INSERT OR IGNORE INTO doctors (id, name, specialty, location, languages, phone, email, password_hash, avg_consultation_min, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    'doc-vaani-1',
    'Dr. Aarav Sharma',
    'General Medicine',
    'Bengaluru OPD',
    'English, Hindi, Kannada',
    '+919876543210',
    'doctor@vaani.local',
    passwordHash,
    10
  );

  db.prepare(`
    INSERT OR IGNORE INTO patients (id, name, phone, dob, language_pref)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'pat-vaani-1',
    'Rohan Verma',
    '+919811122233',
    '1998-04-12',
    'Hindi'
  );

  db.prepare(`
    INSERT OR IGNORE INTO appointments (id, patient_id, doctor_id, token_number, status, chief_complaint, symptoms, booking_method)
    VALUES (?, ?, ?, ?, 'waiting', ?, ?, 'text')
  `).run(
    'apt-vaani-1',
    'pat-vaani-1',
    'doc-vaani-1',
    1,
    'Fever and body ache for 2 days',
    'Mild fever, headache'
  );

  console.log('Vaani seed completed. Login: doctor@vaani.local / Doctor@123');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});