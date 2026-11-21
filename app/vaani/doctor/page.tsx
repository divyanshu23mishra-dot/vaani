'use client';

import React, { useCallback, useEffect, useState } from 'react';
import VaaniShell, { useVaaniTheme } from '@/components/vaani/VaaniShell';
import VaaniVoiceAgent from '@/components/vaani/VaaniVoiceAgent';

interface Appointment {
  id: string;
  token_number: number;
  patient_name: string;
  patient_phone: string;
  language_pref: string;
  chief_complaint: string;
  symptoms: string;
  status: string;
  estimated_wait_mins: number;
  created_at: string;
}

const STATUS_BADGE_DARK: Record<string, string> = {
  waiting: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  in_progress: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  completed: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  cancelled: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

const STATUS_BADGE_LIGHT: Record<string, string> = {
  waiting: 'bg-amber-100 text-amber-900 border-amber-300',
  in_progress: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  completed: 'bg-sky-100 text-sky-900 border-sky-300',
  cancelled: 'bg-rose-100 text-rose-900 border-rose-300',
};

function normalizeAppointments(rawData: Record<string, unknown>, fallbackIdxStart = 1): Appointment[] {
  const sourceList =
    (Array.isArray(rawData?.appointments) && rawData.appointments) ||
    (Array.isArray(rawData?.items) && rawData.items) ||
    (Array.isArray(rawData?.rows) && rawData.rows) ||
    (Array.isArray(rawData?.tokens) && rawData.tokens) ||
    (Array.isArray(rawData) && rawData) ||
    [];

  return sourceList.map((item, index) => {
    const row = (item || {}) as Record<string, unknown>;
    return {
      id: String(row.id ?? `apt_${index + 1}`),
      token_number: Number(row.token_number ?? row.tokenNumber ?? index + fallbackIdxStart) || index + 1,
      patient_name: String(row.patient_name ?? row.patientName ?? row.name ?? 'OPD Patient'),
      patient_phone: String(row.patient_phone ?? row.patientPhone ?? row.phone ?? ''),
      language_pref: String(row.language_pref ?? row.languagePref ?? 'hinglish'),
      chief_complaint: String(
        row.chief_complaint ?? row.chiefComplaint ?? row.complaint ?? 'General checkup'
      ),
      symptoms: String(row.symptoms ?? row.chief_complaint ?? row.chiefComplaint ?? ''),
      status: String(row.status ?? 'waiting'),
      estimated_wait_mins: Number(row.estimated_wait_mins ?? row.estimatedWaitMins ?? 0) || 0,
      created_at: String(row.created_at ?? row.createdAt ?? ''),
    };
  });
}

export default function DoctorQueuePage() {
  const [theme] = useVaaniTheme();
  const isLight = theme === 'light';

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [avgMins, setAvgMins] = useState<number>(8);
  const [delayBufferMins, setDelayBufferMins] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [emergencyMins, setEmergencyMins] = useState<string>('15');
  const [message, setMessage] = useState<string | null>(null);
  const [rxByApt, setRxByApt] = useState<Record<string, string>>({});

  const loadQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/vaani/appointments', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) {
        setAppointments(normalizeAppointments(data));
        if (typeof data.avgConsultationMins === 'number') setAvgMins(data.avgConsultationMins);
        if (typeof data.delayBufferMins === 'number') setDelayBufferMins(data.delayBufferMins);
      }
    } catch {
      // ignore transient network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
    const id = setInterval(loadQueue, 3000);
    return () => clearInterval(id);
  }, [loadQueue]);

  async function updateStatus(
    id: string,
    status: 'waiting' | 'in_progress' | 'completed' | 'cancelled'
  ) {
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/vaani/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || 'Could not update status');
      } else {
        await loadQueue();
      }
    } catch {
      setMessage('Network error updating status');
    } finally {
      setBusyId(null);
    }
  }

  async function sendToPharmacyForApt(apt: Appointment) {
    const meds = (rxByApt[apt.id] || '').trim();
    if (!meds) {
      setMessage(`Enter medicines for Token #${apt.token_number} first.`);
      return;
    }

    setBusyId(`rx_${apt.id}`);
    setMessage(null);
    try {
      const res = await fetch('/api/vaani/pharmacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: apt.id,
          tokenNumber: apt.token_number,
          patientName: apt.patient_name,
          patientPhone: apt.patient_phone,
          doctorName: 'Dr. Aarav Sharma',
          medicines: meds,
          notes: `Complaint: ${apt.chief_complaint}`,
          pharmacyStatus: 'in_queue',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success !== false) {
        setMessage(`Token #${apt.token_number} prescription sent to Pharmacy Queue.`);
        setRxByApt((prev) => ({ ...prev, [apt.id]: '' }));
      } else {
        setMessage(data?.error || 'Could not send to pharmacy queue.');
      }
    } catch {
      setMessage('Network error sending to pharmacy queue.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleEmergencyDelay(e: React.FormEvent) {
    e.preventDefault();
    const mins = Number(emergencyMins);
    if (!Number.isFinite(mins) || mins <= 0) {
      setMessage('Enter valid delay minutes (> 0).');
      return;
    }
    setBusyId('emergency');
    setMessage(null);
    try {
      const res = await fetch('/api/vaani/queue/emergency-delay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delayMins: mins, reason: 'Emergency / urgent consultation' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || 'Failed to apply emergency delay');
      } else {
        setMessage(`Added +${mins} min buffer. All active wait times recalculated.`);
        await loadQueue();
      }
    } catch {
      setMessage('Network error applying delay');
    } finally {
      setBusyId(null);
    }
  }

  const waitingCount = appointments.filter((a) => a.status === 'waiting').length;
  const activePatient = appointments.find((a) => a.status === 'in_progress');

  return (
    <VaaniShell
      badge="Doctor Desk • Live OPD Queue"
      title="Live Patient Queue"
      subtitle="Start consultations, prescribe medicines, and send directly to the pharmacy queue."
      rightSlot={
        <form onSubmit={handleEmergencyDelay} className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={180}
            value={emergencyMins}
            onChange={(e) => setEmergencyMins(e.target.value)}
            aria-label="Emergency delay minutes"
            className={`w-16 rounded-lg border px-2 py-1.5 text-xs ${
              isLight
                ? 'border-slate-300 bg-white text-slate-900'
                : 'border-slate-700 bg-slate-950 text-white'
            }`}
          />
          <button
            type="submit"
            disabled={busyId === 'emergency'}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
              isLight
                ? 'border-amber-400 bg-amber-100 text-amber-950 hover:bg-amber-200'
                : 'border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
            }`}
          >
            + Emergency Delay
          </button>
        </form>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          className={`rounded-xl border p-3.5 ${
            isLight ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-900'
          }`}
        >
          <div className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Waiting Tokens
          </div>
          <div className={`mt-1 text-2xl font-bold ${isLight ? 'text-slate-950' : 'text-white'}`}>
            {waitingCount}
          </div>
        </div>
        <div
          className={`rounded-xl border p-3.5 ${
            isLight ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-900'
          }`}
        >
          <div className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Active Token
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-300">
            {activePatient ? `#${activePatient.token_number}` : '—'}
          </div>
        </div>
        <div
          className={`rounded-xl border p-3.5 ${
            isLight ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-900'
          }`}
        >
          <div className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Avg Slot</div>
          <div className={`mt-1 text-2xl font-bold ${isLight ? 'text-slate-950' : 'text-white'}`}>
            {avgMins}m
          </div>
        </div>
        <div
          className={`rounded-xl border p-3.5 ${
            isLight ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-900'
          }`}
        >
          <div className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Delay Buffer
          </div>
          <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-300">
            +{delayBufferMins}m
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-2.5 text-xs ${
            isLight
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          {message}
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <div
            className={`rounded-2xl border p-6 text-sm ${
              isLight
                ? 'border-slate-300 bg-white text-slate-600'
                : 'border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            Loading queue...
          </div>
        ) : appointments.length === 0 ? (
          <div
            className={`rounded-2xl border p-6 text-sm ${
              isLight
                ? 'border-slate-300 bg-white text-slate-600'
                : 'border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            No tokens in queue yet.
          </div>
        ) : (
          appointments.map((apt) => {
            const isActive = apt.status === 'in_progress';
            const badgeMap = isLight ? STATUS_BADGE_LIGHT : STATUS_BADGE_DARK;
            return (
              <div
                key={apt.id}
                className={`rounded-2xl border p-4 space-y-3 ${
                  isActive
                    ? isLight
                      ? 'border-emerald-600 bg-emerald-50/70'
                      : 'border-emerald-400/60 bg-emerald-950/20'
                    : isLight
                    ? 'border-slate-300 bg-white'
                    : 'border-slate-800 bg-slate-900'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                          isLight ? 'bg-slate-900 text-white' : 'bg-slate-800 text-white'
                        }`}
                      >
                        Token #{apt.token_number}
                      </span>
                      <span className={`font-semibold ${isLight ? 'text-slate-950' : 'text-white'}`}>
                        {apt.patient_name}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          badgeMap[apt.status] ||
                          (isLight
                            ? 'border-slate-300 bg-slate-100 text-slate-800'
                            : 'border-slate-700 bg-slate-800 text-slate-300')
                        }`}
                      >
                        {apt.status}
                      </span>
                      <span
                        className={`text-xs ${
                          isLight ? 'text-emerald-800 font-medium' : 'text-emerald-300'
                        }`}
                      >
                        Est. Wait: {apt.estimated_wait_mins} min
                      </span>
                    </div>
                    <div className={`text-sm ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                      Complaint: {apt.chief_complaint}
                    </div>
                    <div className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                      Phone: {apt.patient_phone} • Lang: {apt.language_pref}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === apt.id || apt.status === 'in_progress'}
                      onClick={() => updateStatus(apt.id, 'in_progress')}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                        isLight
                          ? 'border-emerald-400 bg-emerald-100 text-emerald-950 hover:bg-emerald-200'
                          : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                      }`}
                    >
                      Start Consult
                    </button>
                    <button
                      type="button"
                      disabled={busyId === apt.id || apt.status === 'completed'}
                      onClick={() => updateStatus(apt.id, 'completed')}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                        isLight
                          ? 'border-sky-400 bg-sky-100 text-sky-950 hover:bg-sky-200'
                          : 'border-sky-500/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25'
                      }`}
                    >
                      Complete
                    </button>
                    <button
                      type="button"
                      disabled={busyId === apt.id || apt.status === 'cancelled'}
                      onClick={() => updateStatus(apt.id, 'cancelled')}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                        isLight
                          ? 'border-rose-400 bg-rose-100 text-rose-950 hover:bg-rose-200'
                          : 'border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                      }`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <input
                    type="text"
                    value={rxByApt[apt.id] || ''}
                    onChange={(e) =>
                      setRxByApt((prev) => ({ ...prev, [apt.id]: e.target.value }))
                    }
                    placeholder={`Prescribe medicines for Token #${apt.token_number} (e.g. Tab Paracetamol 500mg BD x 3 days)`}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none ${
                      isLight
                        ? 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
                        : 'border-slate-700 bg-slate-950 text-white placeholder:text-slate-500'
                    }`}
                  />
                  <button
                    type="button"
                    disabled={busyId === `rx_${apt.id}`}
                    onClick={() => sendToPharmacyForApt(apt)}
                    className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 shrink-0"
                  >
                    {busyId === `rx_${apt.id}` ? 'Sending...' : 'Send to Pharmacy'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <VaaniVoiceAgent role="doctor" languagePref="hi-IN" />
    </VaaniShell>
  );
}