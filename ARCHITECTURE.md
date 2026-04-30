# SA Bible Talks Map — System & Architecture

A privacy-first map of San Antonio bible talks and small groups. Public visitors see approximate ministry areas and a per-circle "Request to visit" form; authenticated admins see exact locations and contact details. All PII is encrypted at rest and only decrypted server-side for authenticated admins.

This document describes (1) the current prototype, (2) the gaps that prevent it from being deployable as-is, and (3) the target architecture — a Vercel + Supabase production app for a single church, designed to stay simple at this scale while extending cleanly if a second church ever wants the same setup.

---

## 0. Decision summary

Every load-bearing choice resolved through a design interview. Each row is locked in unless explicitly revisited.

| Layer | Choice |
|---|---|
| Scope | One church, single-tenant, ~30 leaders. Code parameterized so a second deployment for another church is "duplicate, point at new DB, run migrations." |
| Frontend + API | Next.js 15 (App Router) on Vercel Hobby tier |
| Database / Auth / Encryption | Supabase Free tier (Postgres + Auth + pgsodium column encryption) |
| Keepalive | UptimeRobot pinging `/api/locations/public` every 5 min so the Free-tier project never pauses |
| Map | MapLibre GL + MapTiler (vector tiles + geocoding API on the same key) |
| Email | Gmail SMTP via dedicated `sa.bibletalks@gmail.com` (App Password) |
| Spam protection | Cloudflare Turnstile + per-IP / per-target rate limit |
| Backups | Weekly GitHub Actions export → Backblaze B2 (~$0/mo) |
| Domain | Vercel-provided subdomain (no custom domain) |
| Threat model | Tier 3 (motivated outsider) + Tier 4 escape hatch (per-row hide and per-row jitter) |
| Auth | Per-user admin accounts, TOTP MFA at login, 15-min idle / 8-hour max session, 5-attempt lockout |
| Roles | `super_admin` (Andrew) + `admin` |
| Public connect flow | Per-circle "Request to visit" form → server-side decrypt + dispatch via Gmail SMTP |
| Visitor request storage | Encrypted at rest, 1-year auto-purge |
| Audit log retention | 2 years auto-purge |
| Public visibility | Global toggle, default **OFF** — flip on when ready to be Google-indexable |

Estimated monthly cost: **$0** (Vercel Hobby + Supabase Free + UptimeRobot Free + Backblaze B2 ~rounding error + Cloudflare Free + Gmail Free). One-time effort: ~5 evenings of focused work.

---

## 1. Current prototype

### Files

| File | Purpose |
|---|---|
| `ChurchBibleTalks.csv` | Source of truth — 30 leaders with name, address, email, phone, ministry, notes, optional lat/lng |
| `build.js` | One-shot script: parses CSV → geocodes via Nominatim → jitters coords → encrypts PII → emits a single `index.html` |
| `index.html` | Generated artifact; self-contained Leaflet map with embedded public + encrypted private data |
| `package.json` | `npm run build` and `npm run serve` |

### Flow

```
CSV ──► build.js ──► index.html (static, self-contained)
                          │
                          ├── publicData[]   : { ministry, notes, lat+jitter, lng+jitter }
                          └── encryptedBlob  : AES-256-GCM(PBKDF2(password), privateData[])

Browser ──► loads index.html
        ├── public: renders jittered ~1.5mi circles per ministry
        └── leader login: prompts password → Web Crypto decrypt → renders exact markers + PII
```

### Why it's not deployable as-is

1. **Encrypted blob ships to every visitor.** Anyone can save `index.html` and brute-force the password offline. PBKDF2(100k) is milliseconds per guess on a GPU; a memorable password (`bibletalk2024`) falls in seconds. **PII must never leave the server unless the request is authenticated.**
2. **Default password hardcoded** in `build.js:8`.
3. **CSV with real PII sits untracked but unignored** (`.gitignore` only lists `node_modules/`, `.env`). One `git add .` from a leak. No commits exist yet — fix before first commit.
4. **Editing data = rebuild + redeploy.** No way for an admin to add or correct an entry from the UI.
5. **No audit trail.** Who logged in, when, from where, what they viewed — invisible.
6. **Single shared password.** Can't rotate, can't revoke, can't tell A from B.
7. **Notes leak names.** `build.js:215`'s regex strips `Name/Name`-shaped strings but anything off that pattern (e.g. "Aguilar SG") survives.
8. **No connect flow.** A visitor seeing a Family circle in their neighborhood has no way to act on it.

