import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy — San Antonio Bible Talks',
  description: "How we handle leader and visitor data on the SA Bible Talks map.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-12 px-4">
      <article className="max-w-2xl mx-auto bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-8 sm:p-10 text-zinc-950 dark:text-zinc-50">
        <Link
          href="/"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline inline-block mb-6"
        >
          ← Back to map
        </Link>

        <h1 className="text-3xl font-semibold tracking-tight mb-2">Privacy</h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-8 leading-relaxed">
          This site shows a map of bible talks meeting in the San Antonio area. We take
          privacy seriously because the map shows real people&apos;s groups.
        </p>

        <Section title="What's public on this site">
          <ul className="list-disc list-outside pl-5 space-y-1.5">
            <li>An approximate location (about a 1.5-mile circle, not a real address).</li>
            <li>
              Ministry, meeting day and time, language, whether the group is kid-friendly.
            </li>
            <li>
              Optionally, a group name (e.g.&nbsp;&ldquo;Stone Oak Family Group&rdquo;) —
              only when the host has chosen to display it.
            </li>
          </ul>
        </Section>

        <Section title="What's private">
          <p>
            Host names, exact addresses, email addresses, and phone numbers are stored
            encrypted at rest in our database. They are only ever decrypted server-side,
            after an authenticated administrator has signed in with both a password and a
            one-time code. Encrypted data never reaches your browser.
          </p>
        </Section>

        <Section title="Visitor messages">
          <p>
            When you submit the &ldquo;Request to Visit&rdquo; form, we forward your
            message to the host&apos;s email. The host sees your name, email, optional
            phone, and message. You don&apos;t see the host&apos;s email — they reply
            directly. We store your message encrypted for one year so we can confirm
            dispatch and follow up if needed; after one year it is automatically deleted.
          </p>
        </Section>

        <Section title="Spam protection">
          <p>
            We use Cloudflare Turnstile (a checkbox CAPTCHA) and rate-limit requests per
            IP. We log the IP and browser of each visitor-request submission to detect
            abuse.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            We use only essential cookies: a session cookie for administrators to stay
            signed in. We do not use analytics, advertising, or tracking cookies.
          </p>
        </Section>

        <Section title="Removal">
          <p>
            If you are listed on this map and want to be hidden or removed entirely, email{' '}
            <a
              href="mailto:andrew@progradetechlabs.com"
              className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
            >
              andrew@progradetechlabs.com
            </a>
            . Removal is processed within a business day. Removal is complete deletion —
            your data is gone.
          </p>
        </Section>

        <Section title="Audit">
          <p>
            We log administrator actions (sign-ins, viewing private data, edits) and keep
            that log for two years for accountability. The log does not contain personal
            data of leaders or visitors.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions:{' '}
            <a
              href="mailto:andrew@progradetechlabs.com"
              className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
            >
              andrew@progradetechlabs.com
            </a>
            .
          </p>
        </Section>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <div className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{children}</div>
    </section>
  );
}
