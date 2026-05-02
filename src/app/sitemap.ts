import type { MetadataRoute } from 'next';
import { getSettings } from '@/lib/repos/site-settings';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // When the visibility toggle is OFF, return an empty sitemap. The
  // robots.ts route serves Disallow: /, which already tells crawlers to
  // ignore the site, but emitting an empty sitemap is consistent.
  const settings = await getSettings();
  if (!settings.publicIndexable) return [];

  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];
}
