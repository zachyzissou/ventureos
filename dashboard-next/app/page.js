import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <h1 className="title">VentureOS Dashboard Next (Hybrid)</h1>
        <p className="subtitle">
          Incremental Next.js migration surface. Backend APIs and authentication remain
          owned by the existing dashboard service.
        </p>
      </section>

      <section className="card">
        <h3>Migrated Routes</h3>
        <p className="muted">
          Current Next.js hybrid surfaces use existing backend contracts and auth.
        </p>
        <ul>
          <li>
            <Link href="/readiness">/readiness</Link> (
            <code>/api/openclaw-local-readiness</code>)
          </li>
          <li>
            <Link href="/overview">/overview</Link> (
            <code>/api/health</code>, <code>/api/services</code>, <code>/api/system</code>)
          </li>
          <li>
            <Link href="/logs">/logs</Link> (
            <code>/api/logs/sources</code>, <code>/api/logs/entries</code>)
          </li>
          <li>
            <Link href="/task-board">/task-board</Link> (
            <code>/api/task-board</code>, <code>/api/task-board/summary</code>)
          </li>
        </ul>
      </section>
    </main>
  );
}
