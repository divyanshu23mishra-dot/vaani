'use client';

import React, { useCallback, useEffect, useState } from 'react';
import VaaniShell, { useVaaniTheme } from '@/components/vaani/VaaniShell';
import VaaniVoiceAgent from '@/components/vaani/VaaniVoiceAgent';

interface PharmacyStatusRow {
  id: string;
  appointment_id?: string | null;
  token_number?: number | null;
  patient_phone?: string | null;
  medicines: string;
  pharmacy_status: string;
}

export default function PatientBookPage() {
  const [theme] = useVaaniTheme();
  const isLight = theme === 'light';

  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const [lookupToken, setLookupToken] = useState('');
  const [matchedRx, setMatchedRx] = useState<PharmacyStatusRow | null>(null);
  const [checkedOnce, setCheckedOnce] = useState(false);

  const lookupByToken = useCallback(async (rawToken: string) => {
    const cleanToken = rawToken.replace(/\D/g, '').trim();
    if (!cleanToken) {
      setMatchedRx(null);
      setCheckedOnce(false);
      return;
    }

    try {
      const res = await fetch('/api/vaani/pharmacy', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        const list: PharmacyStatusRow[] =
          data.prescriptions || data.items || data.pharmacy || (Array.isArray(data) ? data : []);
        const found =
          list.find((r) => String(r.token_number ?? '').trim() === cleanToken) || null;
        setMatchedRx(found);
        setCheckedOnce(true);
      }
    } catch {
      // ignore transient error
    }
  }, []);

  useEffect(() => {
    if (!lookupToken.replace(/\D/g, '').trim()) return;
    lookupByToken(lookupToken);
    const id = setInterval(() => lookupByToken(lookupToken), 3000);
    return () => clearInterval(id);
  }, [lookupToken, lookupByToken]);

  async function handleBookSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setResultMsg(null);

    try {
      const res = await fetch('/api/vaani/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: patientName.trim() || 'Patient',
          patientPhone: patientPhone.trim(),
          languagePref: 'hinglish',
          chiefComplaint: chiefComplaint.trim(),
          symptoms: symptoms.trim() || chiefComplaint.trim(),
          bookingMethod: 'form',
        }),
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        const bookedToken = String(data.tokenNumber ?? '');
        setResultMsg(
          `Token #${data.tokenNumber} booked. Estimated wait: ${data.estimatedWaitMins ?? 0} mins.`
        );
        if (bookedToken) {
          setLookupToken(bookedToken);
          await lookupByToken(bookedToken);
        }
        setPatientName('');
        setPatientPhone('');
        setChiefComplaint('');
        setSymptoms('');
      } else {
        setResultMsg(data?.error || 'Could not book token.');
      }
    } catch {
      setResultMsg('Network error while booking token.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCheckTokenSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    lookupByToken(lookupToken);
  }

  const rxStatus = String(matchedRx?.pharmacy_status || 'in_queue').toLowerCase();
  const isReady = rxStatus === 'ready';
  const isPreparing = rxStatus === 'preparing';

  return (
    <VaaniShell
      badge="Patient Portal • Token & Live Wait"
      title="Book Queue Token & Live Wait"
      subtitle="Book your token or check medicine status by entering your token number."
    >
      <div className="space-y-4">
        <form
          onSubmit={handleBookSubmit}
          className={`rounded-2xl border p-5 space-y-4 transition ${
            isLight
              ? 'border-slate-300 bg-white text-slate-900 shadow-xs'
              : 'border-slate-800 bg-slate-900 text-slate-100'
          }`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Patient Name"
              className={`rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none ${
                isLight
                  ? 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
                  : 'border-slate-700 bg-slate-950 text-white placeholder:text-slate-500'
              }`}
            />
            <input
              type="tel"
              required
              value={patientPhone}
              onChange={(e) => setPatientPhone(e.target.value)}
              placeholder="10-digit Mobile Number"
              className={`rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none ${
                isLight
                  ? 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
                  : 'border-slate-700 bg-slate-950 text-white placeholder:text-slate-500'
              }`}
            />
          </div>

          <input
            type="text"
            required
            value={chiefComplaint}
            onChange={(e) => setChiefComplaint(e.target.value)}
            placeholder="Chief Complaint (e.g. 2 din se bukhar)"
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none ${
              isLight
                ? 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
                : 'border-slate-700 bg-slate-950 text-white placeholder:text-slate-500'
            }`}
          />

          <input
            type="text"
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            placeholder="Symptoms (optional)"
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none ${
              isLight
                ? 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
                : 'border-slate-700 bg-slate-950 text-white placeholder:text-slate-500'
            }`}
          />

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {submitting ? 'Booking...' : 'Book Token'}
          </button>

          {resultMsg && (
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-300">
              {resultMsg}
            </p>
          )}
        </form>

        <div
          className={`rounded-2xl border p-5 space-y-3 transition ${
            isLight
              ? 'border-slate-300 bg-white text-slate-900 shadow-xs'
              : 'border-slate-800 bg-slate-900 text-slate-100'
          }`}
        >
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Medicine Status by Token
          </div>

          <form onSubmit={handleCheckTokenSubmit} className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={lookupToken}
              onChange={(e) => setLookupToken(e.target.value)}
              placeholder="Enter Token Number (e.g. 5)"
              className={`flex-1 rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none ${
                isLight
                  ? 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
                  : 'border-slate-700 bg-slate-950 text-white placeholder:text-slate-500'
              }`}
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Check
            </button>
          </form>

          {matchedRx ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 text-xs">
              <div>
                <div className="font-bold text-sm">Token #{matchedRx.token_number}</div>
                <div className="mt-0.5 text-slate-600 dark:text-slate-300">
                  {matchedRx.medicines}
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 font-semibold shrink-0 ${
                  isReady
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                    : isPreparing
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                    : 'bg-slate-500/15 text-slate-700 dark:text-slate-300'
                }`}
              >
                {isReady ? 'Medicines Are Ready' : isPreparing ? 'Preparing' : 'In Queue'}
              </span>
            </div>
          ) : checkedOnce && lookupToken.replace(/\D/g, '').trim() ? (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Token #{lookupToken.replace(/\D/g, '').trim()} ke liye abhi koi prescription nahi mila.
            </div>
          ) : null}
        </div>
      </div>

      <VaaniVoiceAgent role="patient" languagePref="hi-IN" />
    </VaaniShell>
  );
}