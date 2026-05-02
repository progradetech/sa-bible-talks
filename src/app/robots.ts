import type { MetadataRoute } from 'next';
import { getSettings } from '@/lib/repos/site-settings';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getSettings();
  return {
    rules: settings.publicIndexable
      ? [{ userAgent: '*', allow: '/' }]
      : [{ userAgent: '*', disallow: '/' }],
  };
}
