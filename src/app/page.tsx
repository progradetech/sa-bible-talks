export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          San Antonio Bible Talks
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Map coming soon. This is the scaffolded shell — the public map will render here once the
          data layer and provisioning steps are complete.
        </p>
      </main>
    </div>
  );
}
