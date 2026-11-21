import { NextResponse } from 'next/server';
import { getDoctorSession } from '@/lib/vaani/doctor-auth';

export async function GET() {
  const session = await getDoctorSession();
  if (!session) {
    return NextResponse.json({ authenticated: false, doctor: null }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    doctor: {
      id: session.doctorId,
      name: session.name,
      specialty: session.specialty,
    },
  });
}