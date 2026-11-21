import crypto from 'crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'vaani_doctor_session';

export interface DoctorSession {
  doctorId: string;
  name: string;
  specialty: string;
  exp: number;
}

function getSecret(): string {
  return process.env.DOCTOR_JWT_SECRET || 'dev_doctor_secret_change_me';
}

export function signDoctorToken(payload: Omit<DoctorSession, 'exp'>, hours = 8): string {
  const fullPayload: DoctorSession = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + hours * 3600,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyDoctorToken(token: string): DoctorSession | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', getSecret())
      .update(encoded)
      .digest('base64url');
    if (sig !== expectedSig) return null;
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as DoctorSession;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getDoctorSession(): Promise<DoctorSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyDoctorToken(token);
}

export function requireDoctorAuth(req: Request): { doctorId: string } | Response {
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const session = match ? verifyDoctorToken(decodeURIComponent(match[1])) : null;
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return { doctorId: session.doctorId };
}