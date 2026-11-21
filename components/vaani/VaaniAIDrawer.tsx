'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface VaaniBookingContext {
  patient_name?: string;
  phone?: string;
  age?: number | string;
  gender?: string;
  department?: string;
  symptoms?: string;
  visit_type?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'vaani';
  text: string;
  tokenNumber?: number;
}

interface VaaniAiDrawerProps {
  role?: 'patient' | 'doctor' | 'pharmacy';
  bookingContext?: VaaniBookingContext;
  onBooked?: (appointment: Record<string, unknown>) => void;
}

export default function VaaniAiDrawer({
  role = 'patient',
  bookingContext,
  onBooked,
}: VaaniAiDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [showConfirmBar, setShowConfirmBar] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'vaani',
      text: 'Namaste! Main Vaani AI hoon. Appointment book karne ke liye bolein ya type karein "booking kar do".',
    },
  ]);

  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  async function sendToAgent(rawText: string, forceConfirm = false) {
    const clean = rawText.trim();
    if (!clean && !forceConfirm) return;

    const displayText = clean || 'Haan confirm kar do';
    setMessages((prev) => [
      ...prev,
      { id: `u_${Date.now()}`, sender: 'user', text: displayText },
    ]);
    setInputText('');
    setLoading(true);

    try {
      const res = await fetch('/api/vaani/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: displayText,
          role,
          confirm: forceConfirm,
          intent: forceConfirm ? 'confirm_action' : undefined,
          context: bookingContext || {},
        }),
      });

      const data = await res.json();
      const reply: string =
        data?.replyText || 'Response receive nahi ho paaya. Kripya dobara try karein.';
      const bookedApt = data?.toolResult?.appointment;
      const tokenNum = bookedApt?.token_number;

      setMessages((prev) => [
        ...prev,
        {
          id: `v_${Date.now()}`,
          sender: 'vaani',
          text: reply,
          tokenNumber: typeof tokenNum === 'number' ? tokenNum : undefined,
        },
      ]);

      if (data?.toolResult?.booked && bookedApt) {
        setShowConfirmBar(false);
        onBooked?.(bookedApt);
      } else if (data?.pendingAction?.type === 'book_appointment') {
        setShowConfirmBar(true);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'vaani',
          text: 'Network error aaya. Kripya connection check karke dobara bhejein.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleVoiceInput() {
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setMessages((prev) => [
        ...prev,
        {
          id: `voice_na_${Date.now()}`,
          sender: 'vaani',
          text: 'Is browser mein voice recognition support nahi hai—neeche backup chat use karein.',
        },
      ]);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRec as any)();
    recognition.lang = 'hi-IN';
    recognition.interimResults = false;
    setListening(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const spoken = event?.results?.[0]?.[0]?.transcript || '';
      if (spoken) {
        void sendToAgent(spoken, false);
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
  }

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-700"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-lime-300" />
        <span>Vaani AI</span>
      </button>

      {/* Straight Vertical Panel (Ask-Gemini Style Right Rail) */}
      {isOpen && (
        <aside className="fixed top-0 right-0 z-50 flex h-screen w-full max-w-[420px] flex-col border-l border-slate-200 bg-white shadow-2xl">
          {/* Top Vertical Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">Vaani AI</h2>
                <p className="text-[11px] text-slate-500">Vertical Assistant • {role}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg px-2.5 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
              aria-label="Close Vaani AI"
            >
              ✕
            </button>
          </div>

          {/* Vertical Scrollable Thread */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-slate-900 text-white'
                      : 'border border-emerald-200 bg-emerald-50/70 text-slate-800'
                  }`}
                >
                  {msg.text}
                </div>
                {msg.tokenNumber !== undefined && (
                  <span className="mt-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    Token #{msg.tokenNumber} Confirmed
                  </span>
                )}
              </div>
            ))}

            {loading && (
              <div className="text-xs font-medium text-slate-500">Vaani AI soch rahi hai...</div>
            )}
            <div ref={listEndRef} />
          </div>

          {/* Vertical Stack Bottom Controls */}
          <div className="space-y-2.5 border-t border-slate-200 bg-slate-50 p-3.5">
            {showConfirmBar && (
              <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <span className="font-medium">Confirm book appointment?</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => void sendToAgent('Haan confirm kar do', true)}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-700"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirmBar(false)}
                    className="rounded-lg bg-slate-800 px-2.5 py-1 font-semibold text-white hover:bg-slate-900"
                  >
                    No
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleVoiceInput}
              className={`w-full rounded-xl py-2.5 text-sm font-semibold text-white transition ${
                listening
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {listening ? 'Listening... Boliye' : 'Speak (Primary Voice)'}
            </button>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendToAgent(inputText, false);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type here (e.g. booking kar do)..."
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600"
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </div>
        </aside>
      )}
    </>
  );
}