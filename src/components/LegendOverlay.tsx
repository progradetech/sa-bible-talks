'use client';

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
  return (
    <div className="absolute bottom-4 left-4 z-10 w-44 bg-white/95 dark:bg-zinc-900/95 backdrop-blur rounded-lg shadow-lg p-3 text-zinc-950 dark:text-zinc-50">
      <h2 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
        Ministry
      </h2>
      <ul className="space-y-0.5">
        {MINISTRIES.map((m) => {
          const active = activeMinistries.has(m);
          return (
            <li key={m}>
              <button
                onClick={() => onToggleMinistry(m)}
                className="flex items-center gap-2 w-full text-left text-sm py-0.5 px-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
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

      <h2 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-3 mb-1.5">
        Language
      </h2>
      <ul className="space-y-0.5">
        {LANGUAGES.map((l) => {
          const active = activeLanguages.has(l);
          return (
            <li key={l}>
              <button
                onClick={() => onToggleLanguage(l)}
                className="flex items-center w-full text-left text-sm py-0.5 px-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <span className={active ? '' : 'opacity-50 line-through'}>{l}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer select-none">
        <input
          type="checkbox"
          checked={kidFriendlyOnly}
          onChange={(e) => onKidFriendlyToggle(e.target.checked)}
          className="rounded accent-blue-600"
        />
        <span>Kid-friendly only</span>
      </label>
    </div>
  );
}
