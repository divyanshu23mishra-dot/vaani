import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import path from 'path';
import { signDoctorToken } from '@/lib/vaani/doctor-auth';

const dbPath = path.resolve(process.cwd(), 'data/relay.db');
const db = new Database(dbPath);

interface DoctorRow {
  id: string;
  name: string;
  specialty: string;
  email: string;
  password_hash: string;
  is_active: number;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const doctor = db
      .prepare(
        'SELECT id, name, specialty, email, password_hash, is_active FROM doctors WHERE LOWER(email) = ?'
      )
      .get(email) as DoctorRow | undefined;

    if (!doctor || !doctor.is_active) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, doctor.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = signDoctorToken(
      {
        doctorId: doctor.id,
        name: doctor.name,
        specialty: doctor.specialty,
      },
      8
    );

    const res = NextResponse.json({
      success: true,
      doctor: {
        id: doctor.id,
        name: doctor.name,
        specialty: doctor.specialty,
      },
    });

    res.cookies.set('vaani_doctor_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 8 * 3600,
    });

    return res;
  } catch (err) {
    console.error('Doctor login error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
