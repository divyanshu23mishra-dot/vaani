'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import VaaniShell, { useVaaniTheme } from '@/components/vaani/VaaniShell';
import VaaniVoiceAgent from '@/components/vaani/VaaniVoiceAgent';

const CARDS = [
  {
    href: '/vaani/book',
    tag: 'Patient Portal',
    title: 'Book Queue Token & Live Wait',
    desc: 'Generate a token, check real-time estimated wait time, and view ready prescriptions by mobile number.',
  },
  {
    href: '/vaani/doctor',
    tag: 'Doctor Desk',
    title: 'Live Patient Queue',
    desc: 'Manage waiting tokens, start consultations, handle emergency delays, and update patient flow.',
  },
  {
    href: '/vaani/pharmacy',
    tag: 'Doctor & Pharmacy',
    title: 'Prescriptions, PDF & WhatsApp',
    desc: 'Fill prescriptions, generate printable hospital PDF sheets, and dispatch to patient & medicine shop.',
  },
];

export default function VaaniHomePage() {
  const [theme] = useVaaniTheme();
  const isLight = theme === 'light';
  const [agentRole, setAgentRole] = useState<'patient' | 'doctor'>('patient');

  return (
    <VaaniShell
      badge="Vaani AI • Smart OPD & Queue System"
      title="Vaani AI Workspace"
      subtitle="Patient intake, real-time queue estimates, doctor desk, and pharmacy dispatch."
      rightSlot={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAgentRole('patient')}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
              agentRole === 'patient'
                ? 'bg-emerald-500 text-slate-950'
                : isLight
                ? 'bg-slate-100 text-slate-700'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            Patient Mode
          </button>
          <button
            type="button"
            onClick={() => setAgentRole('doctor')}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
              agentRole === 'doctor'
                ? 'bg-emerald-500 text-slate-950'
                : isLight
                ? 'bg-slate-100 text-slate-700'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            Doctor Mode
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={`group rounded-2xl border p-5 transition space-y-2.5 ${
              isLight
                ? 'border-slate-300 bg-white text-slate-900 shadow-xs hover:border-emerald-600 hover:shadow-md'
                : 'border-slate-800 bg-slate-900 text-slate-100 shadow-sm hover:border-emerald-400/70'
            }`}
          >
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                isLight
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              }`}
            >
              {card.tag}
            </span>
            <h2
              className={`text-lg font-bold transition ${
                isLight
                  ? 'text-slate-950 group-hover:text-emerald-700'
                  : 'text-white group-hover:text-emerald-300'
              }`}
            >
              {card.title}
            </h2>
            <p
              className={`text-sm leading-relaxed ${
                isLight ? 'text-slate-600' : 'text-slate-400'
              }`}
            >
              {card.desc}
            </p>
          </Link>
        ))}
      </div>

      <VaaniVoiceAgent role={agentRole} languagePref="hi-IN" />
    </VaaniShell>
  );
}