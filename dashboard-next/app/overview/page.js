"use client";

import { useMemo, useState } from "react";

import {
  DEFAULT_API_BASE,
  fetchDashboardJson,
  loginWithToken,
  normalizeApiBase,
} from "@/lib/dashboard-api";
import { normalizeOverviewPayload } from "@/lib/overview";

async function fetchOverview(apiBase, token) {
  const [health, services, system] = await Promise.all([
    fetchDashboardJson(apiBase, "/api/health", token),
    fetchDashboardJson(apiBase, "/api/services", token),
    fetchDashboardJson(apiBase, "/api/system", token),
  ]);
  return { health, services, system };
}

export default function OverviewPage() {
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rawPayload, setRawPayload] = useState(null);
  const [loadedAt, setLoadedAt] = useState("");

  const normalized = useMemo(() => {
    if (!rawPayload) return null;
    return normalizeOverviewPayload(rawPayload);
  }, [rawPayload]);

  async function load({ includeLogin }) {
    setLoading(true);
    setError("");
    try {
      const base = normalizeApiBase(apiBase);
      if (!base) throw new Error("API base URL is required");
      if (includeLogin && token.trim()) await loginWithToken(base, token);
      const payload = await fetchOverview(base, token);
      setRawPayload(payload);
      setLoadedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <h1 className="title">Overview (Next Hybrid)</h1>
        <p className="subtitle">
          Read-only operational overview powered by existing backend contracts:
          <code> /api/health</code>, <code>/api/services</code>, <code>/api/system</code>.
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
          <button disabled={loading} onClick={() => load({ includeLogin: true })}>
            {loading ? "Loading..." : "Login + Load"}
          </button>
          <button
            className="secondary"
            disabled={loading}
            onClick={() => load({ includeLogin: false })}
          >
            Load Only
          </button>
        </div>
        {loadedAt ? <p className="muted">Last loaded: {loadedAt}</p> : null}
      </section>

      {error ? (
        <section className="section card">
          <h3>Error</h3>
          <p>{error}</p>
        </section>
      ) : null}

      {normalized ? (
        <>
          <section className="section grid">
            <article className="card">
              <h3>Health</h3>
              <div className="metric">{normalized.health.ok ? "OK" : "FAIL"}</div>
              <div className="muted">
                {normalized.health.service} {normalized.health.version}
              </div>
            </article>
            <article className="card">
              <h3>Services</h3>
              <div className="metric">
                {normalized.services.active}/{normalized.services.total}
              </div>
              <div className="muted">active/total</div>
            </article>
            <article className="card">
              <h3>CPU</h3>
              <div className="metric">{normalized.system.cpuUsage.toFixed(1)}%</div>
            </article>
            <article className="card">
              <h3>Memory</h3>
              <div className="metric">{normalized.system.memoryPercent.toFixed(1)}%</div>
              <div className="muted">
                {normalized.system.memoryUsedGB} / {normalized.system.memoryTotalGB} GB
              </div>
            </article>
            <article className="card">
              <h3>Disk</h3>
              <div className="metric">{normalized.system.diskPercent.toFixed(1)}%</div>
              <div className="muted">
                {normalized.system.diskUsed} / {normalized.system.diskTotal}
              </div>
            </article>
            <article className="card">
              <h3>Crashes</h3>
              <div className="metric">{normalized.system.crashCount}</div>
              <div className="muted">today: {normalized.system.crashesToday}</div>
            </article>
          </section>

          <section className="section card">
            <h2>Service Status</h2>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {normalized.services.rows.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.active ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <section className="section card">
          <h3>State</h3>
          <p className="muted">Load overview data to see system and service metrics.</p>
        </section>
      )}
    </main>
  );
}
