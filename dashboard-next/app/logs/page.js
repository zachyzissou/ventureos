"use client";

import { useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { useDashboardSession } from "@/components/dashboard-session-context";
import { fetchDashboardJson } from "@/lib/dashboard-api";
import {
  normalizeLogEntriesPayload,
  normalizeLogSourcesPayload,
} from "@/lib/logs";

async function fetchSources(apiBase, token) {
  const payload = await fetchDashboardJson(apiBase, "/api/logs/sources", token);
  return normalizeLogSourcesPayload(payload);
}

async function fetchEntries(apiBase, token, sourceId, opts) {
  const params = new URLSearchParams();
  params.set("source", sourceId);
  params.set("limit", String(opts.limit));
  if (opts.search) params.set("search", opts.search);
  if (opts.level && opts.level !== "all") params.set("level", opts.level);
  const payload = await fetchDashboardJson(
    apiBase,
    `/api/logs/entries?${params.toString()}`,
    token,
  );
  return normalizeLogEntriesPayload(payload);
}

export default function LogsPage() {
  const {
    normalizedApiBase,
    token,
    authenticateIfNeeded,
  } = useDashboardSession();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sources, setSources] = useState([]);
  const [entriesPayload, setEntriesPayload] = useState(null);
  const [selectedSource, setSelectedSource] = useState("");
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("all");
  const [limit, setLimit] = useState("200");
  const [loadedAt, setLoadedAt] = useState("");

  const entries = useMemo(() => entriesPayload?.entries ?? [], [entriesPayload]);

  async function loadSources({ includeLogin }) {
    setLoading(true);
    setError("");
    try {
      if (!normalizedApiBase) throw new Error("API base URL is required");
      if (includeLogin) await authenticateIfNeeded();
      const payload = await fetchSources(normalizedApiBase, token);
      setSources(payload.sources);
      if (!selectedSource && payload.sources[0]?.id) {
        setSelectedSource(payload.sources[0].id);
      }
      setLoadedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function loadEntries() {
    setLoading(true);
    setError("");
    try {
      if (!normalizedApiBase) throw new Error("API base URL is required");
      if (!selectedSource) throw new Error("Select a log source first");
      const limitNum = Math.max(10, Math.min(2000, Number.parseInt(limit, 10) || 200));
      const payload = await fetchEntries(normalizedApiBase, token, selectedSource, {
        limit: limitNum,
        search: search.trim(),
        level,
      });
      setEntriesPayload(payload);
      setLoadedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell
      title="Logs (Next Hybrid)"
      subtitle="Read-only logs interface backed by /api/logs/sources and /api/logs/entries."
      loadedAt={loadedAt}
      actionButtons={(
        <>
          <button
            disabled={loading}
            onClick={() => loadSources({ includeLogin: true })}
          >
            {loading ? "Loading..." : "Authenticate + Load Sources"}
          </button>
          <button
            className="secondary"
            disabled={loading}
            onClick={() => loadSources({ includeLogin: false })}
          >
            Load Sources Only
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

      <section className="section card">
        <h2>Query</h2>
        <div className="actions">
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
          >
            <option value="">Select source...</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.id} ({source.format}, {source.lines} lines)
              </option>
            ))}
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search text"
          />
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="all">all levels</option>
            <option value="error">error</option>
            <option value="warn">warn</option>
            <option value="info">info</option>
            <option value="debug">debug</option>
          </select>
          <input
            type="text"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="limit"
          />
          <button disabled={loading || !selectedSource} onClick={loadEntries}>
            Load Entries
          </button>
        </div>
      </section>

      <section className="section card">
        <h2>Sources</h2>
        {sources.length === 0 ? (
          <p className="muted">No sources loaded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Format</th>
                <th>Lines</th>
                <th>Modified</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id}>
                  <td>{source.id}</td>
                  <td>{source.name}</td>
                  <td>{source.format}</td>
                  <td>{source.lines}</td>
                  <td>{source.modified || "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="section card">
        <h2>Entries</h2>
        {!entriesPayload ? (
          <p className="muted">Load entries from a selected source.</p>
        ) : entries.length === 0 ? (
          <p className="muted">No entries matched this query.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>TS</th>
                <th>Level</th>
                <th>Source</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => (
                <tr key={`${entry.ts}-${idx}`}>
                  <td>{entry.ts || "n/a"}</td>
                  <td>{entry.level}</td>
                  <td>{entry.source}</td>
                  <td>{entry.message || "(empty)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </DashboardShell>
  );
}
