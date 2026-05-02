'use client';

import { useEffect, useRef, useState } from 'react';

interface TurnstileApi {
  render: (
    el: HTMLElement | string,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      'error-callback'?: () => void;
      'expired-callback'?: () => void;
      theme?: 'light' | 'dark' | 'auto';
    },
  ) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

interface Props {
  leaderId: string | null;
  onClose: () => void;
}

export function VisitorRequestModal({ leaderId, onClose }: Props) {
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal closes (leaderId becomes null)
  useEffect(() => {
    if (leaderId === null) {
      setName('');
      setEmail('');
      setPhone('');
      setMessage('');
      setTurnstileToken(null);
      setSubmitting(false);
      setSubmitted(false);
      setError(null);
    }
  }, [leaderId]);

  // Render the Turnstile widget when the modal opens. Polls until the
  // Turnstile script (loaded by PublicMap via next/script) is available.
  useEffect(() => {
    if (!leaderId) return;

    const siteKey = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY;
    if (!siteKey) {
      console.error('NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY not set');
      return;
    }

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const tryRender = () => {
      if (cancelled) return true;
      if (!window.turnstile || !turnstileContainerRef.current) return false;
      if (widgetIdRef.current) return true;
      widgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => setTurnstileToken(token),
        'error-callback': () => setTurnstileToken(null),
        'expired-callback': () => setTurnstileToken(null),
        theme: 'auto',
      });
      return true;
    };

    if (!tryRender()) {
      interval = setInterval(() => {
        if (tryRender() && interval) clearInterval(interval);
      }, 100);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      // Turnstile.remove() warns if the widget element is already gone from
      // the DOM (React unmounts the modal before this cleanup runs). The
      // warning is cosmetic — browser GC handles the orphaned iframe — but
      // we swallow it so the console stays useful for real issues.
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* widget already removed with parent DOM */
        }
      }
      widgetIdRef.current = null;
    };
  }, [leaderId]);

  // Close on Escape
  useEffect(() => {
    if (!leaderId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [leaderId, onClose]);

  if (!leaderId) return null;

  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    message.trim().length > 0 &&
    turnstileToken !== null &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/visitor-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetBibleTalkId: leaderId,
          visitorName: name.trim(),
          visitorEmail: email.trim(),
          visitorPhone: phone.trim() || undefined,
          message: message.trim(),
          turnstileToken,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (res.status === 429) {
          setError('Too many requests. Please wait a bit and try again.');
        } else if (data.error === 'turnstile_failed') {
          setError('Verification failed. Please try the checkbox again.');
        } else if (data.error === 'missing_field') {
          setError('Please fill in all required fields.');
        } else {
          setError('Something went wrong. Please try again.');
        }
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
        setTurnstileToken(null);
        return;
      }

      setSubmitted(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md p-6 text-zinc-950 dark:text-zinc-50">
        {submitted ? (
          <div>
            <h2 className="text-lg font-semibold mb-2">Message forwarded</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-5">
              We forwarded your message to the host. They&apos;ll reply directly to{' '}
              <span className="font-medium">{email}</span>.
            </p>
            <button
              onClick={onClose}
              className="bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-lg font-semibold">Request to Visit</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 -mr-1 -mt-1 p-1 leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
              Your message goes to the host. They&apos;ll reply directly to the email you
              provide. They never see this site&apos;s admin.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">
                  First name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Phone <span className="text-zinc-400 font-normal">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  required
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>

              <div ref={turnstileContainerRef} className="flex justify-center pt-1" />
            </div>

            {error && (
              <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
