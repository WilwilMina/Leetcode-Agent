/**
 * Holding page.
 *
 * Everything past this point happens at /session. This page just orients and hands off - no
 * marketing copy, no feature list.
 */

import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex max-w-md flex-col gap-3 border border-line bg-panel px-6 py-5">
        <h1 className="text-sm font-medium">Interview Loop</h1>
        <p className="text-sm leading-relaxed text-muted">
          Mock technical interviews that will not let you quit on a problem.
        </p>
        <Link
          href="/session"
          className="mt-2 self-start border border-ink px-3 py-1.5 text-sm hover:bg-ink hover:text-paper"
        >
          Start a session
        </Link>
      </div>
    </main>
  );
}
