'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Language, Ministry, PrivateLeader } from '@/lib/types';

const MINISTRIES: Ministry[] = ['Family', 'YoPro', 'Campus', 'Singles', 'Spanish'];
const LANGUAGES: Language[] = ['English', 'Spanish', 'Bilingual'];

interface Props {
  leader: PrivateLeader | null; // null = create mode
  onCancel: () => void;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}

export function LeaderEditForm({ leader, onCancel, onSaved, onDeleted }: Props) {
  const router = useRouter();
  const isCreating = leader === null;

  const [name, setName] = useState(leader?.name ?? '');
  const [email, setEmail] = useState(leader?.email ?? '');
  const [phone, setPhone] = useState(leader?.phone ?? '');
  const [address, setAddress] = useState(leader?.address ?? '');
  const [ministry, setMinistry] = useState<Ministry>(leader?.ministry ?? 'Family');
  const [language, setLanguage] = useState<Language>(leader?.language ?? 'English');
  const [kidFriendly, setKidFriendly] = useState(leader?.kidFriendly ?? false);
  const [groupName, setGroupName] = useState(leader?.groupName ?? '');
  const [showGroupName, setShowGroupName] = useState(leader?.showGroupName ?? false);
  const [meetingInfo, setMeetingInfo] = useState(leader?.meetingInfo ?? '');
  const [adminNotes, setAdminNotes] = useState(leader?.adminNotes ?? '');
  const [exactLat, setExactLat] = useState<string>(
    leader?.exactLat !== undefined ? leader.exactLat.toString() : '',
  );
  const [exactLng, setExactLng] = useState<string>(
    leader?.exactLng !== undefined ? leader.exactLng.toString() : '',
  );
  const [jitterMiles, setJitterMiles] = useState<string>(
    leader?.jitterMiles !== null && leader?.jitterMiles !== undefined
      ? leader.jitterMiles.toString()
      : '',
  );
  const [hideFromPublicMap, setHideFromPublicMap] = useState(leader?.hideFromPublicMap ?? false);
  const [isPaused, setIsPaused] = useState(leader?.isPaused ?? false);
  const [isActive, setIsActive] = useState(leader?.isActive ?? true);

  const [submitting, setSubmitting] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleGeocode() {
    if (!address.trim()) {
      setError('Address required to geocode');
      return;
    }
    setGeocoding(true);
    setError(null);
    try {
      const res = await fetch('/api/locations/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Geocoding failed');
        return;
      }
      const data = (await res.json()) as {
        lat: number;
        lng: number;
        confidence: 'exact' | 'zip' | 'fallback';
      };
      setExactLat(data.lat.toString());
      setExactLng(data.lng.toString());
      if (data.confidence !== 'exact') {
        setError(
          `Geocoded to ${data.confidence === 'zip' ? 'zip-code' : 'fallback'} accuracy. Verify or correct lat/lng manually.`,
        );
      }
    } catch {
      setError('Network error during geocoding');
    } finally {
      setGeocoding(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const lat = parseFloat(exactLat);
    const lng = parseFloat(exactLng);
    if (isNaN(lat) || isNaN(lng)) {
      setError('Lat/Lng required. Click Lookup or enter manually.');
      setSubmitting(false);
      return;
    }

    const jm = jitterMiles.trim();
    const body = {
      name: name.trim(),
      address: address.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      ministry,
      language,
      kidFriendly,
      groupName: groupName.trim() || undefined,
      showGroupName,
      meetingInfo: meetingInfo.trim() || undefined,
      adminNotes: adminNotes.trim() || undefined,
      exactLat: lat,
      exactLng: lng,
      jitterMiles: jm ? parseFloat(jm) : undefined,
      hideFromPublicMap,
      isPaused,
      isActive,
    };

    const url = isCreating ? '/api/locations' : `/api/locations/${leader!.id}`;
    const method = isCreating ? 'POST' : 'PATCH';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || `${method.toLowerCase()} failed`);
        setSubmitting(false);
        return;
      }
      const data = isCreating ? ((await res.json()) as { id: string }) : null;
      router.refresh();
      onSaved(isCreating ? data!.id : leader!.id);
    } catch {
      setError('Network error during save');
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!leader) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/locations/${leader.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Delete failed');
        setSubmitting(false);
        setConfirmingDelete(false);
        return;
      }
      router.refresh();
      onDeleted();
    } catch {
      setError('Network error during delete');
      setSubmitting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <aside className="absolute right-3 top-3 bottom-3 z-20 w-[420px] bg-white dark:bg-zinc-900 rounded-lg shadow-2xl flex flex-col text-zinc-950 dark:text-zinc-50 overflow-hidden">
      <header className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">
            {isCreating ? 'New leader' : `Edit ${leader.name}`}
          </h3>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {isCreating ? 'Encrypted on save' : 'Changes encrypt and re-jitter on save'}
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 -m-1 leading-none flex-shrink-0"
        >
          ✕
        </button>
      </header>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
        <Section label="Identity">
          <Input label="Name" value={name} onChange={setName} required />
          <div className="grid grid-cols-2 gap-2">
            <Select<Ministry>
              label="Ministry"
              value={ministry}
              onChange={setMinistry}
              options={MINISTRIES}
            />
            <Select<Language>
              label="Language"
              value={language}
              onChange={setLanguage}
              options={LANGUAGES}
            />
          </div>
          <Checkbox
            label="Kid-friendly"
            checked={kidFriendly}
            onChange={setKidFriendly}
          />
        </Section>

        <Section label="Contact (encrypted)">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            required
          />
          <Input label="Phone" type="tel" value={phone} onChange={setPhone} />
        </Section>

        <Section label="Location (encrypted)">
          <div>
            <label className="block text-xs font-medium mb-1">
              Address <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
                className="flex-1 px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleGeocode}
                disabled={geocoding || !address.trim()}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 whitespace-nowrap"
              >
                {geocoding ? 'Looking up…' : 'Lookup'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Exact lat"
              type="number"
              step="any"
              value={exactLat}
              onChange={setExactLat}
              required
            />
            <Input
              label="Exact lng"
              type="number"
              step="any"
              value={exactLng}
              onChange={setExactLng}
              required
            />
          </div>
        </Section>

        <Section label="Public display">
          <Input label="Group name (e.g. Stone Oak Family Group)" value={groupName} onChange={setGroupName} />
          <Checkbox
            label="Show group name publicly"
            checked={showGroupName}
            onChange={setShowGroupName}
            disabled={!groupName.trim()}
          />
          <Input
            label="Meeting info (public, e.g. 2nd & 4th Fridays, 7pm)"
            value={meetingInfo}
            onChange={setMeetingInfo}
          />
        </Section>

        <Section label="Admin notes (encrypted, private)">
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        </Section>

        <Section label="Privacy & status">
          <Input
            label="Jitter override (miles, blank = default 1.5)"
            type="number"
            step="0.1"
            value={jitterMiles}
            onChange={setJitterMiles}
          />
          <Checkbox
            label="Hide from public map (Tier 4 escape hatch)"
            checked={hideFromPublicMap}
            onChange={setHideFromPublicMap}
          />
          <Checkbox
            label="Paused (e.g. summer break — hidden, not deleted)"
            checked={isPaused}
            onChange={setIsPaused}
          />
          <Checkbox
            label="Active"
            checked={isActive}
            onChange={setIsActive}
          />
        </Section>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded">
            {error}
          </div>
        )}
      </form>

      <footer className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
        {!isCreating ? (
          confirmingDelete ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                Confirm delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md"
            >
              Delete leader
            </button>
          )
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : isCreating ? 'Create' : 'Save'}
          </button>
        </div>
      </footer>
    </aside>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
        {label}
      </h4>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  step,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      <input
        type={type}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-2 text-sm select-none ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="rounded accent-blue-600"
      />
      <span>{label}</span>
    </label>
  );
}
