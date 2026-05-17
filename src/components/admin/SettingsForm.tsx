'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SiteSettings } from '@/lib/repos/site-settings';

interface Props {
  initial: SiteSettings;
}

export function SettingsForm({ initial }: Props) {
  const router = useRouter();
  const [publicIndexable, setPublicIndexable] = useState(initial.publicIndexable);
  const [defaultJitterMiles, setDefaultJitterMiles] = useState(
    initial.defaultJitterMiles.toString(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const jitter = parseFloat(defaultJitterMiles);
    if (isNaN(jitter) || jitter <= 0) {
      setError('Default jitter must be a positive number.');
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicIndexable,
          defaultJitterMiles: jitter,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Save failed');
        setSubmitting(false);
        return;
      }
      setSavedAt(new Date());
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-5">
        <h2 className="text-base font-semibold mb-1">Public visibility</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
          When off, the site emits <code>noindex</code> meta and{' '}
          <code>robots.txt</code> returns <code>Disallow: /</code>. The site still
          renders for anyone with the URL — only Google crawling is blocked.
        </p>
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={publicIndexable}
            onChange={(e) => setPublicIndexable(e.target.checked)}
            className="mt-1 rounded accent-blue-600"
          />
          <div>
            <div className="text-sm font-medium">Allow search-engine indexing</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Currently:{' '}
              <span className={publicIndexable ? 'text-green-600' : 'text-zinc-500'}>
                {publicIndexable ? 'public, indexable' : 'soft-launch, not indexable'}
              </span>
            </div>
          </div>
        </label>
      </section>

      <section className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-5">
        <h2 className="text-base font-semibold mb-1">Default jitter radius</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
          The size of the public-map circle for leaders who haven&apos;t set a
          per-row override. Larger = more privacy, less useful for matching to a
          neighborhood. Recommended 1.5 mi.
        </p>
        <div className="flex items-baseline gap-2">
          <input
            type="number"
            step="0.1"
            min="0.1"
            max="50"
            value={defaultJitterMiles}
            onChange={(e) => setDefaultJitterMiles(e.target.value)}
            className="w-full max-w-[8rem] px-3 py-2 md:py-1.5 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-sm text-zinc-500">miles</span>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 italic">
          Note: changing this only affects new leaders or leaders re-saved after
          the change. Existing approx_lat/approx_lng aren&apos;t recomputed.
        </p>
      </section>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
        {savedAt && (
          <span className="text-xs text-zinc-500">
            Saved {savedAt.toLocaleTimeString()}
          </span>
        )}
      </div>
    </form>
  );
}
