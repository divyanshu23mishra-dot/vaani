'use client';

import React, { useCallback, useEffect, useState } from 'react';
import VaaniShell, { useVaaniTheme } from '@/components/vaani/VaaniShell';

type PharmacyStatus = 'in_queue' | 'preparing' | 'ready';

interface PrescriptionItem {
  id: string;
  appointment_id?: string | null;
  token_number?: number | null;
  patient_name?: string | null;
  patient_phone?: string | null;
  doctor_name: string;
  medicines: string;
  notes?: string | null;
  pharmacy_status: string;
  created_at?: string;
}

function normalizeStatus(raw?: string): PharmacyStatus {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'ready' || s === 'dispensed' || s === 'completed') return 'ready';
  if (s === 'preparing' || s === 'in_progress') return 'preparing';
  return 'in_queue';
}

function statusLabel(st: PharmacyStatus): string {
  if (st === 'ready') return 'Ready';
  if (st === 'preparing') return 'Preparing';
  return 'In Queue';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPharmacyPdfHtml(item: PrescriptionItem, fallbackTokenNum: number): string {
  const tokenNum = item.token_number ?? fallbackTokenNum;
  const rows = escapeHtml(item.medicines)
    .split(/(?:,|;|\band\b|\baur\b|\n)+/i)
    .map((m) => m.trim())
    .filter(Boolean);

  const tableRows = (rows.length ? rows : [escapeHtml(item.medicines)])
    .map(
      (med, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${med}</strong></td>
        <td>${escapeHtml(statusLabel(normalizeStatus(item.pharmacy_status)))}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Prescription - Token #${tokenNum}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; padding: 24px; background: #f8fafc; color: #0f172a; }
    .sheet { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; }
    .hdr { background: #065f46; color: #fff; padding: 18px 24px; display: flex; justify-content: space-between; }
    .hdr h1 { margin: 0; font-size: 19px; }
    .hdr p { margin: 4px 0 0; font-size: 12px; opacity: 0.9; }
    .body { padding: 22px 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; background: #f1f5f9; color: #475569; font-size: 12px; padding: 10px 12px; border-bottom: 2px solid #e2e8f0; }
    td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
    @media print { body { background: #fff; padding: 0; } .sheet { border: none; } }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="hdr">
      <div>
        <h1>Vaani AI • Pharmacy Prescription</h1>
        <p>Token #${tokenNum}</p>
      </div>
      <div style="text-align:right;font-size:12px;">
        <div><strong>Doctor:</strong> ${escapeHtml(item.doctor_name || 'Dr. Aarav Sharma')}</div>
        <div><strong>Date:</strong> ${new Date().toLocaleDateString('en-IN')}</div>
      </div>
    </div>
    <div class="body">
      <table>
        <thead>
          <tr><th>#</th><th>Medicine</th><th>Status</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 150); };</script>
</body>
</html>`;
}

export default function VaaniPharmacyPage() {
  const [theme] = useVaaniTheme();
  const isLight = theme === 'light';

  const [items, setItems] = useState<PrescriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadPrescriptions = useCallback(async () => {
    try {
      const res = await fetch('/api/vaani/pharmacy', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        const list: PrescriptionItem[] =
          data.prescriptions || data.items || data.pharmacy || (Array.isArray(data) ? data : []);
        setItems(list);
      }
    } catch {
      // ignore transient network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrescriptions();
    const id = setInterval(loadPrescriptions, 3000);
    return () => clearInterval(id);
  }, [loadPrescriptions]);

  function openPrescriptionPdf(item: PrescriptionItem, fallbackTokenNum: number) {
    const win = window.open('', '_blank', 'width=800,height=880');
    if (!win) return;
    win.document.write(buildPharmacyPdfHtml(item, fallbackTokenNum));
    win.document.close();
  }

  async function setStatus(item: PrescriptionItem, nextStatus: PharmacyStatus) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/vaani/pharmacy/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pharmacyStatus: nextStatus,
          status: nextStatus,
        }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((row) => (row.id === item.id ? { ...row, pharmacy_status: nextStatus } : row))
        );
        await loadPrescriptions();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <VaaniShell
      badge="Pharmacy Desk"
      title="Pharmacy Queue"
      subtitle="Check token number and PDF, then update step by step: In Queue, Preparing, or Ready."
    >
      <div className="space-y-3">
        {loading ? (
          <div
            className={`rounded-2xl border p-6 text-sm ${
              isLight
                ? 'border-slate-300 bg-white text-slate-600'
                : 'border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            Loading prescriptions...
          </div>
        ) : items.length === 0 ? (
          <div
            className={`rounded-2xl border p-6 text-sm ${
              isLight
                ? 'border-slate-300 bg-white text-slate-600'
                : 'border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            No prescriptions in queue yet.
          </div>
        ) : (
          items.map((item, idx) => {
            const current = normalizeStatus(item.pharmacy_status);
            const fallbackNum = idx + 1;
            const tokenDisplay = item.token_number
              ? `Token #${item.token_number}`
              : `Token #${fallbackNum}`;

            return (
              <div
                key={item.id}
                className={`rounded-2xl border p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 ${
                  isLight
                    ? 'border-slate-300 bg-white text-slate-900'
                    : 'border-slate-800 bg-slate-900 text-slate-100'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                        isLight ? 'bg-slate-900 text-white' : 'bg-slate-800 text-white'
                      }`}
                    >
                      {tokenDisplay}
                    </span>

                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        current === 'ready'
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : current === 'preparing'
                          ? 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {statusLabel(current)}
                    </span>

                    <button
                      type="button"
                      onClick={() => openPrescriptionPdf(item, fallbackNum)}
                      className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                    >
                      View PDF
                    </button>
                  </div>

                  <div className="text-sm font-medium whitespace-pre-wrap">{item.medicines}</div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === item.id || current === 'in_queue'}
                    onClick={() => setStatus(item, 'in_queue')}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-45 ${
                      current === 'in_queue'
                        ? 'border-slate-500 bg-slate-700 text-white'
                        : isLight
                        ? 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                        : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    In Queue
                  </button>

                  <button
                    type="button"
                    disabled={busyId === item.id || current === 'preparing'}
                    onClick={() => setStatus(item, 'preparing')}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-45 ${
                      current === 'preparing'
                        ? 'border-amber-500 bg-amber-500 text-slate-950'
                        : isLight
                        ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                        : 'border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                    }`}
                  >
                    Preparing
                  </button>

                  <button
                    type="button"
                    disabled={busyId === item.id || current === 'ready'}
                    onClick={() => setStatus(item, 'ready')}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-45 ${
                      current === 'ready'
                        ? 'border-emerald-500 bg-emerald-600 text-white'
                        : isLight
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                        : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                    }`}
                  >
                    Ready
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </VaaniShell>
  );
}