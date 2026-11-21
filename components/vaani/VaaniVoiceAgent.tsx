'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useVaaniTheme } from '@/components/vaani/VaaniShell';

interface VaaniVoiceAgentProps {
  role?: 'patient' | 'doctor';
  languagePref?: string;
}

interface PendingDraft {
  type: 'book_token' | 'save_prescription';
  payload: Record<string, string>;
}

const MAX_SESSION_SECONDS = 180;
const VOICE_AUTO_SEND_MS = 5000;

function sanitizeDiacriticsAndTypos(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bnd\b/gi, 'and')
    .replace(/\bkr\s*isin\b|\bkrisin\b|\bkrosin\b/gi, 'crocin')
    .replace(/\s+/g, ' ')
    .trim();
}

function isFarewellOrThanks(text: string): boolean {
  return /\b(thank\s*you|thanks|dhanyawad|shukriya|bye|goodbye|bas\s*ho\s*gaya|band\s*karo)\b/i.test(
    text
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildClinicalSheetEnglishPdf(params: {
  adviceText: string;
  clinicalDescription?: string;
  patientName?: string;
  ageGender?: string;
  weight?: string;
  tokenNumber?: number | string | null;
  doctorName?: string;
  dateLabel?: string;
}): string {
  const doctorName = escapeHtml((params.doctorName || 'Dr. Aarav Sharma').trim());
  const dateLabel = escapeHtml(
    (params.dateLabel || new Date().toLocaleDateString('en-IN')).trim()
  );
  const patientName = escapeHtml((params.patientName || 'OPD Patient').trim());
  const ageGender = escapeHtml((params.ageGender || '—').trim());
  const weight = escapeHtml((params.weight || '—').trim());
  const tokenBadge =
    params.tokenNumber !== undefined &&
    params.tokenNumber !== null &&
    String(params.tokenNumber).trim() !== ''
      ? `Token #${escapeHtml(String(params.tokenNumber).trim())}`
      : 'OPD Visit';

  const safeAdvice = escapeHtml(sanitizeDiacriticsAndTypos(params.adviceText));
  const safeClinical = escapeHtml(
    sanitizeDiacriticsAndTypos(params.clinicalDescription || 'General OPD Consultation')
  );

  const items = safeAdvice
    .split(/(?:,|;|\band\b|\baur\b|\n)+/i)
    .map((x) => x.trim())
    .filter(Boolean);

  const adviceLines = (items.length ? items : [safeAdvice])
    .map((line) => `<div class="rx-item">${line}</div>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Clinical Prescription</title>
  <style>
    * { box-sizing: border-box; }
    @page { margin: 14mm; }
    body {
      margin: 0;
      padding: 20px;
      background: #e2e8f0;
      color: #0f172a;
      font-family: "Segoe UI", Roboto, Arial, sans-serif;
    }
    .page {
      max-width: 780px;
      min-height: 980px;
      margin: 0 auto;
      background: #ffffff;
      padding: 28px 34px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border: 1px solid #cbd5e1;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid #0f172a;
    }
    .doc-name {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
    }
    .doc-qual {
      font-size: 12.5px;
      color: #334155;
      margin-top: 3px;
      line-height: 1.45;
    }
    .clinic-meta {
      text-align: right;
      font-size: 12.5px;
      color: #0f172a;
      line-height: 1.5;
    }
    .clinic-phone {
      font-weight: 700;
      font-size: 13px;
      margin-top: 2px;
    }
    .patient-grid {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      margin-top: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #cbd5e1;
      font-size: 13.5px;
    }
    .patient-col div,
    .date-col div {
      margin-bottom: 6px;
    }
    .token-pill {
      display: inline-block;
      margin-top: 4px;
      font-size: 11.5px;
      font-weight: 700;
      color: #065f46;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      padding: 2px 8px;
      border-radius: 999px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 22px;
      margin-bottom: 8px;
    }
    .clinical-box {
      font-size: 13.5px;
      color: #1e293b;
      padding-left: 12px;
      line-height: 1.55;
    }
    .rx-item {
      font-size: 14px;
      color: #0f172a;
      padding: 6px 12px;
      line-height: 1.55;
    }
    .footer {
      margin-top: 48px;
      padding-top: 14px;
      border-top: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 20px;
      font-size: 12.5px;
      color: #334155;
    }
    .footer-note {
      max-width: 440px;
      line-height: 1.45;
    }
    .sign-box {
      text-align: right;
      min-width: 190px;
    }
    .sign-line {
      border-top: 1px solid #0f172a;
      padding-top: 4px;
      font-weight: 600;
      color: #0f172a;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .page {
        border: none;
        min-height: auto;
        padding: 12px 18px;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div>
      <div class="header-top">
        <div>
          <div class="doc-name">${doctorName}</div>
          <div class="doc-qual">
            MBBS, MD (General Medicine)<br/>
            Vaani AI Clinical &amp; OPD Care
          </div>
        </div>
        <div class="clinic-meta">
          <div>Morning: 09:00 AM to 01:00 PM</div>
          <div>Evening: 05:00 PM to 08:30 PM</div>
          <div>Reg. No.: KMC-84920</div>
          <div class="clinic-phone">Ph: 8085993168</div>
        </div>
      </div>

      <div class="patient-grid">
        <div class="patient-col">
          <div><strong>Name:</strong> ${patientName}</div>
          <div><strong>Age / Gender:</strong> ${ageGender}</div>
        </div>
        <div class="date-col">
          <div><strong>Date:</strong> ${dateLabel}</div>
          <div><strong>Weight:</strong> ${weight}</div>
          <div class="token-pill">${tokenBadge}</div>
        </div>
      </div>

      <div class="section-title">Clinical Description:</div>
      <div class="clinical-box">${safeClinical}</div>

      <div class="section-title">Advice:</div>
      <div>${adviceLines}</div>
    </div>

    <div class="footer">
      <div class="footer-note">
        Please follow the prescribed dosage schedule and report immediately if symptoms worsen.
      </div>
      <div class="sign-box">
        <div class="sign-line">${doctorName}</div>
      </div>
    </div>
  </div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 150); };</script>
</body>
</html>`;
}

export default function VaaniVoiceAgent({
  role = 'patient',
  languagePref = 'hi-IN',
}: VaaniVoiceAgentProps) {
  const [theme] = useVaaniTheme();
  const isLight = theme === 'light';

  const [isOpen, setIsOpen] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(MAX_SESSION_SECONDS);
  const [inputText, setInputText] = useState('');
  const [replyText, setReplyText] = useState(
    'Voice active: Mic se bolein ya command dein (send to queue / pdf / share). Chat backup me hai.'
  );
  const [pendingAction, setPendingAction] = useState<PendingDraft | null>(null);
  const [prescriptionDraft, setPrescriptionDraft] = useState('');
  const [linkedTokenNumber, setLinkedTokenNumber] = useState<number | string | null>(null);
  const [linkedPatientName, setLinkedPatientName] = useState<string>('OPD Patient');
  const [sending, setSending] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [listening, setListening] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const autoSendTimerRef = useRef<number | null>(null);
  const listeningRef = useRef(false);
  const sendingRef = useRef(false);

  listeningRef.current = listening;
  sendingRef.current = sending;

  useEffect(() => {
    if (!sessionActive) return;

    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setSessionActive(false);
          setListening(false);
          try {
            recognitionRef.current?.stop?.();
          } catch {}
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [sessionActive]);

  function clearAutoSendTimer() {
    if (autoSendTimerRef.current !== null) {
      window.clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
  }

  function stopAgentSpeech() {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  function stopMicOnly() {
    clearAutoSendTimer();
    setListening(false);
    try {
      recognitionRef.current?.stop?.();
    } catch {}
  }

  function openFloatingWidget() {
    setIsOpen(true);
    setSessionActive(true);
    setSecondsLeft(MAX_SESSION_SECONDS);
    setReplyText(
      'Voice active: Mic se bolein ya command dein (send to queue / pdf / share). Chat backup me hai.'
    );
  }

  function closeFloatingWidget() {
    stopMicOnly();
    stopAgentSpeech();
    setIsOpen(false);
    setSessionActive(false);
  }

  function playReplyAudio(audioUrl?: string | null, spokenText?: string, closeAfter = false) {
    if (listeningRef.current) return;
    stopAgentSpeech();

    const onDone = () => {
      if (closeAfter) {
        window.setTimeout(() => closeFloatingWidget(), 700);
      }
    };

    if (audioUrl && audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.onended = onDone;
      audioRef.current.onerror = onDone;
      audioRef.current.play().catch(onDone);
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window && spokenText) {
      const utter = new SpeechSynthesisUtterance(spokenText);
      utter.lang = 'hi-IN';
      utter.onend = onDone;
      utter.onerror = onDone;
      window.speechSynthesis.speak(utter);
      return;
    }

    onDone();
  }

  function openPrescriptionPdf(rxText?: string) {
    stopAgentSpeech();
    const content = sanitizeDiacriticsAndTypos(rxText || prescriptionDraft || inputText || '');
    if (!content) {
      setReplyText('Pehle voice se prescription bolein ya backup chat me likhein.');
      return;
    }
    const win = window.open('', '_blank', 'width=840,height=960');
    if (!win) return;
    win.document.write(
      buildClinicalSheetEnglishPdf({
        adviceText: content,
        clinicalDescription: content,
        patientName: linkedPatientName,
        tokenNumber: linkedTokenNumber,
        doctorName: 'Dr. Aarav Sharma',
        dateLabel: new Date().toLocaleDateString('en-IN'),
      })
    );
    win.document.close();
  }

  async function sharePrescriptionPdfToPatient(rxText?: string) {
    stopAgentSpeech();
    const content = sanitizeDiacriticsAndTypos(rxText || prescriptionDraft || inputText || '');
    if (!content) {
      setReplyText('Pehle voice se prescription bolein ya backup chat me likhein.');
      return;
    }

    try {
      const htmlDoc = buildClinicalSheetEnglishPdf({
        adviceText: content,
        clinicalDescription: content,
        patientName: linkedPatientName,
        tokenNumber: linkedTokenNumber,
        doctorName: 'Dr. Aarav Sharma',
        dateLabel: new Date().toLocaleDateString('en-IN'),
      });
      const pdfBlob = new Blob([htmlDoc], { type: 'application/pdf' });
      const pdfFile = new File([pdfBlob], 'vaani-prescription.pdf', { type: 'application/pdf' });

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
          await navigator.share({
            title: 'Vaani AI Prescription PDF',
            text: content,
            files: [pdfFile],
          });
          setReplyText('Vaani AI prescription PDF share kar diya gaya hai.');
          return;
        }
        await navigator.share({
          title: 'Vaani AI Prescription',
          text: content,
        });
        setReplyText('Vaani AI prescription share kar diya gaya hai.');
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
        setReplyText('Prescription copy ho gaya hai.');
      }
    } catch {
      setReplyText('Share cancel hua.');
    }
  }

  async function sendPrescriptionToQueue(explicitText?: string) {
    stopAgentSpeech();
    const meds = sanitizeDiacriticsAndTypos(explicitText || prescriptionDraft || inputText);
    if (!meds) {
      setReplyText('Pehle mic se bolein ya backup chat mein likhein.');
      return;
    }

    setDispatching(true);
    try {
      const res = await fetch('/api/vaani/pharmacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorName: 'Dr. Aarav Sharma',
          medicines: meds,
          notes: meds,
          pharmacyStatus: 'in_queue',
          status: 'in_queue',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success !== false) {
        const resolvedToken =
          data?.tokenNumber ?? data?.prescription?.token_number ?? linkedTokenNumber;
        const resolvedName =
          data?.prescription?.patient_name ?? linkedPatientName ?? 'OPD Patient';
        if (resolvedToken) setLinkedTokenNumber(resolvedToken);
        if (resolvedName) setLinkedPatientName(String(resolvedName));

        setPrescriptionDraft(meds);
        const confirmation = `Pharmacy queue mein bhej diya gaya hai${
          resolvedToken ? ` (Token #${resolvedToken})` : ''
        }: ${meds}`;
        setReplyText(confirmation);
        setPendingAction(null);
        playReplyAudio(null, confirmation);
      } else {
        setReplyText(data?.error || 'Queue mein bhejne mein dikkat aayi.');
      }
    } catch {
      setReplyText('Network error aaya hai.');
    } finally {
      setDispatching(false);
    }
  }

  async function sendUtterance(rawText: string) {
    clearAutoSendTimer();
    if (sendingRef.current) return;

    const cleanUtterance = sanitizeDiacriticsAndTypos(rawText);
    if (!cleanUtterance) return;

    if (!sessionActive) {
      setSessionActive(true);
      setSecondsLeft(MAX_SESSION_SECONDS);
    }

    setInputText(cleanUtterance);

    if (isFarewellOrThanks(cleanUtterance)) {
      const byeReply = 'Thank you! Main Vaani AI hoon, aapka din achha rahe.';
      setReplyText(byeReply);
      setPendingAction(null);
      playReplyAudio(null, byeReply, true);
      return;
    }

    if (/\b(tumhara naam|aapka naam|who are you|kaun ho|naam kya hai)\b/i.test(cleanUtterance)) {
      const nameReply = 'Mera naam Vaani AI hai. Bataiye main aapki kya madad kar sakta hoon?';
      setReplyText(nameReply);
      playReplyAudio(null, nameReply);
      return;
    }

    if (
      /^(namaste|namaskar|hi|hello|hey)\b/i.test(cleanUtterance) &&
      cleanUtterance.split(' ').length <= 2
    ) {
      const greetReply =
        role === 'doctor'
          ? 'Namaste Doctor, main Vaani AI hoon. Mic se bolein ya command dein: send to queue, pdf, ya share.'
          : 'Namaste, main Vaani AI hoon. Mic se apni problem, doctor, time, naam aur mobile number batayein.';
      setReplyText(greetReply);
      playReplyAudio(null, greetReply);
      return;
    }

    if (role === 'doctor') {
      // Voice/text action triggers for doctor workflow
      if (/\b(send\s*to\s*queue|pharmacy\s*(me|mein)?\s*bhej|queue\s*(me|mein)?\s*bhej)\b/i.test(cleanUtterance)) {
        const strippedMeds = cleanUtterance
          .replace(/\b(send\s*to\s*queue|pharmacy\s*(me|mein)?\s*bhej(o|a|do)?|queue\s*(me|mein)?\s*bhej(o|a|do)?)\b/gi, '')
          .trim();
        await sendPrescriptionToQueue(strippedMeds || prescriptionDraft || inputText);
        return;
      }

      if (/\b(open\s*pdf|pdf\s*sheet|pdf\s*banao|pdf\s*kholo|print\s*pdf)\b/i.test(cleanUtterance)) {
        openPrescriptionPdf(prescriptionDraft || inputText);
        setReplyText('Clinical prescription PDF sheet khol diya gaya hai.');
        return;
      }

      if (/\b(share\s*pdf|patient\s*ko\s*bhej|share\s*karo)\b/i.test(cleanUtterance)) {
        await sharePrescriptionPdfToPatient(prescriptionDraft || inputText);
        return;
      }

      setPrescriptionDraft(cleanUtterance);
      const notedText = `Noted: "${cleanUtterance}". Bolein "send to queue", "pdf", ya "share" (ya neeche button dabayein).`;
      setReplyText(notedText);
      playReplyAudio(null, notedText);
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/vaani/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          utterance: cleanUtterance,
          role,
          languagePref: 'hinglish',
          pendingAction,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        const finalTranscript = sanitizeDiacriticsAndTypos(
          String(data.transcriptHinglish || cleanUtterance)
        );
        setInputText(finalTranscript);
        const cleanReply = sanitizeDiacriticsAndTypos(String(data.replyText || ''));
        setReplyText(cleanReply);
        setPendingAction(data.pendingAction || null);
        playReplyAudio(data.audioUrl, cleanReply);
      } else {
        setReplyText(data?.error || 'Request process nahi ho paya.');
      }
    } catch {
      setReplyText('Network error aaya hai, mic ya backup chat se dobara try karein.');
    } finally {
      setSending(false);
    }
  }

  function startBrowserMic() {
    if (listeningRef.current) {
      stopMicOnly();
      return;
    }

    stopAgentSpeech();
    clearAutoSendTimer();

    if (!sessionActive) {
      setSessionActive(true);
      setSecondsLeft(MAX_SESSION_SECONDS);
    }

    const SpeechRecognitionCtor =
      (
        window as unknown as {
          SpeechRecognition?: new () => any;
          webkitSpeechRecognition?: new () => any;
        }
      ).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setReplyText(
        'Browser mein voice API available nahi hai—backup chat box se type karke Send dabayein.'
      );
      return;
    }

    try {
      recognitionRef.current?.stop?.();
    } catch {}

    const rec = new SpeechRecognitionCtor();
    recognitionRef.current = rec;
    rec.lang = languagePref;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalChunks = '';
    let interimChunk = '';
    let submitted = false;

    const getCurrentTranscript = () =>
      sanitizeDiacriticsAndTypos(`${finalChunks} ${interimChunk}`);

    const finalizeAndSend = () => {
      if (submitted) return;
      const fullText = getCurrentTranscript();
      if (!fullText) return;
      submitted = true;
      clearAutoSendTimer();
      setListening(false);
      try {
        rec.stop();
      } catch {}

      setInputText(fullText);
      if (role === 'doctor') {
        setPrescriptionDraft(fullText);
      }
      sendUtterance(fullText);
    };

    const resetFiveSecTimer = () => {
      clearAutoSendTimer();
      autoSendTimerRef.current = window.setTimeout(() => {
        if (!submitted) {
          finalizeAndSend();
        }
      }, VOICE_AUTO_SEND_MS);
    };

    setListening(true);
    setReplyText('Voice listening... bolte rahein (5s pause par auto-send).');

    rec.onresult = (event: {
      resultIndex: number;
      results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
    }) => {
      let nextFinal = '';
      let nextInterim = '';
      for (let i = 0; i < event.results.length; i += 1) {
        const piece = event.results[i]?.[0]?.transcript || '';
        if (!piece) continue;
        if (event.results[i]?.isFinal) {
          nextFinal += ` ${piece}`;
        } else {
          nextInterim += ` ${piece}`;
        }
      }
      finalChunks = nextFinal.trim();
      interimChunk = nextInterim.trim();

      const liveText = getCurrentTranscript();
      if (liveText) {
        setInputText(liveText);
        if (role === 'doctor') {
          setPrescriptionDraft(liveText);
        }
        resetFiveSecTimer();
      }
    };

    rec.onerror = (ev: { error?: string }) => {
      clearAutoSendTimer();
      setListening(false);
      if (ev?.error === 'no-speech' && getCurrentTranscript()) {
        finalizeAndSend();
        return;
      }
      setReplyText('Voice capture nahi ho paya—backup chat se type karke Send karein.');
    };

    rec.onend = () => {
      clearAutoSendTimer();
      setListening(false);
      if (!submitted && getCurrentTranscript()) {
        finalizeAndSend();
      }
    };

    try {
      rec.start();
    } catch {
      setListening(false);
      setReplyText('Mic start nahi ho paya—backup chat use karein.');
    }
  }

  const activeRxText = sanitizeDiacriticsAndTypos(prescriptionDraft || inputText);

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <section
          className={`w-[360px] sm:w-[400px] rounded-2xl border p-4 shadow-2xl space-y-3 transition ${
            isLight
              ? 'border-emerald-300 bg-white text-slate-900'
              : 'border-emerald-500/35 bg-slate-900 text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-200/20 pb-2.5">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  listening ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
                }`}
              />
              <h3 className="text-sm font-bold tracking-tight">Vaani AI</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  isLight
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-emerald-500/15 text-emerald-300'
                }`}
              >
                Voice First • {role}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono opacity-75">{secondsLeft}s</span>
              <button
                type="button"
                onClick={closeFloatingWidget}
                aria-label="Close Vaani AI"
                className="rounded-lg px-2 py-0.5 text-xs font-semibold opacity-75 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          </div>

          <p
            className={`rounded-xl border p-2.5 text-xs leading-relaxed ${
              isLight
                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
                : 'border-slate-800 bg-slate-950 text-emerald-200'
            }`}
          >
            {replyText}
          </p>

          {/* Primary Voice Control */}
          <button
            type="button"
            disabled={sending}
            onClick={startBrowserMic}
            className={`w-full rounded-xl py-2.5 px-3 text-xs font-bold text-white shadow transition disabled:opacity-50 ${
              listening
                ? 'bg-rose-600 hover:bg-rose-500'
                : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {listening ? 'Stop Mic (Listening...)' : 'Speak (Primary Voice)'}
          </button>

          {role === 'doctor' && activeRxText && (
            <div
              className={`rounded-xl border p-2.5 space-y-2 text-xs ${
                isLight
                  ? 'border-slate-200 bg-slate-50 text-slate-800'
                  : 'border-slate-800 bg-slate-950/80 text-slate-200'
              }`}
            >
              <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                Noted Prescription / Notes
              </div>
              <div className="max-h-24 overflow-y-auto whitespace-pre-wrap">{activeRxText}</div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => openPrescriptionPdf(activeRxText)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-[11px] font-semibold hover:bg-slate-200/50 dark:hover:bg-slate-800"
                >
                  PDF Sheet
                </button>
                <button
                  type="button"
                  onClick={() => sharePrescriptionPdfToPatient(activeRxText)}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                >
                  Share PDF
                </button>
                <button
                  type="button"
                  disabled={dispatching}
                  onClick={() => sendPrescriptionToQueue(activeRxText)}
                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {dispatching ? 'Sending...' : 'Send to Queue'}
                </button>
              </div>
            </div>
          )}

          {pendingAction && (
            <div
              className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
                isLight
                  ? 'border-amber-300 bg-amber-50 text-amber-950'
                  : 'border-amber-500/35 bg-amber-500/10 text-amber-200'
              }`}
            >
              <span>Confirm {pendingAction.type.replace('_', ' ')}?</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => sendUtterance('haan confirm kar do')}
                  className="rounded bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-slate-950"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => sendUtterance('nahi cancel kar do')}
                  className="rounded bg-slate-700 px-2.5 py-1 text-[11px] font-semibold text-white"
                >
                  No
                </button>
              </div>
            </div>
          )}

          {/* Backup Chat Fallback */}
          <div className="space-y-1">
            <div className="text-[10px] font-medium uppercase tracking-wider opacity-60">
              Backup Chat (If voice unavailable)
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={inputText}
                onChange={(e) => {
                  clearAutoSendTimer();
                  const val = e.target.value;
                  setInputText(val);
                  if (role === 'doctor') {
                    setPrescriptionDraft(val);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !sending && !listening) {
                    e.preventDefault();
                    sendUtterance(inputText);
                  }
                }}
                placeholder={
                  role === 'doctor'
                    ? 'Backup chat: prescription / notes likhein...'
                    : 'Backup chat: yahan type karein...'
                }
                className={`flex-1 min-w-0 rounded-lg border px-2.5 py-1.5 text-xs focus:border-emerald-500 focus:outline-none ${
                  isLight
                    ? 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
                    : 'border-slate-700 bg-slate-950 text-white placeholder:text-slate-500'
                }`}
              />

              <button
                type="button"
                disabled={sending || listening}
                onClick={() => sendUtterance(inputText)}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 shrink-0"
              >
                {sending ? '...' : 'Send'}
              </button>
            </div>
          </div>

          <audio ref={audioRef} className="hidden" />
        </section>
      )}

      <button
        type="button"
        onClick={() => (isOpen ? closeFloatingWidget() : openFloatingWidget())}
        aria-label="Toggle Vaani AI"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shadow-xl ring-4 ring-emerald-500/25 transition hover:scale-105 hover:bg-emerald-500"
      >
        {isOpen ? '✕' : 'Vaani'}
      </button>
    </div>
  );
}