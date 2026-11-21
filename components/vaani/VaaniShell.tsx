'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type VaaniTheme = 'dark' | 'light';

const THEME_EVENT = 'vaani-theme-change';

export function useVaaniTheme(): [VaaniTheme, () => void] {
  const [theme, setTheme] = useState<VaaniTheme>('dark');

  useEffect(() => {
    const readTheme = (): VaaniTheme => {
      const saved = window.localStorage.getItem('vaani-theme');
      return saved === 'light' ? 'light' : 'dark';
    };

    setTheme(readTheme());

    const handleSync = (e: Event) => {
      const custom = e as CustomEvent<VaaniTheme>;
      if (custom.detail === 'light' || custom.detail === 'dark') {
        setTheme(custom.detail);
      } else {
        setTheme(readTheme());
      }
    };

    window.addEventListener(THEME_EVENT, handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener(THEME_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  function toggleTheme() {
    const current = window.localStorage.getItem('vaani-theme') === 'light' ? 'light' : 'dark';
    const next: VaaniTheme = current === 'dark' ? 'light' : 'dark';
    window.localStorage.setItem('vaani-theme', next);
    setTheme(next);
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
  }

  return [theme, toggleTheme];
}

interface VaaniShellProps {
  badge: string;
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}

const NAV_LINKS = [
  { href: '/vaani', label: 'Home' },
  { href: '/vaani/book', label: 'Patient Book' },
  { href: '/vaani/doctor', label: 'Doctor Queue' },
  { href: '/vaani/pharmacy', label: 'Pharmacy' },
];

export default function VaaniShell({
  badge,
  title,
  subtitle,
  rightSlot,
  children,
}: VaaniShellProps) {
  const pathname = usePathname();
  const [theme, toggleTheme] = useVaaniTheme();
  const isLight = theme === 'light';

  return (
    <div
      data-vaani-theme={theme}
      className={`min-h-screen transition-colors duration-200 ${
        isLight
          ? 'bg-slate-100 text-slate-900'
          : 'bg-[#070b14] text-slate-100'
      }`}
    >
      <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
        <header
          className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 transition-colors print:hidden ${
            isLight
              ? 'border-slate-300 bg-white shadow-sm'
              : 'border-slate-800 bg-slate-900/95 shadow-lg shadow-black/30'
          }`}
        >
          <div>
            <span
              className={`inline-block rounded-full px-3 py-0.5 text-xs font-semibold border ${
                isLight
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              }`}
            >
              {badge}
            </span>
            <h1
              className={`mt-2 text-2xl font-bold tracking-tight ${
                isLight ? 'text-slate-950' : 'text-white'
              }`}
            >
              {title}
            </h1>
            {subtitle && (
              <p className={`mt-0.5 text-sm ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex flex-wrap items-center gap-1.5">
              {NAV_LINKS.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? isLight
                          ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                          : 'bg-emerald-400 text-slate-950 font-semibold shadow-xs'
                        : isLight
                        ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                        : 'bg-slate-800/90 text-slate-200 hover:bg-slate-700 border border-slate-700/80'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle dark or light theme"
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                isLight
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
                  : 'border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20'
              }`}
            >
              {isLight ? 'Dark Mode' : 'Light Mode'}
            </button>

            {rightSlot}
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}