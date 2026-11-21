import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

const AVG_CONSULT_MINS = 7;
const EMERGENCY_DELAY_BUFFER_MINS = 10;

interface BookingPayload {
  patient_name?: string;
  name?: string;
  phone?: string;
  age?: number | string;
  gender?: string;
  department?: string;
  symptoms?: string;
  visit_type?: string;
}

interface PendingActionShape {
  type?: string;
  payload?: BookingPayload;
  data?: BookingPayload;
}

interface AgentRequestBody {
  text?: string;
  transcript?: string;
  message?: string;
  intent?: string;
  role?: string;
  language?: string;
  confirm?: boolean;
  pendingAction?: PendingActionShape | null;
  context?: {
    pendingAction?: PendingActionShape | null;
    patient_name?: string;
    name?: string;
    phone?: string;
    age?: number | string;
    gender?: string;
    department?: string;
    symptoms?: string;
    visit_type?: string;
  };
}

function openVaaniDb(): Database.Database {
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'relay.db');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = OFF');

  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      patient_id TEXT,
      patient_name TEXT NOT NULL,
      phone TEXT,
      age INTEGER,
      gender TEXT,
      department TEXT NOT NULL DEFAULT 'General Medicine',
      symptoms TEXT,
      visit_type TEXT DEFAULT 'OPD',
      token_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      estimated_wait_mins INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  return db;
}

function isBookingOrConfirmIntent(rawText: string, explicitIntent?: string, confirmFlag?: boolean): boolean {
  if (
    confirmFlag === true ||
    explicitIntent === 'confirm_action' ||
    explicitIntent === 'confirm_booking' ||
    explicitIntent === 'book_appointment'
  ) {
    return true;
  }

  const normalized = rawText.toLowerCase().trim();
  if (!normalized) return false;

  const triggers = [
    // Roman / Hinglish / English
    'haan confirm',
    'ha confirm',
    'confirm kar do',
    'confirm karo',
    'confirm kardo',
    'confirm',
    'booking kr do',
    'booking kar do',
    'booking karo',
    'book kr do',
    'book kar do',
    'book karo',
    'book kardo',
    'haan book',
    'ha book',
    'yes confirm',
    'yes book',
    'haan',
    'ha',
    'ok',
    'okay',
    'theek hai',
    'thik hai',
    // Devanagari Hindi
    'हां कंफर्म',
    'हां कन्फर्म',
    'कंफर्म कर दो',
    'कन्फर्म कर दो',
    'कंफर्म करो',
    'कन्फर्म करो',
    'बुकिंग कर दो',
    'बुकिंग करो',
    'बुक कर दो',
    'बुक करो',
    'हां बुक',
    'हां',
    'हाँ',
    'ठीक है',
  ];

  return triggers.some((phrase) => normalized === phrase || normalized.includes(phrase));
}

