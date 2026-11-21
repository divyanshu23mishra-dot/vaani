import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

const AVG_CONSULT_MINS = 7;
const EMERGENCY_DELAY_BUFFER_MINS = 10;

interface PendingBookingPayload {
  patient_name?: string;
  name?: string;
  phone?: string;
  age?: number | string;
  gender?: string;
  department?: string;
  symptoms?: string;
  visit_type?: string;
}

interface AgentRequestBody {
  text?: string;
  transcript?: string;
  message?: string;
  intent?: string;
  role?: string;
  language?: string;
  pendingAction?: {
    type?: string;
    payload?: PendingBookingPayload;
    data?: PendingBookingPayload;
  } | null;
  context?: {
    pendingAction?: {
      type?: string;
      payload?: PendingBookingPayload;
      data?: PendingBookingPayload;
    } | null;
    patient_name?: string;
    name?: string;
    phone?: string;
    department?: string;
    symptoms?: string;
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

function isConfirmIntent(rawText: string, explicitIntent?: string): boolean {
  if (explicitIntent === 'confirm_action' || explicitIntent === 'confirm_booking') {
    return true;
  }
  const normalized = rawText.toLowerCase().trim();
  return [
    'haan confirm',
    'confirm kar do',
    'confirm karo',
    'haan pakka',
    'book kar do',
    'book karo',
    'haan book',
    'yes confirm',
    'confirm',
    'haan',
    'ha',
    'ok book',
    'theek hai confirm',
  ].some((phrase) => normalized === phrase || normalized.includes(phrase));
}

function createAppointmentDirectly(payload: PendingBookingPayload) {
  let db: Database.Database | null = null;
  try {
    db = openVaaniDb();

    const patientName = String(
      payload.patient_name || payload.name || 'Walk-in Patient'
    ).trim();
    const phone = String(payload.phone || '').trim() || null;
    const department = String(payload.department || 'General Medicine').trim();
    const symptoms = String(payload.symptoms || 'General consultation').trim();
    const visitType = String(payload.visit_type || 'OPD').trim();
    const parsedAge =
      payload.age !== undefined && payload.age !== null && String(payload.age).trim() !== ''
        ? Number(payload.age)
        : null;
    const gender = String(payload.gender || '').trim() || null;

    const maxTokenRow = db
      .prepare('SELECT COALESCE(MAX(token_number), 0) AS maxToken FROM appointments')
      .get() as { maxToken?: number } | undefined;

    const nextToken = Number(maxTokenRow?.maxToken || 0) + 1;

    const waitingCountRow = db
      .prepare("SELECT COUNT(*) AS cnt FROM appointments WHERE status = 'waiting'")
      .get() as { cnt?: number } | undefined;

    const waitingCount = Number(waitingCountRow?.cnt || 0);
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
      Number.isFinite(parsedAge as number) ? parsedAge : null,
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
        department,
        symptoms,
        token_number: nextToken,
        status: 'waiting',
        estimated_wait_mins: estimatedWaitMins,
        created_at: createdAt,
      },
    };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown database error',
    };
  } finally {
    db?.close();
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as AgentRequestBody;
    const transcript = String(
      body.text ?? body.transcript ?? body.message ?? ''
    ).trim();
    const role = String(body.role || 'patient').trim();

    const agoraConfig = {
      appId: process.env.NEXT_PUBLIC_AGORA_APP_ID || process.env.AGORA_APP_ID || '',
      maxSessionSeconds: 180,
    };

    if (isConfirmIntent(transcript, body.intent)) {
      const pendingPayload: PendingBookingPayload = {
        ...(body.context || {}),
        ...(body.pendingAction?.payload || {}),
        ...(body.pendingAction?.data || {}),
        ...(body.context?.pendingAction?.payload || {}),
        ...(body.context?.pendingAction?.data || {}),
      };

      const bookingRes = createAppointmentDirectly(pendingPayload);

      if (!bookingRes.ok) {
        return NextResponse.json({
          success: true,
          intent: 'confirm_action',
          transcriptHinglish: transcript,
          replyText: `Main Vaani AI hoon. Booking error aaya: ${bookingRes.error}`,
          audioUrl: null,
          pendingAction: null,
          toolResult: null,
          agoraConfig,
        });
      }

      const apt = bookingRes.appointment;
      return NextResponse.json({
        success: true,
        intent: 'confirm_action',
        transcriptHinglish: transcript,
        replyText: `Aapki appointment confirm ho gayi hai! Token number #${apt.token_number} (${apt.patient_name}, ${apt.department}). Aestimated wait lagbhag ${apt.estimated_wait_mins} minute hai.`,
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
          ? 'Namaste Doctor. Queue aur patient status ready hai. Kya aap agla token call karna chahte hain?'
          : 'Namaste! Main Vaani AI hoon. Kripya apna naam, phone number aur problem bataiye, ya booking confirm karne ke liye "haan confirm kar do" boliye.',
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
        replyText: `Main Vaani AI hoon. Request process nahi ho paayi: ${
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