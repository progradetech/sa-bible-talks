import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { getSettings } from '@/lib/repos/site-settings';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Site-wide robots policy follows site_settings.public_indexable. When the
// toggle is off, every page emits <meta name="robots" content="noindex,nofollow">,
// matching robots.ts which serves Disallow: /. Page-level metadata still
// merges on top for titles and descriptions.
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    title: 'San Antonio Bible Talks',
    description:
      'Find a bible talk near you in San Antonio. Approximate locations protect host privacy.',
    robots: settings.publicIndexable
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
