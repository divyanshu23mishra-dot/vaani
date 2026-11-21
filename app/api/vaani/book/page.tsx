'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface CreatedAppointment {
  id: string;
  token_number: number;
  status: string;
  chief_complaint: string;
  patient_name: string | null;
  language_pref: string | null;
  patients_ahead?: number;
  estimated_wait_mins?: number;
}

export default function VaaniBookAppointmentPage() {
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [languagePref, setLanguagePref] = useState('hi-IN');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CreatedAppointment | null>(null);

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCreated(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/vaani/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName,
          patientPhone,
          languagePref,
          chiefComplaint,
          symptoms,
          bookingMethod: 'text',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.success) {
        setError(data?.error || 'Could not book appointment');
        return;
      }

      setCreated(data.appointment);
      setPatientName('');
      setPatientPhone('');
      setChiefComplaint('');
      setSymptoms('');
    } catch {
      setError('Network error while booking appointment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-block rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20">
              Vaani AI • Patient Intake
            </span>
            <h1 className="mt-3 text-2xl font-bold text-white">Book Queue Token</h1>
            <p className="mt-1 text-sm text-slate-400">
              Enter patient details and symptoms to join the live queue.
            </p>
          </div>

          <Link
            href="/vaani/doctor"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition shrink-0"
          >
            Doctor Queue
          </Link>
        </div>

        <form onSubmit={handleBook} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Patient Name *
            </label>
            <input
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="e.g. Rohan Verma"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                placeholder="9876543210"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Preferred Language
              </label>
              <select
                value={languagePref}
                onChange={(e) => setLanguagePref(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="hi-IN">Hindi (hi-IN)</option>
                <option value="en-IN">English (en-IN)</option>
                <option value="kn-IN">Kannada (kn-IN)</option>
                <option value="ta-IN">Tamil (ta-IN)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Chief Complaint *
            </label>
            <input
              type="text"
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              placeholder="e.g. Fever and throat pain for 2 days"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Additional Symptoms
            </label>
            <textarea
              rows={2}
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder="Mild body ache, cold..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition"
          >
            {submitting ? 'Generating Token...' : 'Book Token'}
          </button>
        </form>

        {created && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-emerald-300">
                Token #{created.token_number} generated ({created.status})
              </p>
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-200">
                Est. Wait: ~{created.estimated_wait_mins ?? 0} mins
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Patient: {created.patient_name || 'Patient'} • Patients Ahead: {created.patients_ahead ?? 0}
            </p>
            <p className="text-xs text-slate-400">
              Complaint: {created.chief_complaint}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}