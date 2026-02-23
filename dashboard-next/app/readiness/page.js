"use client";

import { useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { useDashboardSession } from "@/components/dashboard-session-context";
import { fetchDashboardJson } from "@/lib/dashboard-api";
import { normalizeReadinessPayload } from "@/lib/readiness";

function verdictClass(verdict) {
  if (verdict === "go") return "chip go";
  if (verdict === "hold") return "chip hold";
  return "chip blocked";
}

async function fetchReadiness(apiBase, token) {
  return fetchDashboardJson(apiBase, "/api/openclaw-local-readiness", token);
}

export default function ReadinessPage() {
  const {
    normalizedApiBase,
    token,
    authenticateIfNeeded,
  } = useDashboardSession();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rawPayload, setRawPayload] = useState(null);
  const [loadedAt, setLoadedAt] = useState("");

  const normalized = useMemo(
    () => normalizeReadinessPayload(rawPayload),
    [rawPayload],
  );

  async function loadReadiness({ includeLogin }) {
    setLoading(true);
    setError("");
    try {
      if (!normalizedApiBase) throw new Error("API base URL is required");
      if (includeLogin) await authenticateIfNeeded();
      const payload = await fetchReadiness(normalizedApiBase, token);
      setRawPayload(payload);
      setLoadedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const summary = normalized.latest?.summary ?? null;
  const groups = normalized.latest?.checksByGroup ?? [];
  const blockers = normalized.latest?.blockers ?? [];

  return (
    <DashboardShell
      title="Local Readiness (Next Hybrid)"
      subtitle="Consumes /api/openclaw-local-readiness from the existing backend with cookie/token auth parity."
      loadedAt={loadedAt}
      actionButtons={(
        <>
          <button
            disabled={loading}
            onClick={() => loadReadiness({ includeLogin: true })}
          >
            {loading ? "Loading..." : "Authenticate + Load"}
          </button>
          <button
            className="secondary"
            disabled={loading}
            onClick={() => loadReadiness({ includeLogin: false })}
          >
            Load Only
          </button>
        </>
      )}
    >
      {error ? (
        <section className="section card">
          <h3>Error</h3>
          <p>{error}</p>
        </section>
      ) : null}

      {!normalized.available ? (
        <section className="section card">
          <h3>State</h3>
          <p className="muted">
            No readiness payload loaded yet.
            {normalized.reason ? ` Reason: ${normalized.reason}` : ""}
          </p>
        </section>
      ) : null}

      {summary ? (
        <section className="section grid">
          <article className="card">
            <h3>Verdict</h3>
            <span className={verdictClass(summary.verdict)}>
              {summary.verdict.toUpperCase()}
            </span>
          </article>
          <article className="card">
            <h3>Readiness Score</h3>
            <div className="metric">{summary.readinessScore}</div>
          </article>
          <article className="card">
            <h3>Confidence</h3>
            <div className="metric">{summary.confidence}</div>
          </article>
          <article className="card">
            <h3>Profile</h3>
            <div className="metric">{summary.profile}</div>
          </article>
          <article className="card">
            <h3>Warnings</h3>
            <div className="metric">{summary.warnings}</div>
          </article>
          <article className="card">
            <h3>Required Failures</h3>
            <div className="metric">{summary.requiredFailures}</div>
          </article>
        </section>
      ) : null}

      {blockers.length > 0 ? (
        <section className="section card">
          <h2>Top Blockers</h2>
          {blockers.map((blocker) => (
            <div key={blocker.id} className="blocker">
              <strong>{blocker.id}</strong> ({blocker.severity})
              <br />
              {blocker.description}
              <br />
              <span className="muted">
                owner={blocker.owner} | cause={blocker.likelyCause}
              </span>
              <br />
              <code>{blocker.nextCommand}</code>
            </div>
          ))}
        </section>
      ) : null}

      {groups.length > 0 ? (
        <section className="section card">
          <h2>Checks by Group</h2>
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Total</th>
                <th>Pass</th>
                <th>Fail</th>
                <th>Skipped</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id}>
                  <td>{group.id}</td>
                  <td>{group.total}</td>
                  <td>{group.pass}</td>
                  <td>{group.fail}</td>
                  <td>{group.skipped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </DashboardShell>
  );
}
