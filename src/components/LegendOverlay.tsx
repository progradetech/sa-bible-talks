'use client';

import { useState } from 'react';
import type { Language, Ministry } from '@/lib/types';

const MINISTRIES: Ministry[] = ['Family', 'YoPro', 'Campus', 'Singles', 'Spanish'];
const LANGUAGES: Language[] = ['English', 'Spanish', 'Bilingual'];

interface Props {
  activeMinistries: Set<Ministry>;
  onToggleMinistry: (m: Ministry) => void;
  activeLanguages: Set<Language>;
  onToggleLanguage: (l: Language) => void;
  kidFriendlyOnly: boolean;
  onKidFriendlyToggle: (v: boolean) => void;
  ministryColors: Record<Ministry, string>;
}

export function LegendOverlay({
  activeMinistries,
  onToggleMinistry,
  activeLanguages,
  onToggleLanguage,
  kidFriendlyOnly,
  onKidFriendlyToggle,
  ministryColors,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const body = (
    <>
      <h2 className="text-xs md:text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
        Ministry
      </h2>
      <ul className="space-y-0.5">
        {MINISTRIES.map((m) => {
          const active = activeMinistries.has(m);
          return (
            <li key={m}>
              <button
                onClick={() => onToggleMinistry(m)}
                className="flex items-center gap-2 w-full text-left text-sm py-2 px-2 md:py-0.5 md:px-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0 border border-white/80 shadow-sm"
                  style={{
                    background: ministryColors[m],
                    opacity: active ? 1 : 0.25,
                  }}
                />
                <span className={active ? '' : 'opacity-50 line-through'}>{m}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <h2 className="text-xs md:text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-3 mb-1.5">
        Language
      </h2>
      <ul className="space-y-0.5">
        {LANGUAGES.map((l) => {
          const active = activeLanguages.has(l);
          return (
            <li key={l}>
              <button
                onClick={() => onToggleLanguage(l)}
                className="flex items-center w-full text-left text-sm py-2 px-2 md:py-0.5 md:px-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <span className={active ? '' : 'opacity-50 line-through'}>{l}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer select-none py-2 md:py-0">
        <input
          type="checkbox"
          checked={kidFriendlyOnly}
          onChange={(e) => onKidFriendlyToggle(e.target.checked)}
          className="rounded accent-blue-600 w-4 h-4"
        />
        <span>Kid-friendly only</span>
      </label>
    </>
  );

  return (
    <>
      {/* Desktop: always visible, fixed-width overlay */}
      <div className="hidden md:block absolute bottom-4 left-4 z-10 w-44 bg-white/95 dark:bg-zinc-900/95 backdrop-blur rounded-lg shadow-lg p-3 text-zinc-950 dark:text-zinc-50">
        {body}
      </div>

      {/* Mobile collapsed: chip button */}
      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Show filters"
          className="md:hidden absolute bottom-4 left-4 z-10 flex items-center gap-1.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur rounded-full shadow-lg px-3 py-2 text-sm font-medium text-zinc-950 dark:text-zinc-50"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filters
        </button>
      )}

      {/* Mobile expanded: bottom sheet */}
      {expanded && (
        <div className="md:hidden absolute inset-x-3 bottom-3 z-20 max-h-[70vh] overflow-y-auto bg-white/95 dark:bg-zinc-900/95 backdrop-blur rounded-lg shadow-lg p-4 text-zinc-950 dark:text-zinc-50">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Filters</h2>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Close filters"
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 leading-none text-lg"
            >
              ✕
            </button>
          </div>
          {body}
        </div>
      )}
    </>
  );
}
