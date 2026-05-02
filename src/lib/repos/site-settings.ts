import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db, siteSettings } from '@/db';

export interface SiteSettings {
  publicIndexable: boolean;
  defaultJitterMiles: number;
}

// Conservative defaults: if the singleton row is missing or the DB is
// unreachable, treat the site as non-indexable. Better to be invisible to
// Google by accident than to leak indexing before the operator is ready.
const DEFAULT: SiteSettings = {
  publicIndexable: false,
  defaultJitterMiles: 1.5,
};

// React's cache() memoizes per-request — multiple callers within a single
// page render share one DB query.
export const getSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const [row] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.id, 1))
      .limit(1);
    if (!row) return DEFAULT;
    return {
      publicIndexable: row.publicIndexable,
      defaultJitterMiles: Number(row.defaultJitterMiles),
    };
  } catch (err) {
    console.error('failed to read site_settings:', err);
    return DEFAULT;
  }
});

import { record } from '../audit';
import type { AdminContext } from '../types';

interface UpdateSettingsInput {
  publicIndexable?: boolean;
  defaultJitterMiles?: number;
}

export async function updateSettings(
  input: UpdateSettingsInput,
  ctx: AdminContext,
): Promise<void> {
  const updates: Partial<typeof siteSettings.$inferInsert> = {
    updatedAt: new Date(),
    updatedBy: ctx.adminUserId,
  };
  if (input.publicIndexable !== undefined) {
    updates.publicIndexable = input.publicIndexable;
  }
  if (input.defaultJitterMiles !== undefined) {
    updates.defaultJitterMiles = input.defaultJitterMiles.toString();
  }

  await db.update(siteSettings).set(updates).where(eq(siteSettings.id, 1));

  if (input.publicIndexable !== undefined) {
    await record({
      action: 'toggle_public_indexable',
      ctx,
      metadata: { value: input.publicIndexable },
    });
  }
}
