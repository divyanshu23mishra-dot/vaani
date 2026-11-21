import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

interface AgentDraftAction {
  type: 'book_token' | 'save_prescription';
  payload: Record<string, string>;
}

interface AgentPlan {
  intent:
    | 'check_wait'
    | 'propose_book_token'
    | 'confirm_action'
    | 'cancel_action'
    | 'propose_prescription'
    | 'general_help';
  replyText: string;
  phone?: string;
  draftAction?: AgentDraftAction | null;
}

const DEVANAGARI_WORDS: Array<[RegExp, string]> = [
  [/नमस्ते|नमस्कार/g, 'namaste'],
  [/धन्यवाद|शुक्रिया|थैंक\s*यू|थैंक्स/g, 'thank you'],
  [/हाँ|हां|हूँ/g, 'haan'],
  [/नहीं|नही|मत/g, 'nahi'],
  [/बुखार|ज्वर/g, 'bukhar'],
  [/खांसी|खाँसी/g, 'khansi'],
  [/दर्द|पीड़ा/g, 'dard'],
  [/डॉक्टर|डाक्टर/g, 'doctor'],
  [/अपॉइंटमेंट|अपोइंटमेंट/g, 'appointment'],
  [/टोकन/g, 'token'],
  [/दवाई|दवा|मेडिसिन/g, 'medicine'],
  [/गोली|टैबलेट/g, 'tablet'],
  [/सिरप/g, 'syrup'],
  [/कल/g, 'kal'],
  [/आज/g, 'aaj'],
  [/सुबह/g, 'subah'],
  [/शाम/g, 'shaam'],
  [/दिन/g, 'din'],
  [/मेरा|मेरे|मेरी/g, 'mera'],
  [/नाम/g, 'naam'],
  [/नंबर|नम्बर|फ़ोन|फोन/g, 'number'],
  [/बुक|बुक\s*कर\s*दो|बुक\s*करो/g, 'book kar do'],
];

const PHONETIC_FIXES: Array<[RegExp, string]> = [
  [/[\u0300-\u036f]/g, ''],
  [/\bpheevr\b|\bfeverr\b|\bbukharh\b|\bbukhaar\b/gi, 'bukhar'],
  [/\bkhansie\b|\bkhaansi\b/gi, 'khansi'],
  [/\bdokter\b|\bdoktar\b|\bdocter\b|\bdr\.?\s*/gi, 'doctor '],
  [/\bapointment\b|\bapointament\b|\bapoinment\b/gi, 'appointment'],
  [/\bphoon\b/gi, 'phone'],
  [/\bnnbr\b|\bnumbr\b|\bnomber\b/gi, 'number'],
  [/\bbuk\b/gi, 'book'],
  [/\btokn\b|\btokan\b/gi, 'token'],
  [/\bsevn\b/gi, '7'],
  [/\btaiblet\b|\bteb\b/gi, 'tablet'],
  [/\bpairasitamol\b|\bparacetamal\b/gi, 'paracetamol'],
  [/\bemjee\b|\bemji\b/gi, 'mg'],
  [/\bhaa\b|\bhan\b/gi, 'haan'],
  [/\bkl\b/gi, 'kal'],
  [/\bsubh\b/gi, 'subah'],
  [/\bnam\b/gi, 'naam'],
  [/\bmeree\b|\bmere\b/gi, 'mere'],
  [/\bdukh\b|\bdardh\b/gi, 'dard'],
];

function toCleanHinglish(input: string): string {
  let text = input;
  for (const [pattern, replacement] of DEVANAGARI_WORDS) {
    text = text.replace(pattern, ` ${replacement} `);
  }
  text = text.replace(/[\u0900-\u097F]+/g, ' ');
  for (const [pattern, replacement] of PHONETIC_FIXES) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, ' ').trim();
}

function getLatestAppointmentId(): string {
  try {
    const dbPath = path.resolve(process.cwd(), 'data/relay.db');
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT id FROM appointments ORDER BY rowid DESC LIMIT 1').get() as
      | { id?: string }
      | undefined;
    db.close();
    return row?.id || '';
  } catch {
    return '';
  }
}

