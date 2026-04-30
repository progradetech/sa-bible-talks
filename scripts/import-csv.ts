/**
 * One-time import of ChurchBibleTalks.csv into Supabase.
 *
 * Usage:
 *   npm run import-csv -- --file ChurchBibleTalks.csv
 *
 * For each row: geocodes the address (or uses provided Lat/Lng), inserts a
 * bible_talks row with jittered coords, encrypts PII via the leaders
 * repository, inserts the matching bible_talks_pii row.
 *
 * Idempotent on email column (skips existing rows).
 *
 * Implementation deferred to Step 2 of the migration plan.
 */

throw new Error('import-csv.ts not implemented yet — see ARCHITECTURE.md §11 Step 2');
