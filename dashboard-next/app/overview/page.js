"use client";

import { useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { useDashboardSession } from "@/components/dashboard-session-context";
import { fetchDashboardJson } from "@/lib/dashboard-api";
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
  const {
    normalizedApiBase,
    token,
    authenticateIfNeeded,
  } = useDashboardSession();

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
      if (!normalizedApiBase) throw new Error("API base URL is required");
      if (includeLogin) await authenticateIfNeeded();
      const payload = await fetchOverview(normalizedApiBase, token);
      setRawPayload(payload);
      setLoadedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell
      title="Overview (Next Hybrid)"
      subtitle="Operational overview backed by /api/health, /api/services, and /api/system."
      loadedAt={loadedAt}
      actionButtons={(
        <>
          <button disabled={loading} onClick={() => load({ includeLogin: true })}>
            {loading ? "Loading..." : "Authenticate + Load"}
          </button>
          <button
            className="secondary"
            disabled={loading}
            onClick={() => load({ includeLogin: false })}
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
    </DashboardShell>
  );
}