function extractName(text: string): string {
  const m =
    text.match(/(?:mera naam|my name is|name is|naam|patient)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i) ||
    text.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/);
  return m ? toCleanHinglish(m[1].trim()) : 'Voice Patient';
}

function extractDoctor(text: string): string {
  const m = text.match(/\b((?:doctor|dr)\s+[a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i);
  return m ? toCleanHinglish(m[1].trim()) : 'Dr. Aarav Sharma';
}

function extractSlot(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('kal subah') || lower.includes('tomorrow morning')) return 'kal subah';
  if (lower.includes('aaj shaam') || lower.includes('evening')) return 'aaj shaam';
  if (lower.includes('subah') || lower.includes('morning')) return 'subah';
  if (lower.includes('kal')) return 'kal';
  return 'next available slot';
}

async function synthesizeMurfFalcon(text: string, voiceId?: string): Promise<string | null> {
  const apiKey = process.env.MURF_API_KEY;
  if (!apiKey || !text.trim()) return null;

  const selectedVoice = voiceId || process.env.MURF_VOICE_ID || 'en-IN-aarav';
  const model = process.env.MURF_MODEL || 'FALCON';

  try {
    const res = await fetch('https://api.murf.ai/v1/speech/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        text: text.slice(0, 600),
        voiceId: selectedVoice,
        model,
        format: 'MP3',
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      audioFile?: string;
      audioUrl?: string;
      encodedAudio?: string;
    };
    if (data.audioFile) return data.audioFile;
    if (data.audioUrl) return data.audioUrl;
    if (data.encodedAudio) return `data:audio/mp3;base64,${data.encodedAudio}`;
    return null;
  } catch {
    return null;
  }
}

function buildPlan(
  hinglishUtterance: string,
  role: 'patient' | 'doctor',
  pendingAction: AgentDraftAction | null
): AgentPlan {
  const lower = hinglishUtterance.toLowerCase().trim();
  const digits = hinglishUtterance.replace(/\D/g, '').slice(0, 10);

  const isAffirmative =
    /\b(yes|haan|haa|ha|confirm|ok|okay|kar do|kar de|book kar|book kr|bhej do|save kar|save kr)\b/i.test(
      lower
    );
  const isNegative =
    /\b(no|nahi|nahii|mat|cancel|ruko|rehne do|rehnedo)\b/i.test(lower);

  if (pendingAction && isAffirmative) {
    return {
      intent: 'confirm_action',
      replyText: 'Main Vaani AI hoon. Theek hai, main abhi process kar raha hoon.',
      phone: digits,
      draftAction: null,
    };
  }

  if (pendingAction && isNegative) {
    return {
      intent: 'cancel_action',
      replyText: 'Main Vaani AI hoon. Theek hai, request cancel kar diya gaya hai.',
      phone: digits,
      draftAction: null,
    };
  }

  if (role === 'doctor') {
    const looksLikeTokenBooking =
      /\b(book|appointment|token\s*book)\b/i.test(lower) &&
      !/\b(tablet|medicine|syrup|mg|paracetamol|azithro|amoxicillin|cap|capsule)\b/i.test(lower);

    if (!looksLikeTokenBooking) {
      return {
        intent: 'propose_prescription',
        replyText: `Main Vaani AI hoon. Prescription note ho gaya hai (${hinglishUtterance}). PDF Sheet, Share PDF, ya Send to Queue use karein.`,
        phone: digits,
        draftAction: {
          type: 'save_prescription',
          payload: {
            doctorName: extractDoctor(hinglishUtterance),
            medicines: hinglishUtterance,
            notes: 'Doctor voice prescription',
          },
        },
      };
    }
  }

  if (/\b(wait|status|token|kab number|kitna time)\b/i.test(lower) && digits.length === 10) {
    return {
      intent: 'check_wait',
      replyText: `Main Vaani AI hoon. Number ${digits} ke liye live token aur wait time check kar raha hoon.`,
      phone: digits,
      draftAction: null,
    };
  }

  if (
    /\b(fever|bukhar|pain|dard|cough|khansi|cold|sardi|headache|book|appointment|token|checkup|sick|ill|kal|aaj|subah|shaam)\b/i.test(
      lower
    )
  ) {
    const patientName = extractName(hinglishUtterance);
    const doctorName = extractDoctor(hinglishUtterance);
    const slot = extractSlot(lower);
    const phoneFinal = digits.length === 10 ? digits : '9876543210';

    return {
      intent: 'propose_book_token',
      replyText: `Main Vaani AI hoon. Details note kar li hain: Patient ${patientName}, Doctor ${doctorName}, Slot ${slot}, Mobile ${phoneFinal}. Kya main appointment book kar doon? Haan ya cancel bolein.`,
      phone: phoneFinal,
      draftAction: {
        type: 'book_token',
        payload: {
          patientName,
          patientPhone: phoneFinal,
          chiefComplaint: `${hinglishUtterance} (${slot}, ${doctorName})`,
          symptoms: hinglishUtterance,
          languagePref: 'hinglish',
        },
      },
    };
  }

  if (isAffirmative) {
    return {
      intent: 'propose_book_token',
      replyText:
        'Main Vaani AI hoon. Kya main kal ke slot aur doctor aarav sharma ke saath appointment book kar doon? Haan bolein.',
      phone: digits || '9876543210',
      draftAction: {
        type: 'book_token',
        payload: {
          patientName: 'Voice Patient',
          patientPhone: digits || '9876543210',
          chiefComplaint: `${hinglishUtterance} (kal, doctor aarav sharma)`,
          symptoms: hinglishUtterance,
          languagePref: 'hinglish',
        },
      },
    };
  }

  return {
    intent: 'general_help',
    replyText:
      'Main Vaani AI hoon. Aap apni problem, doctor, time, naam aur mobile number hinglish mein bata kar appointment book karwa sakte hain.',
    phone: digits,
    draftAction: null,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const origin = new URL(req.url).origin;
    const rawUtterance = String(body?.utterance || '').trim();
    const hinglishUtterance = toCleanHinglish(rawUtterance);
    const role: 'patient' | 'doctor' = body?.role === 'doctor' ? 'doctor' : 'patient';
    const voiceId = String(body?.voiceId || process.env.MURF_VOICE_ID || 'en-IN-aarav');
    const pendingAction: AgentDraftAction | null = body?.pendingAction || null;

    if (!hinglishUtterance) {
      return NextResponse.json({
        success: true,
        intent: 'general_help',
        transcriptHinglish: '',
        replyText: 'Main Vaani AI hoon. Bataiye main aapki kya madad kar sakta hoon?',
        audioUrl: null,
        pendingAction: null,
        toolResult: null,
      });
    }

    const plan = buildPlan(hinglishUtterance, role, pendingAction);
    let replyText = toCleanHinglish(plan.replyText);
    let nextPendingAction: AgentDraftAction | null = plan.draftAction || null;
    let toolResult: Record<string, unknown> | null = null;

    const lookupPhone = String(plan.phone || '').replace(/\D/g, '').slice(0, 10);

    if (plan.intent === 'check_wait' && lookupPhone.length === 10) {
      try {
        const stRes = await fetch(`${origin}/api/vaani/patient-status?phone=${lookupPhone}`);
        const stData = await stRes.json();
        const firstApt = stData?.appointments?.[0];
        if (firstApt) {
          replyText = `Main Vaani AI hoon. Aapka Token #${firstApt.token_number} hai, status ${firstApt.status} hai, aur estimated wait time lagbhag ${firstApt.estimated_wait_mins ?? 0} minute hai.`;
        } else {
          replyText = `Main Vaani AI hoon. Number ${lookupPhone} par abhi koi active token nahi mila.`;
        }
        toolResult = stData;
      } catch {
        replyText = `Main Vaani AI hoon. Number ${lookupPhone} ka status abhi check nahi ho paya.`;
      }
    }

    if (plan.intent === 'confirm_action' && pendingAction) {
      if (pendingAction.type === 'book_token') {
        const p = pendingAction.payload || {};
        const phoneFinal = String(p.patientPhone || lookupPhone || '9876543210')
          .replace(/\D/g, '')
          .slice(0, 10);

        const cleanComplaint = toCleanHinglish(String(p.chiefComplaint || hinglishUtterance));
        const cleanSymptoms = toCleanHinglish(String(p.symptoms || hinglishUtterance));

        try {
          const bookRes = await fetch(`${origin}/api/vaani/appointments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              patientName: toCleanHinglish(String(p.patientName || 'Voice Patient')),
              patientPhone: phoneFinal,
              languagePref: 'hinglish',
              chiefComplaint: cleanComplaint,
              symptoms: cleanSymptoms,
              bookingMethod: 'voice',
            }),
          });
          const bookData = await bookRes.json().catch(() => ({}));
          if (bookRes.ok && bookData?.success) {
            replyText = `Main Vaani AI hoon. Appointment token #${bookData.tokenNumber} book ho gaya hai. Estimated wait time lagbhag ${
              bookData.estimatedWaitMins ?? 0
            } minute hai.`;
            toolResult = bookData;
            nextPendingAction = null;
          } else {
            replyText = `Main Vaani AI hoon. Booking mein dikkat aayi: ${toCleanHinglish(
              String(bookData?.error || 'dobara try karein')
            )}.`;
          }
        } catch {
          replyText = 'Main Vaani AI hoon. Booking service abhi reach nahi ho paayi.';
        }
      } else if (pendingAction.type === 'save_prescription') {
        const p = pendingAction.payload || {};
        const latestAptId = getLatestAppointmentId();

        try {
          const rxRes = await fetch(`${origin}/api/vaani/pharmacy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              appointmentId: p.appointmentId || latestAptId,
              doctorName: toCleanHinglish(String(p.doctorName || 'Dr. Aarav Sharma')),
              medicines: toCleanHinglish(String(p.medicines || hinglishUtterance)),
              notes: toCleanHinglish(String(p.notes || 'Doctor voice prescription')),
              pharmacyStatus: 'in_queue',
            }),
          });
          const rxData = await rxRes.json().catch(() => ({}));
          if (rxRes.ok && rxData?.success) {
            replyText =
              'Main Vaani AI hoon. Prescription save ho gaya hai aur pharmacy queue mein bhej diya gaya hai.';
            toolResult = rxData;
            nextPendingAction = null;
          } else {
            replyText = `Main Vaani AI hoon. Prescription save nahi ho paya: ${toCleanHinglish(
              String(rxData?.error || 'dobara try karein')
            )}.`;
          }
        } catch {
          replyText = 'Main Vaani AI hoon. Pharmacy queue service abhi reach nahi ho paayi.';
        }
      }
    } else if (plan.intent === 'cancel_action') {
      nextPendingAction = null;
    }

    const audioUrl = await synthesizeMurfFalcon(replyText, voiceId);

    return NextResponse.json({
      success: true,
      intent: plan.intent,
      transcriptHinglish: hinglishUtterance,
      replyText,
      audioUrl,
      pendingAction: nextPendingAction,
      toolResult,
      agoraConfig: {
        appId: process.env.NEXT_PUBLIC_AGORA_APP_ID || process.env.AGORA_APP_ID || '',
        maxSessionSeconds: 180,
      },
    });
  } catch (err) {
    console.error('Vaani agent error:', err);
    return NextResponse.json({
      success: true,
      intent: 'general_help',
      transcriptHinglish: '',
      replyText: 'Main Vaani AI hoon. Kripya dobara bolein ya likhein.',
      audioUrl: null,
      pendingAction: null,
      toolResult: null,
    });
  }
}