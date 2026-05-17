import Link from 'next/link';
import { listPublic } from '@/lib/repos/leaders';
import { PublicMap } from '@/components/PublicMap';

export const revalidate = 60;

export default async function Home() {
  const locations = await listPublic();

  return (
    <main className="relative w-full h-screen">
      <header className="absolute top-3 md:top-4 left-1/2 -translate-x-1/2 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur rounded-lg shadow-lg px-3 py-1.5 md:px-5 md:py-2 flex items-center gap-2 md:gap-4 max-w-[calc(100vw-1.5rem)]">
        <h1 className="text-sm md:text-base font-semibold whitespace-nowrap text-zinc-950 dark:text-zinc-50">
          San Antonio Bible Talks
        </h1>
        <Link
          href="/privacy"
          className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 whitespace-nowrap"
        >
          Privacy
        </Link>
      </header>
      <PublicMap locations={locations} />
    </main>
  );
}
