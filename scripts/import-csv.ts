/**
 * One-time import of ChurchBibleTalks.csv into Supabase.
 *
 * Usage:
 *   npm run import-csv -- --file ChurchBibleTalks.csv
 *   npm run import-csv -- --file ChurchBibleTalks.csv --dry-run
 *   npm run import-csv -- --file ChurchBibleTalks.csv --force   # re-import even if rows exist
 *
 * For each CSV row:
 *   - Uses provided Lat/Lng if both columns are filled, else geocodes via MapTiler
 *   - Jitters coords for the public approx_lat/approx_lng
 *   - Encrypts name, address, email, phone, exact_lat, exact_lng, and the
 *     CSV's Notes (treated as private admin_notes — leaks-by-default if put
 *     in the public meeting_info field)
 *   - Inserts bible_talks + bible_talks_pii in a single transaction-ish flow
 *
 * Aborts if bible_talks already has rows (unless --force is passed) so you
 * don't accidentally double-import.
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';
import { bibleTalks, bibleTalksPii } from '../src/db/schema';
import { encryptField, getKeyVersion } from '../src/lib/crypto';
import { geocode } from '../src/lib/geocode';
import { jitter } from '../src/lib/jitter';

type Ministry = 'Family' | 'YoPro' | 'Campus' | 'Singles' | 'Spanish';

const MINISTRY_MAP: Record<string, Ministry> = {
  family: 'Family',
  yopro: 'YoPro',
  campus: 'Campus',
  singles: 'Singles',
  spanish: 'Spanish',
};

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(content: string): Array<Record<string, string>> {
  const lines = content.replace(/\r\n/g, '\n').trim().split('\n');
  const headers = parseLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = (values[i] ?? '').trim()));
    return obj;
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: 'string', short: 'f', default: 'ChurchBibleTalks.csv' },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  });

  const filePath = values.file!;
  const dryRun = !!values['dry-run'];
  const force = !!values.force;

  const content = readFileSync(filePath, 'utf-8');
  const rows = parseCSV(content);
  console.log(`Found ${rows.length} rows in ${filePath}`);

  // Idempotency guard
  const [existing] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bibleTalks);
  if (existing.count > 0 && !force) {
    console.log(`bible_talks already has ${existing.count} rows. Use --force to import anyway.`);
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = row.Name?.trim();
    const address = row.Address?.trim();
    const email = row.Email?.trim();

    if (!name || !address || !email) {
      console.log(`  SKIP: row missing name/address/email — ${JSON.stringify(row).slice(0, 80)}`);
      skipped++;
      continue;
    }

    // Coords
    let lat: number;
    let lng: number;
    if (row.Lat && row.Lng) {
      lat = parseFloat(row.Lat);
      lng = parseFloat(row.Lng);
      console.log(`  ${name}: manual coords ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } else {
      const result = await geocode(address);
      if (!result) {
        console.log(`  SKIP: ${name} — no geocode result for "${address}"`);
        skipped++;
        continue;
      }
      lat = result.lat;
      lng = result.lng;
      console.log(
        `  ${name}: geocoded (${result.confidence}) ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      );
      // Friendly to MapTiler — well under their rate limit but no rush either
      await new Promise((r) => setTimeout(r, 100));
    }

    const ministryRaw = row.Ministry?.toLowerCase().trim();
    const ministry: Ministry = MINISTRY_MAP[ministryRaw] ?? 'Family';

    const jitterMiles = 1.5;
    const approx = jitter(lat, lng, jitterMiles);

    if (dryRun) {
      console.log(`  DRY-RUN: would insert ${name} (${ministry})`);
      created++;
      continue;
    }

    // 1. Insert bible_talks first to get the row id (needed as AAD for encryption)
    const [talk] = await db
      .insert(bibleTalks)
      .values({
        ministry,
        meetingInfo: null, // admins fill this in later — see import note below
        language: 'English',
        kidFriendly: false,
        approxLat: approx.lat,
        approxLng: approx.lng,
      })
      .returning();

    // 2. Encrypt and insert PII. CSV's Notes column is mixed public/private
    //    content, so it lands in admin_notes (private) and an admin pulls
    //    out the public-safe parts into meeting_info via the admin UI.
    const keyVersion = getKeyVersion();
    const adminNotes = row.Notes?.trim() || null;

    const [
      nameEnc,
      addressEnc,
      emailEnc,
      phoneEnc,
      adminNotesEnc,
      exactLatEnc,
      exactLngEnc,
    ] = await Promise.all([
      encryptField(name, talk.id),
      encryptField(address, talk.id),
      encryptField(email, talk.id),
      row.Phone ? encryptField(row.Phone.trim(), talk.id) : Promise.resolve(null),
      adminNotes ? encryptField(adminNotes, talk.id) : Promise.resolve(null),
      encryptField(lat.toString(), talk.id),
      encryptField(lng.toString(), talk.id),
    ]);

    await db.insert(bibleTalksPii).values({
      bibleTalkId: talk.id,
      nameEnc,
      addressEnc,
      emailEnc,
      phoneEnc,
      adminNotesEnc,
      exactLatEnc,
      exactLngEnc,
      keyVersion,
    });

    console.log(`  ✓ inserted ${name} → ${talk.id}`);
    created++;
  }

  console.log('---');
  console.log(`Done: created ${created}, skipped ${skipped}`);
  if (!dryRun && created > 0) {
    console.log('');
    console.log('Note: CSV Notes column was imported as private admin_notes (encrypted).');
    console.log('Open the admin UI to populate public meeting_info per row.');
  }
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
