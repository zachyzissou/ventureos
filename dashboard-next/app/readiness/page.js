"use client";

import { useMemo, useState } from "react";
import { normalizeReadinessPayload } from "@/lib/readiness";
import {
  DEFAULT_API_BASE,
  fetchDashboardJson,
  loginWithToken,
  normalizeApiBase,
} from "@/lib/dashboard-api";

function verdictClass(verdict) {
  if (verdict === "go") return "chip go";
  if (verdict === "hold") return "chip hold";
  return "chip blocked";
}

async function fetchReadiness(apiBase, token) {
  return fetchDashboardJson(apiBase, "/api/openclaw-local-readiness", token);
}

export default function ReadinessPage() {
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [token, setToken] = useState("");
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
      const base = normalizeApiBase(apiBase);
      if (!base) throw new Error("API base URL is required");
      if (includeLogin && token.trim()) {
        await loginWithToken(base, token);
      }
      const payload = await fetchReadiness(base, token);
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
    <main className="page">
      <section className="hero">
        <h1 className="title">Local Readiness (Next Hybrid)</h1>
        <p className="subtitle">
          This page consumes the existing backend contract at{" "}
          <code>/api/openclaw-local-readiness</code>. Authentication remains
          backend-owned via <code>/api/login</code> and standard auth middleware.
        </p>
      </section>

      <section className="card">
        <h3>Connection</h3>
        <div className="actions">
          <input
            type="text"
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            placeholder="Dashboard API base URL"
          />
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Optional token (used for login/header)"
          />
        </div>
        <div className="actions">
          <button
            disabled={loading}
            onClick={() => loadReadiness({ includeLogin: true })}
          >
            {loading ? "Loading..." : "Login + Load"}
          </button>
          <button
            className="secondary"
            disabled={loading}
            onClick={() => loadReadiness({ includeLogin: false })}
          >
            Load Only
          </button>
        </div>
        {loadedAt ? (
          <p className="muted">Last loaded: {loadedAt}</p>
        ) : null}
      </section>

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
              <strong>{blocker.id}</strong> ({blocker.severity})<br />
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
    </main>
  );
}
