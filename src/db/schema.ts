import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return 'bytea';
  },
});

const inet = customType<{ data: string }>({
  dataType() {
    return 'inet';
  },
});

const authSchema = pgSchema('auth');

export const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
});

export const adminRole = pgEnum('admin_role', ['super_admin', 'admin']);

export const bibleTalks = pgTable(
  'bible_talks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ministry: text('ministry').notNull(),
    meetingInfo: text('meeting_info'),
    language: text('language').notNull().default('English'),
    kidFriendly: boolean('kid_friendly').notNull().default(false),
    groupName: text('group_name'),
    showGroupName: boolean('show_group_name').notNull().default(false),
    approxLat: doublePrecision('approx_lat').notNull(),
    approxLng: doublePrecision('approx_lng').notNull(),
    jitterMiles: numeric('jitter_miles', { precision: 4, scale: 2 }),
    hideFromPublicMap: boolean('hide_from_public_map').notNull().default(false),
    isPaused: boolean('is_paused').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'ministry_check',
      sql`${t.ministry} IN ('Family','YoPro','Campus','Singles','Spanish')`,
    ),
    check('language_check', sql`${t.language} IN ('English','Spanish','Bilingual')`),
    index('idx_talks_visible')
      .on(t.isActive, t.hideFromPublicMap, t.isPaused)
      .where(sql`${t.isActive} = TRUE AND ${t.hideFromPublicMap} = FALSE AND ${t.isPaused} = FALSE`),
  ],
);

export const bibleTalksPii = pgTable('bible_talks_pii', {
  bibleTalkId: uuid('bible_talk_id')
    .primaryKey()
    .references(() => bibleTalks.id, { onDelete: 'cascade' }),
  nameEnc: bytea('name_enc').notNull(),
  addressEnc: bytea('address_enc').notNull(),
  emailEnc: bytea('email_enc').notNull(),
  phoneEnc: bytea('phone_enc'),
  adminNotesEnc: bytea('admin_notes_enc'),
  exactLatEnc: bytea('exact_lat_enc').notNull(),
  exactLngEnc: bytea('exact_lng_enc').notNull(),
  keyVersion: text('key_version').notNull().default('v1'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  email: text('email').notNull().unique(),
  role: adminRole('role').notNull().default('admin'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  invitedBy: uuid('invited_by'),
});

export const trustedDevices = pgTable(
  'trusted_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('idx_trusted_devices_admin').on(t.adminUserId, t.expiresAt)],
);

export const visitorRequests = pgTable(
  'visitor_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetBibleTalkId: uuid('target_bible_talk_id').references(() => bibleTalks.id, {
      onDelete: 'set null',
    }),
    visitorNameEnc: bytea('visitor_name_enc').notNull(),
    visitorEmailEnc: bytea('visitor_email_enc').notNull(),
    visitorPhoneEnc: bytea('visitor_phone_enc'),
    messageEnc: bytea('message_enc').notNull(),
    dispatched: boolean('dispatched').notNull().default(false),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    dispatchError: text('dispatch_error'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    keyVersion: text('key_version').notNull().default('v1'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_visitor_pending')
      .on(t.dispatched, t.createdAt)
      .where(sql`${t.dispatched} = FALSE`),
  ],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    adminUserId: uuid('admin_user_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    actorEmail: text('actor_email'),
    action: text('action').notNull(),
    targetId: uuid('target_id'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_audit_recent').on(t.createdAt.desc()),
    index('idx_audit_actor').on(t.adminUserId, t.createdAt.desc()),
  ],
);

export const siteSettings = pgTable(
  'site_settings',
  {
    id: integer('id').primaryKey().default(1),
    publicIndexable: boolean('public_indexable').notNull().default(false),
    defaultJitterMiles: numeric('default_jitter_miles', { precision: 4, scale: 2 })
      .notNull()
      .default('1.5'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by').references(() => adminUsers.id, { onDelete: 'set null' }),
  },
  (t) => [check('singleton_check', sql`${t.id} = 1`)],
);

export const messageTemplates = pgTable('message_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  updatedBy: uuid('updated_by').references(() => adminUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commsLog = pgTable(
  'comms_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    recipientCount: integer('recipient_count').notNull(),
    // Leaders skipped because they have no real email (placeholder/empty).
    skippedCount: integer('skipped_count').notNull().default(0),
    includedInactive: boolean('included_inactive').notNull().default(false),
    isTest: boolean('is_test').notNull().default(false),
    sentBy: uuid('sent_by').references(() => adminUsers.id, { onDelete: 'set null' }),
    // Snapshot so history stays readable if the admin row is removed.
    sentByEmail: text('sent_by_email'),
    status: text('status').notNull(), // 'sent' | 'failed'
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_comms_log_recent').on(t.createdAt.desc())],
);

export const auditAction = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAIL: 'login_fail',
  LOGIN_LOCKOUT: 'login_lockout',
  LOGOUT: 'logout',
  VIEW_PII_LIST: 'view_pii_list',
  VIEW_PII_SINGLE: 'view_pii_single',
  CREATE_LEADER: 'create_leader',
  UPDATE_LEADER: 'update_leader',
  DELETE_LEADER: 'delete_leader',
  TOGGLE_LEADER_VISIBILITY: 'toggle_leader_visibility',
  DISPATCH_VISITOR_REQUEST: 'dispatch_visitor_request',
  DISPATCH_FAILURE: 'dispatch_failure',
  ADMIN_INVITE: 'admin_invite',
  ADMIN_DEACTIVATE: 'admin_deactivate',
  ADMIN_ROLE_CHANGE: 'admin_role_change',
  ADMIN_PASSWORD_SET: 'admin_password_set',
  TOGGLE_PUBLIC_INDEXABLE: 'toggle_public_indexable',
  DEVICE_TRUST_GRANTED: 'device_trust_granted',
  DEVICE_TRUST_REVOKED: 'device_trust_revoked',
  EXPORT_LEADERS: 'export_leaders',
  SEND_COMMS: 'send_comms',
} as const;

export type AuditAction = (typeof auditAction)[keyof typeof auditAction];