---

## 2. Target architecture

### Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser                                                              │
│                                                                       │
│  Public visitor:                                                      │
│    GET  /                              → SSR map shell                │
│    GET  /api/locations/public          → [{ id, ministry, ... }]      │
│    POST /api/visitor-request           → form submit (Turnstile)      │
│                                                                       │
│  Admin:                                                               │
│    GET  /admin                         → login                        │
│    POST /api/auth/* (Supabase)         → email + password + TOTP      │
│    GET  /api/locations/private         → decrypted rows (audited)     │
│    POST /api/locations                 → CRUD (audited)               │
│    GET  /admin/settings                → visibility toggle, admins    │
│    GET  /admin/audit                   → audit log viewer             │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼───────────────────────────────────────┐
│  Vercel — Next.js App + API Routes                                    │
│                                                                       │
│   - SSR map shell, static assets                                      │
│   - Auth via @supabase/ssr (cookies, RSC-friendly)                    │
│   - Server actions for mutations                                      │
│   - Audit middleware on every PII access                              │
│   - Gmail SMTP client (nodemailer) for visitor-request dispatch       │
│   - Turnstile verification                                            │
│   - Rate limiter (in-memory, single-region, sufficient at this scale) │
└──────┬─────────────────────────────────────────────────┬─────────────┘
       │ TLS (Postgres + Supabase API)                    │ SMTP TLS
┌──────▼──────────────────────────────────────┐    ┌──────▼───────────┐
│  Supabase Free tier                          │    │  Gmail SMTP      │
│   - Postgres 15 with pgsodium extension      │    │  (App Password)  │
│   - Built-in encryption at rest (Azure VM)   │    └──────────────────┘
│   - Auth (email + password + TOTP)
│   - Vault for master encryption key          │
│   Tables:                                    │    ┌──────────────────┐
│     bible_talks         (public)             │    │  MapTiler        │
│     bible_talks_pii     (column-encrypted)   │    │  (tiles + geo)   │
│     visitor_requests    (column-encrypted)   │    └──────────────────┘
│     admin_users         (role + MFA state)   │
│     audit_log           (2yr retention)      │    ┌──────────────────┐
│     site_settings       (singleton)          │    │  UptimeRobot     │
│   RLS: deny-all by default                   │    │  ping every 5min │
└──────────────────────────────────────────────┘    └──────────────────┘
                                                    ┌──────────────────┐
                                                    │  GitHub Actions  │
                                                    │  weekly → B2     │
                                                    └──────────────────┘
```

### Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend + API | Next.js 15 App Router on Vercel | Hobby tier; HTTPS + CDN + preview envs free |
| ORM / DB driver | Drizzle + `postgres` (or raw `@supabase/supabase-js`) | Drizzle for typed migrations + queries; Supabase JS client for auth flows |
| Auth | Supabase Auth | Email + password + TOTP MFA; we don't roll our own |
| Encryption | pgsodium column encryption | `crypto_aead_det_xchacha20` for deterministic-but-still-secure encryption; key in Supabase Vault, never in app config |
| Map | MapLibre GL JS | Vector tiles, "Google-like" smooth zoom; Leaflet-shaped API |
| Tiles + geocoding | MapTiler | Free tier 100k tile loads + 100k geocodes/mo; one API key |
| Email | nodemailer + Gmail SMTP | Dedicated `sa.bibletalks@gmail.com` + App Password; ~500 sends/day cap (way above traffic) |
| Spam | Cloudflare Turnstile | Free, checkbox UX, no DNS migration required |
| Rate limit | In-memory token bucket | Single Vercel region; sufficient at this scale; bump to Upstash Redis if traffic ever justifies |
| Backups | GitHub Actions cron + `pg_dump` → Backblaze B2 | Weekly, encrypted at rest, ~$0/mo at this size |

---

## 3. Data model

Two tables for locations: `bible_talks` (public, no PII) and `bible_talks_pii` (column-encrypted via pgsodium). Plus admin users, visitor requests, audit log, and a singleton settings row.

```sql
-- Required Postgres extensions (provisioned by Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- ============================================================
-- bible_talks: public-readable, no PII
-- ============================================================
CREATE TABLE bible_talks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry              TEXT NOT NULL CHECK (ministry IN
                          ('Family','YoPro','Campus','Singles','Spanish')),
  meeting_info          TEXT,                       -- "2nd & 4th Fridays, 7pm"
  language              TEXT NOT NULL DEFAULT 'English'
                          CHECK (language IN ('English','Spanish','Bilingual')),
  kid_friendly          BOOLEAN NOT NULL DEFAULT FALSE,
  group_name            TEXT,                       -- admin-assignable label
  show_group_name       BOOLEAN NOT NULL DEFAULT FALSE,
  approx_lat            DOUBLE PRECISION NOT NULL,  -- jittered server-side
  approx_lng            DOUBLE PRECISION NOT NULL,
  jitter_miles          NUMERIC(4,2),               -- NULL = use site default (1.5)
  hide_from_public_map  BOOLEAN NOT NULL DEFAULT FALSE,  -- Tier 4 escape hatch
  is_paused             BOOLEAN NOT NULL DEFAULT FALSE,  -- summer break, etc.
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_talks_visible ON bible_talks (is_active, hide_from_public_map, is_paused)
  WHERE is_active = TRUE AND hide_from_public_map = FALSE AND is_paused = FALSE;

-- ============================================================
-- bible_talks_pii: column-encrypted via pgsodium
-- Encrypted columns are bytea; access goes through views below.
-- ============================================================
CREATE TABLE bible_talks_pii (
  bible_talk_id         UUID PRIMARY KEY REFERENCES bible_talks(id) ON DELETE CASCADE,
  name_enc              BYTEA NOT NULL,
  address_enc           BYTEA NOT NULL,
  email_enc             BYTEA NOT NULL,
  phone_enc             BYTEA,
  admin_notes_enc       BYTEA,
  exact_lat_enc         BYTEA NOT NULL,
  exact_lng_enc         BYTEA NOT NULL,
  key_id                UUID NOT NULL,              -- pgsodium key reference
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- admin_users: app-level metadata that complements Supabase auth.users
-- ============================================================
CREATE TYPE admin_role AS ENUM ('super_admin', 'admin');

CREATE TABLE admin_users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT UNIQUE NOT NULL,        -- denormalized for display
  role                  admin_role NOT NULL DEFAULT 'admin',
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at         TIMESTAMPTZ,
  failed_attempts       INT NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invited_by            UUID REFERENCES admin_users(id) ON DELETE SET NULL
);

-- ============================================================
-- visitor_requests: encrypted, 1-year retention
-- ============================================================
CREATE TABLE visitor_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_bible_talk_id  UUID REFERENCES bible_talks(id) ON DELETE SET NULL,
  visitor_name_enc      BYTEA NOT NULL,
  visitor_email_enc     BYTEA NOT NULL,
  visitor_phone_enc     BYTEA,
  message_enc           BYTEA NOT NULL,
  dispatched            BOOLEAN NOT NULL DEFAULT FALSE,
  dispatched_at         TIMESTAMPTZ,
  dispatch_error        TEXT,
  ip                    INET,
  user_agent            TEXT,
  key_id                UUID NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_visitor_pending ON visitor_requests (dispatched, created_at)
  WHERE dispatched = FALSE;

-- ============================================================
-- audit_log: 2-year retention, depersonalized stub on row delete
-- ============================================================
CREATE TABLE audit_log (
  id                    BIGSERIAL PRIMARY KEY,
  admin_user_id         UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  actor_email           TEXT,                       -- captured at write-time so it survives deletes
  action                TEXT NOT NULL,              -- enum-ish; see list below
  target_id             UUID,
  ip                    INET,
  user_agent            TEXT,
  metadata              JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_recent ON audit_log (created_at DESC);
CREATE INDEX idx_audit_actor  ON audit_log (admin_user_id, created_at DESC);

-- Audit actions:
--   login_success, login_fail, login_lockout, logout
--   view_pii_list, view_pii_single
--   create_leader, update_leader, delete_leader, toggle_leader_visibility
--   dispatch_visitor_request, dispatch_failure
--   admin_invite, admin_deactivate, admin_role_change
--   toggle_public_indexable

-- ============================================================
-- site_settings: singleton row
-- ============================================================
CREATE TABLE site_settings (
  id                    INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_indexable      BOOLEAN NOT NULL DEFAULT FALSE,
  default_jitter_miles  NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            UUID REFERENCES admin_users(id) ON DELETE SET NULL
);

INSERT INTO site_settings (id) VALUES (1);
```

### Row-Level Security (RLS)

```sql
ALTER TABLE bible_talks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bible_talks_pii     ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings       ENABLE ROW LEVEL SECURITY;

-- bible_talks: public reads of visible rows; admin full access
CREATE POLICY public_read_visible ON bible_talks
  FOR SELECT TO anon, authenticated
  USING (is_active AND NOT hide_from_public_map AND NOT is_paused);

CREATE POLICY admin_read_all ON bible_talks
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users
                 WHERE user_id = auth.uid() AND is_active));

-- All other tables: deny by default; access only via service role
-- (server-side API routes use the service-role key after their own role check)
```

The API server uses the **service role key** (set as `SUPABASE_SERVICE_ROLE_KEY` in Vercel env, never exposed to client) and applies its own `super_admin` / `admin` check before any privileged query. RLS is the second line of defense.

---

## 4. Encryption design

Column-level encryption via **pgsodium**, with the master key managed by Supabase Vault. The key never enters application code.

### How it works

```sql
-- 1. Create a master key in Vault (one-time setup)
INSERT INTO pgsodium.key (name, key_type)
VALUES ('bible_talks_master', 'aead-det')
RETURNING id;
-- Store the returned key_id in app config (it's a reference, not the key itself).

-- 2. Encrypt on write (called from server-side API code)
INSERT INTO bible_talks_pii (bible_talk_id, name_enc, ..., key_id) VALUES (
  $1,
  pgsodium.crypto_aead_det_encrypt($2::bytea, $1::text::bytea, $key_id),  -- name
  ...,
  $key_id
);

-- 3. Decrypt on read (gated view, only callable by service role)
CREATE VIEW bible_talks_pii_decrypted AS
SELECT
  bible_talk_id,
  convert_from(pgsodium.crypto_aead_det_decrypt(
    name_enc, bible_talk_id::text::bytea, key_id), 'utf8') AS name,
  convert_from(pgsodium.crypto_aead_det_decrypt(
    address_enc, bible_talk_id::text::bytea, key_id), 'utf8') AS address,
  ...
FROM bible_talks_pii;

REVOKE ALL ON bible_talks_pii_decrypted FROM PUBLIC, anon, authenticated;
-- Service role retains access; gated by app-level admin check before query.
```

### Why this is enough

- **Database dump alone leaks nothing decryptable.** Master key lives in Vault, separate from row data. An attacker with a `pg_dump` gets ciphertext + key references but no plaintext.
- **App compromise without a valid admin session leaks nothing.** Decryption only happens inside an authed handler that's already passed an admin role check.
- **Key rotation** is a one-shot script: read+decrypt with old key, re-encrypt with new key, update `key_id`. No schema change.
- **Defense in depth** alongside Supabase's storage-level at-rest encryption (which alone wouldn't protect against logical exfiltration via the DB connection).

`crypto_aead_det_xchacha20` (used here as `aead-det`) is deterministic — the same plaintext + same key produces the same ciphertext. This loses some confidentiality vs. random-IV AEAD but is still secure for our threat model (Tier 3) and lets you query `WHERE email_enc = encrypt('search@example.com')` without decrypting the whole table. If we ever need that property to be stronger, we can switch to `crypto_aead_xchacha20` with random nonces (slight schema bump: store nonce per row).

---

## 5. Authentication & roles

### Stack: Supabase Auth

Supabase handles password storage (Argon2), TOTP enrollment, JWT issuance, refresh token rotation, magic-link invites — out of the box. We add app-level role + audit tracking via `admin_users`.

### Policies

| Setting | Value |
|---|---|
| Sign-up method | **Disabled** for the public. Admins are added via invite-only. |
| Password policy | Min 12 chars, mixed case + digit (Supabase defaults adjusted up). |
| MFA | TOTP, **required at login** (enrollment forced on first login). Step-up MFA is **not** used — the audit log is the accountability layer. |
| Session length | JWT 15 min, refresh token 8 hours, **idle timeout 15 min**, **max 8 hours**. Tighter than Supabase defaults. |
| Lockout | **5 failed attempts → 15-minute lockout** + email alert to `sa.bibletalks@gmail.com` (BCC inbox, watched by all admins). |
| Roles | `super_admin` (Andrew) and `admin`. Enforced in API middleware. |

### Role permissions

| Action | super_admin | admin |
|---|---|---|
| View public map | ✓ | ✓ |
| View private map (decrypt PII) | ✓ | ✓ |
| Create / update / delete leader | ✓ | ✓ |
| View own audit log | ✓ | ✓ |
| View all admins' audit log | ✓ | — |
| Invite / deactivate other admins | ✓ | — |
| Toggle public visibility (`public_indexable`) | ✓ | — |
| Change site defaults (default jitter, etc.) | ✓ | — |
| Dispatch visitor requests (manual re-send) | ✓ | ✓ |

### Bootstrap

First admin (`andrew@progradetechlabs.com`, role `super_admin`) is seeded by `scripts/create-admin.ts`, run locally with the Supabase service-role key. After that, super-admin invites others through the in-app admin settings page.

---

## 6. Public visitor flow

### Map UX

1. Visitor lands on `/`. Server fetches `/api/locations/public`, server-renders the map shell with initial dot data.
2. MapLibre GL initializes. Initial view auto-fits to the bounding box of all visible rows; falls back to SA center (29.4241, -98.4936) at zoom 10 if no rows.
3. Each visible row renders as a circle: jittered approx coords, ministry color, `jitter_miles` radius (default 1.5).
4. Click circle → popup:
   ```
   [group_name if show_group_name=true]
   Family ministry · 2nd & 4th Fri, 7pm
   English · Kid-friendly
   [Approximate area]
   [ Request to Visit  ]   ← button
   ```
5. **Legend filters**: ministry colors (toggle each on/off), language (English/Spanish/Bilingual), kid-friendly (toggle).
6. **Visibility toggle (when OFF)**: `<meta name="robots" content="noindex,nofollow">`, `X-Robots-Tag: noindex` header, `robots.txt` returns `Disallow: /`. Site still renders fully — only Google indexing is blocked. Direct URL sharing works as normal.

### "Request to Visit" form

Click the button on a circle → inline form (does not navigate away):

| Field | Required | Notes |
|---|---|---|
| First name | ✓ | |
| Email | ✓ | |
| Phone | — | optional |
| Message | ✓ | textarea |
| Cloudflare Turnstile | ✓ | checkbox UX |

**Submission flow:**
1. Client POSTs to `/api/visitor-request` with form fields + Turnstile token.
2. Server verifies Turnstile against Cloudflare's siteverify endpoint.
3. Server checks rate limit: 3 submissions/hour per `target_bible_talk_id`, 10/hour total per IP.
4. Server inserts encrypted row into `visitor_requests` (dispatched = false initially).
5. Server decrypts target leader's email *just* for SMTP dispatch:
   ```
   From:     SA Bible Talks <sa.bibletalks@gmail.com>
   To:       <leader-email>
   Reply-To: <visitor-email>
   Bcc:      sa.bibletalks@gmail.com
   Subject:  Visit request from <visitor-name> — <ministry> group
   Body:
     Hi <leader-first-name>,

     Someone found your group on the SA Bible Talks map and would
     like to connect:

     From: <visitor-name> <visitor-email> [phone if provided]

     Their message:
     <message>

     Reply directly to this email to reach them.
   ```
6. Server sets `dispatched = true`, `dispatched_at = now()`. On SMTP failure, stores `dispatch_error` for admin retry.
7. Response to visitor: `"We forwarded your message to the host. They'll reply directly to <visitor-email>."`

The leader's email address is **never** returned to the browser. The visitor sees a confirmation, not the email.

---

## 7. Admin flow

### Login → MFA → dashboard

1. `/admin` → email + password form.
2. Successful auth → Supabase prompts for TOTP. (First-ever login forces TOTP enrollment.)
3. Server checks `admin_users.is_active` and `locked_until`. Updates `last_login_at`, resets `failed_attempts`. Writes `audit_log` entry.
4. Lands on `/admin` dashboard: same map as public, but with exact pins and a sidebar of leader rows.

### CRUD a leader

- **Add**: form fields = `name, address, email, phone, ministry, meeting_info, language, kid_friendly, group_name, show_group_name, admin_notes`. On save:
  1. Geocode address synchronously via MapTiler. Show resolved pin on map.
  2. Admin can drag the pin to correct.
  3. Click "Confirm save" → server inserts `bible_talks` (with jittered coords) + `bible_talks_pii` (encrypted) + audit log row.
- **Update**: edit drawer, same flow. If address changed, re-geocode.
- **Delete**: confirmation modal. Hard-deletes both rows (CASCADE). Audit log keeps a depersonalized stub (`actor_email`, `action='delete_leader'`, `target_id=<old uuid>`, no PII).
- **Toggle hide / pause**: one-click flags on each row.

### Settings (super-admin only)

- **Public visibility toggle**: ON/OFF for `site_settings.public_indexable`.
- **Default jitter**: numeric input, default 1.5.
- **Admin management**: list, invite (sends Supabase magic-link to email), deactivate, change role, reset MFA.

### Audit log viewer

- Reverse-chronological table: timestamp, actor email, action, target, IP.
- Filter by actor and action.
- Super-admin sees all; admin sees own only.

---

## 8. API surface

```
# Public
GET    /                                 → SSR map shell + sets index/noindex meta
GET    /privacy                          → static privacy page
GET    /api/locations/public             → cached 60s; only visible rows; no PII
POST   /api/visitor-request              → Turnstile + rate limit + dispatch

# Auth (Supabase-backed)
POST   /api/auth/sign-in                 → email + password → MFA challenge
POST   /api/auth/verify-mfa              → TOTP code → session
POST   /api/auth/sign-out                → clears session

# Admin (require active admin_users row + valid session)
GET    /api/locations/private            → decrypted rows; audit_log: view_pii_list
GET    /api/locations/:id                → single decrypted row; audit_log: view_pii_single
POST   /api/locations                    → create
PATCH  /api/locations/:id                → update
DELETE /api/locations/:id                → hard delete
POST   /api/locations/:id/geocode        → re-geocode (returns lat/lng candidate)

GET    /api/admins                       → list (super_admin only)
POST   /api/admins/invite                → magic-link invite (super_admin only)
PATCH  /api/admins/:id                   → role / activation (super_admin only)

GET    /api/audit                        → paginated; super_admin sees all, admin sees self

GET    /api/settings                     → site_settings
PATCH  /api/settings                     → super_admin only

POST   /api/visitor-requests/:id/redispatch  → manual retry on SMTP failure
```

**Caching headers:**
- `/api/locations/public` → `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`
- All admin endpoints → `Cache-Control: no-store`

---

## 9. Privacy & consent

### Removal workflow

1. Leader emails `andrew@progradetechlabs.com` with removal request.
2. Admin opens leader in `/admin`, clicks Delete, confirms.
3. `bible_talks` + `bible_talks_pii` rows are hard-deleted (CASCADE).
4. `audit_log` retains the depersonalized stub: actor, timestamp, action, target_id (now points to nothing).
5. Admin replies to leader: "You've been removed."

### One-time leader announcement (draft)

Recipient list is built from the CSV `Email` column. Send before flipping `public_indexable` ON.

> **Subject:** Your bible talk on the new SA leaders map
>
> Hi friends,
>
> We're putting up a simple map at *(URL)* to help people in San Antonio find a bible talk near them. Here's exactly what it shows and what it doesn't.
>
> **Public on the map (anyone can see):**
> - A colored circle in your *general area* — about a 1.5-mile radius, intentionally not your address.
> - Your ministry (Family / YoPro / Campus / Singles / Spanish).
> - The day and time the talk meets.
> - Language and whether the group is kid-friendly.
> - Optionally, a group name we'd assign with you (e.g. "Stone Oak Family Group"). This is **off by default** — we'll only display it if you tell us to.
>
> **Private and encrypted (only an authenticated admin can ever see):**
> - Your name, address, email, phone.
> - Any notes we keep about your group.
>
> **How visitors reach you:**
> A new person interested in your group fills out a short form. The site forwards their message to your email — they never see your address. You reply directly. An admin is BCC'd as a paper trail.
>
> **Two things we want you to know you can do:**
> 1. **Hide me from the public map.** Tell any admin and we'll set you to "hidden." You'll still be in the system for our internal directory; you just won't appear publicly.
> 2. **Remove me entirely.** Email *(admin)* and we'll delete your row. The map will stop showing you within minutes.
>
> If you want a larger privacy buffer (say, a 3-mile radius instead of 1.5), let us know — that's a per-leader setting.
>
> Map goes live publicly on *(date)*. Any concerns or corrections, reply to this email by *(deadline)*.
>
> Thanks for hosting,
> *(name)*

### `/privacy` page (draft)

Single page, footer link.

> # Privacy
>
> This site shows a map of bible talks meeting in the San Antonio area. We take privacy seriously because the map shows real people's groups.
>
> ## What's public on this site
> - An approximate location (about a 1.5-mile circle, not a real address).
> - Ministry, meeting day and time, language, whether the group is kid-friendly.
> - Optionally, a group name (e.g. "Stone Oak Family Group") — only when the host has chosen to display it.
>
> ## What's private
> Host names, exact addresses, email addresses, and phone numbers are stored encrypted at rest in our database. They are only ever decrypted server-side, after an authenticated administrator has signed in with both a password and a one-time code. Encrypted data never reaches your browser.
>
> ## Visitor messages
> When you submit the "Request to Visit" form, we forward your message to the host's email. The host sees your name, email, optional phone, and message. You don't see the host's email — they reply directly. We store your message encrypted for one year so we can confirm dispatch and follow up if needed; after one year it is automatically deleted.
>
> ## Spam protection
> We use Cloudflare Turnstile (a checkbox CAPTCHA) and rate-limit requests per IP. We log the IP and browser of each visitor-request submission to detect abuse.
>
> ## Cookies
> We use only essential cookies: a session cookie for administrators to stay signed in. We do not use analytics, advertising, or tracking cookies.
>
> ## Removal
> If you are listed on this map and want to be hidden or removed entirely, email **andrew@progradetechlabs.com**. Removal is processed within a business day. Removal is complete deletion — your data is gone.
>
> ## Audit
> We log administrator actions (sign-ins, viewing private data, edits) and keep that log for two years for accountability. The log does not contain personal data of leaders or visitors.
>
> ## Contact
> Questions: **andrew@progradetechlabs.com**.

---

## 10. Operations

### Environment variables

```bash
# Vercel project env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service-role>     # never exposed to client
DATABASE_URL=<pooled-postgres-uri>           # for Drizzle migrations
PGSODIUM_KEY_ID=<uuid-from-vault>            # reference, not key material

NEXT_PUBLIC_MAPTILER_KEY=<maptiler-key>      # tile loads from browser
MAPTILER_GEOCODE_KEY=<maptiler-key>          # server-side geocode (same key)

GMAIL_SMTP_USER=sa.bibletalks@gmail.com
GMAIL_SMTP_APP_PASSWORD=<16-char-app-password>

CLOUDFLARE_TURNSTILE_SITE_KEY=<site>
CLOUDFLARE_TURNSTILE_SECRET=<secret>

BACKBLAZE_B2_KEY_ID=<key-id>                 # for backup workflow
BACKBLAZE_B2_APP_KEY=<app-key>
BACKBLAZE_B2_BUCKET=sa-bible-talks-backups
```

### Scheduled jobs

| Job | Schedule | Mechanism | Purpose |
|---|---|---|---|
| Keepalive ping | every 5 min | UptimeRobot Free | Prevents Supabase Free's 7-day pause |
| Weekly backup | Sundays 03:00 CT | GitHub Actions | `pg_dump` → encrypted `.sql.gz` → Backblaze B2 |
| Audit log purge | daily 04:00 CT | Vercel Cron (free) | `DELETE FROM audit_log WHERE created_at < now() - interval '2 years'` |
| Visitor request purge | daily 04:00 CT | Vercel Cron (free) | `DELETE FROM visitor_requests WHERE created_at < now() - interval '1 year'` |
| Failed dispatch retry | hourly | Vercel Cron | Re-dispatch `visitor_requests WHERE NOT dispatched AND dispatch_error IS NOT NULL` (max 3 retries) |

### Cost (monthly)

| Item | Cost |
|---|---|
| Vercel Hobby | $0 |
| Supabase Free | $0 |
| MapTiler Free (100k tiles + 100k geocodes) | $0 |
| Cloudflare Turnstile | $0 |
| UptimeRobot Free | $0 |
| Gmail (existing free account) | $0 |
| Backblaze B2 (~50MB/week, 12 weeks of backups ≈ 600MB) | <$0.01 |
| **Total** | **~$0** |

### Disaster scenarios

- **Supabase project deleted by accident** → restore from latest weekly Backblaze B2 backup. Worst-case data loss: 1 week. PITR within Supabase covers anything more recent than that for up to 7 days.
- **Master encryption key compromised** → rotate via pgsodium key-rotation script; re-encrypt rows; revoke old key.
- **Service role key leaked from Vercel** → rotate in Supabase dashboard, redeploy. Master encryption key never moves.
- **Gmail account compromised** → revoke App Password in Google account settings, generate new one, update Vercel env. Reset Gmail account password.

---

## 11. Migration plan

Five steps from prototype to v1. Each ends at a usable state — pause-able anywhere.

### Step 0 — Hygiene (15 min, do first)

- Add to `.gitignore`: `ChurchBibleTalks.csv`, `index.html`, `*.csv`, `.env*`, `.next/`, `node_modules/`
- Confirm no PII committed: `git log --all -- ChurchBibleTalks.csv` (currently empty).
- Initial commit of source only.

### Step 1 — Provision (1 evening)

- Create Supabase project. Note URL + anon + service-role keys.
- Enable `pgsodium` extension. Create master key in Vault: `INSERT INTO pgsodium.key (name, key_type) VALUES ('bible_talks_master', 'aead-det') RETURNING id;`. Save the UUID.
- Create dedicated Gmail account `sa.bibletalks@gmail.com`. Enable 2FA. Generate App Password (Google Account → Security → 2-Step Verification → App passwords).
- Sign up for MapTiler. Create API key.
- Sign up for Cloudflare. Add Turnstile site (managed mode). Note site key + secret.
- Sign up for UptimeRobot. (Defer monitor creation to Step 5.)
- Sign up for Backblaze B2. Create bucket `sa-bible-talks-backups`. Generate application key.
- Create Vercel project, link GitHub repo, set all env vars from §10.

### Step 2 — Data layer (1–2 evenings)

- `npx create-next-app@latest` (TypeScript, App Router).
- Install: `@supabase/ssr @supabase/supabase-js drizzle-orm postgres bcryptjs nodemailer maplibre-gl @maptiler/sdk`
- Write Drizzle migration matching §3 schema. `drizzle-kit push` against Supabase.
- Apply RLS policies (§3).
- Create encryption views (§4).
- Write `scripts/import-csv.ts` — reads `ChurchBibleTalks.csv`, reuses geocoding logic from `build.js`, encrypts via pgsodium SQL, inserts into both tables. Run locally with service-role key.
- Write `scripts/create-admin.ts` — invites `andrew@progradetechlabs.com` with `super_admin` role. Andrew completes signup via magic link, enrolls TOTP.

### Step 3 — Public-side UI (2 evenings)

- `app/page.tsx`: SSR map shell, fetches `/api/locations/public`, renders MapLibre.
- Legend with ministry / language / kid-friendly filters.
- Click-to-popup with "Request to Visit" inline form.
- `app/privacy/page.tsx`: static privacy text from §9.
- `app/api/locations/public/route.ts`: returns visible rows, 60s cache.
- `app/api/visitor-request/route.ts`: Turnstile verify + rate limit + encrypt-and-store + Gmail SMTP dispatch.
- Honor `site_settings.public_indexable` — emit noindex meta + robots.txt accordingly.
- Deploy to Vercel preview. Smoke test publicly accessible URL.

### Step 4 — Admin-side UI (2 evenings)

- `app/admin/login/page.tsx`: email + password + TOTP via Supabase JS client.
- `app/admin/page.tsx`: authenticated map with sidebar of leader rows; click-to-edit drawer.
- `app/admin/settings/page.tsx`: visibility toggle, default jitter, admin invite/manage (super_admin only).
- `app/admin/audit/page.tsx`: paginated log viewer.
- API routes from §8 for CRUD, geocoding, audit.
- Audit-log middleware on every PII-touching handler.

### Step 5 — Launch (1 evening)

- Set up UptimeRobot monitor on `/api/locations/public`, every 5 min.
- Set up GitHub Actions weekly backup workflow.
- Set up Vercel cron jobs (audit purge, visitor-request purge, dispatch retry).
- Send the one-time leader announcement (§9 draft) from a real church account.
- Wait stated comment-period (e.g., 1 week) for opt-out / correction requests.
- Super-admin (Andrew) flips `public_indexable = true` in `/admin/settings`.
- Submit sitemap to Google Search Console.

---

## 12. Future v1.1 (not in scope for initial launch)

These are deliberate omissions, not gaps. Add when there's a real reason.

- **Step-up MFA** for PII reveal (currently: TOTP at login only).
- **Leader self-edit** (`bible_talks_pii.owner_user_id` nullable column, then leader-side UI).
- **Self-service signup** with admin approval queue.
- **Custom domain** (~$10/yr). Replaces Gmail SMTP `From:` with `connect@<yourdomain>` via Resend.
- **Multi-tenant** (`org_id` column on every table) — only if you ever onboard a second church to a single deployment.
- **Better visitor-leader threading** (currently: BCC + Reply-To, no thread tracking).
- **Mobile-friendly admin UI tuning** (v1 admin assumes desktop).
- **i18n** of the public site (Spanish translation, given the `Spanish` ministry).