function insertAppointment(payload: BookingPayload) {
  let db: Database.Database | null = null;
  try {
    db = openVaaniDb();

    const patientName = String(payload.patient_name || payload.name || 'Walk-in Patient').trim();
    const phone = String(payload.phone || '').trim() || null;
    const department = String(payload.department || 'General Medicine').trim() || 'General Medicine';
    const symptoms = String(payload.symptoms || 'General consultation').trim() || 'General consultation';
    const visitType = String(payload.visit_type || 'OPD').trim() || 'OPD';
    const rawAge = payload.age !== undefined && payload.age !== null ? Number(payload.age) : NaN;
    const age = Number.isFinite(rawAge) && rawAge > 0 ? Math.floor(rawAge) : null;
    const gender = String(payload.gender || '').trim() || null;

    const maxRow = db
      .prepare('SELECT COALESCE(MAX(token_number), 0) AS maxToken FROM appointments')
      .get() as { maxToken?: number } | undefined;
    const nextToken = Number(maxRow?.maxToken || 0) + 1;

    const waitRow = db
      .prepare("SELECT COUNT(*) AS cnt FROM appointments WHERE status = 'waiting'")
      .get() as { cnt?: number } | undefined;
    const waitingCount = Number(waitRow?.cnt || 0);
    const estimatedWaitMins =
      waitingCount * AVG_CONSULT_MINS + (waitingCount > 0 ? EMERGENCY_DELAY_BUFFER_MINS : 0);

    const id = `apt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const patientId = `pat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const createdAt = new Date().toISOString();

    db.prepare(
      `INSERT INTO appointments (
        id, patient_id, patient_name, phone, age, gender,
        department, symptoms, visit_type, token_number,
        status, estimated_wait_mins, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?)`
    ).run(
      id,
      patientId,
      patientName,
      phone,
      age,
      gender,
      department,
      symptoms,
      visitType,
      nextToken,
      estimatedWaitMins,
      createdAt
    );

    return {
      ok: true as const,
      appointment: {
        id,
        patient_id: patientId,
        patient_name: patientName,
        phone,
        age,
        gender,
        department,
        symptoms,
        visit_type: visitType,
        token_number: nextToken,
        status: 'waiting',
        estimated_wait_mins: estimatedWaitMins,
        created_at: createdAt,
      },
    };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Database booking error',
    };
  } finally {
    db?.close();
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as AgentRequestBody;
    const transcript = String(body.text ?? body.transcript ?? body.message ?? '').trim();
    const role = String(body.role || 'patient').trim();

    const agoraConfig = {
      appId: process.env.NEXT_PUBLIC_AGORA_APP_ID || process.env.AGORA_APP_ID || '',
      maxSessionSeconds: 180,
    };

    if (isBookingOrConfirmIntent(transcript, body.intent, body.confirm)) {
      const mergedPayload: BookingPayload = {
        ...(body.context || {}),
        ...(body.context?.pendingAction?.payload || {}),
        ...(body.context?.pendingAction?.data || {}),
        ...(body.pendingAction?.payload || {}),
        ...(body.pendingAction?.data || {}),
      };

      const result = insertAppointment(mergedPayload);

      if (!result.ok) {
        return NextResponse.json({
          success: true,
          intent: 'confirm_action',
          transcriptHinglish: transcript,
          replyText: `Booking karte waqt dikkat aayi: ${result.error}`,
          audioUrl: null,
          pendingAction: null,
          toolResult: null,
          agoraConfig,
        });
      }

      const apt = result.appointment;
      return NextResponse.json({
        success: true,
        intent: 'confirm_action',
        transcriptHinglish: transcript,
        replyText: `Aapki appointment book ho gayi hai! Token #${apt.token_number} (${apt.patient_name}, ${apt.department}). Aestimated wait ${apt.estimated_wait_mins} minute hai.`,
        audioUrl: null,
        pendingAction: null,
        toolResult: {
          booked: true,
          appointment: apt,
        },
        agoraConfig,
      });
    }

    return NextResponse.json({
      success: true,
      intent: 'general_query',
      transcriptHinglish: transcript,
      replyText:
        role === 'doctor'
          ? 'Namaste Doctor. Queue aur patient status live hai. Kya aap agla patient call karna chahte hain?'
          : 'Namaste! Main Vaani AI hoon. Booking karne ya confirm karne ke liye "booking kar do" ya "haan confirm kar do" boliye ya type kijiye.',
      audioUrl: null,
      pendingAction: {
        type: 'book_appointment',
        payload: {
          department: 'General Medicine',
          visit_type: 'OPD',
        },
      },
      toolResult: null,
      agoraConfig,
    });
  } catch (err) {
    console.error('POST /api/vaani/agent error:', err);
    return NextResponse.json(
      {
        success: false,
        intent: 'error',
        transcriptHinglish: '',
        replyText: `Vaani AI service mein error aaya: ${
          err instanceof Error ? err.message : 'Unexpected error'
        }`,
        audioUrl: null,
        pendingAction: null,
        toolResult: null,
        agoraConfig: {
          appId: '',
          maxSessionSeconds: 180,
        },
      },
      { status: 500 }
    );
  }
}