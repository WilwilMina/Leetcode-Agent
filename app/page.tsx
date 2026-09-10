/**
 * Holding page.
 *
 * Deliberately bare. The real session UI arrives in Phase 1 and goes through the
 * `frontend-design` skill - see CLAUDE.md. This exists so the deployment has something to serve
 * and so the access gate has a page to gate.
 */

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8">
      <h1 className="font-mono text-sm tracking-widest uppercase">Interview Loop</h1>
      <p className="max-w-md text-center text-sm opacity-60">
        Mock technical interviews that will not let you quit on a problem.
      </p>
      <p className="font-mono text-xs opacity-40">Phase 0 — foundations</p>
    </main>
  );
}
