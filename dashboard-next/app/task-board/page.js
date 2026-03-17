"use client";

import { useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { useDashboardSession } from "@/components/dashboard-session-context";
import { requestLocalJson } from "@/lib/dashboard-api";
import {
  allowedTransitions,
  normalizeTaskBoardPayload,
  TASK_PRIORITIES,
} from "@/lib/task-board";

function formatTs(epochMs) {
  if (!epochMs || !Number.isFinite(epochMs)) return "n/a";
  try {
    return new Date(epochMs).toISOString();
  } catch {
    return "n/a";
  }
}

export default function TaskBoardPage() {
  const {
    normalizedApiBase,
    token,
    subject,
    authenticateIfNeeded,
  } = useDashboardSession();

  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transitioningId, setTransitioningId] = useState("");
  const [error, setError] = useState("");
  const [rawListPayload, setRawListPayload] = useState(null);
  const [rawSummaryPayload, setRawSummaryPayload] = useState(null);
  const [loadedAt, setLoadedAt] = useState("");
  const [transitionTargets, setTransitionTargets] = useState({});
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    assigneeId: "",
    missionId: "",
    priority: "medium",
    status: "queued",
  });

  const board = useMemo(() => {
    return normalizeTaskBoardPayload(rawListPayload, rawSummaryPayload);
  }, [rawListPayload, rawSummaryPayload]);

  async function loadBoard({ includeLogin }) {
    setLoading(true);
    setError("");
    try {
      if (!normalizedApiBase) throw new Error("API base URL is required");
      if (includeLogin) await authenticateIfNeeded();
      const [listPayload, summaryPayload] = await Promise.all([
        requestLocalJson("/api/task-board", { token, apiBase: normalizedApiBase, subject }),
        requestLocalJson("/api/task-board/summary", { token, apiBase: normalizedApiBase, subject }),
      ]);
      const normalized = normalizeTaskBoardPayload(listPayload, summaryPayload);
      const nextTargets = {};
      for (const task of normalized.tasks) {
        const options = allowedTransitions(task.status);
        if (options[0]) nextTargets[task.id] = options[0];
      }
      setTransitionTargets(nextTargets);
      setRawListPayload(listPayload);
      setRawSummaryPayload(summaryPayload);
      setLoadedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function createTask() {
    setCreating(true);
    setError("");
    try {
      if (!draft.title.trim()) throw new Error("Task title is required");
      await authenticateIfNeeded();
      await requestLocalJson("/api/task-board", {
        method: "POST",
        token,
        apiBase: normalizedApiBase,
        subject,
        body: {
          title: draft.title.trim(),
          description: draft.description.trim(),
          assigneeId: draft.assigneeId.trim() || null,
          missionId: draft.missionId.trim() || null,
          priority: draft.priority,
          status: draft.status,
        },
      });
      setDraft((prev) => ({
        ...prev,
        title: "",
        description: "",
      }));
      await loadBoard({ includeLogin: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  }

  async function transitionTask(taskId) {
    const target = transitionTargets[taskId];
    if (!target) return;
    setTransitioningId(taskId);
    setError("");
    try {
      await authenticateIfNeeded();
      await requestLocalJson(`/api/task-board/${taskId}`, {
        method: "PATCH",
        token,
        apiBase: normalizedApiBase,
        subject,
        body: { status: target },
      });
      await loadBoard({ includeLogin: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setTransitioningId("");
    }
  }

  return (
    <DashboardShell
      title="Task Board (Next Hybrid, Interactive)"
      subtitle="Interactive operational surface backed by Next API parity routes that proxy existing /api/task-board contracts."
      loadedAt={loadedAt}
      actionButtons={(
        <>
          <button
            disabled={loading || creating || Boolean(transitioningId)}
            onClick={() => loadBoard({ includeLogin: true })}
          >
            {loading ? "Loading..." : "Authenticate + Load Board"}
          </button>
          <button
            className="secondary"
            disabled={loading || creating || Boolean(transitioningId)}
            onClick={() => loadBoard({ includeLogin: false })}
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

      <section className="section grid">
        <article className="card">
          <h3>Total</h3>
          <div className="metric">{board.total}</div>
        </article>
        <article className="card">
          <h3>Queued</h3>
          <div className="metric">{board.summary.columns.queued}</div>
        </article>
        <article className="card">
          <h3>Running</h3>
          <div className="metric">{board.summary.columns.running}</div>
        </article>
        <article className="card">
          <h3>Blocked</h3>
          <div className="metric">{board.summary.columns.blocked}</div>
        </article>
        <article className="card">
          <h3>Review</h3>
          <div className="metric">{board.summary.columns.review}</div>
        </article>
        <article className="card">
          <h3>Failed</h3>
          <div className="metric">{board.summary.columns.failed}</div>
        </article>
      </section>

      <section className="section card">
        <h2>Create Task</h2>
        <div className="actions">
          <input
            type="text"
            value={draft.title}
            onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Title (required)"
          />
          <input
            type="text"
            value={draft.description}
            onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Description"
          />
          <input
            type="text"
            value={draft.assigneeId}
            onChange={(e) => setDraft((prev) => ({ ...prev, assigneeId: e.target.value }))}
            placeholder="Assignee ID"
          />
          <input
            type="text"
            value={draft.missionId}
            onChange={(e) => setDraft((prev) => ({ ...prev, missionId: e.target.value }))}
            placeholder="Mission ID"
          />
          <select
            value={draft.priority}
            onChange={(e) => setDraft((prev) => ({ ...prev, priority: e.target.value }))}
          >
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                priority: {priority}
              </option>
            ))}
          </select>
          <select
            value={draft.status}
            onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value }))}
          >
            <option value="backlog">status: backlog</option>
            <option value="queued">status: queued</option>
          </select>
          <button disabled={creating || loading} onClick={createTask}>
            {creating ? "Creating..." : "Create Task"}
          </button>
        </div>
      </section>

      <section className="section card">
        <h2>Tasks</h2>
        {board.tasks.length === 0 ? (
          <p className="muted">Load task-board data to view cards.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Owner</th>
                <th>Mission</th>
                <th>Updated</th>
                <th>Transition</th>
              </tr>
            </thead>
            <tbody>
              {board.tasks.map((task) => {
                const transitionOptions = allowedTransitions(task.status);
                const hasTransition = transitionOptions.length > 0;
                return (
                  <tr key={task.id}>
                    <td>
                      <strong>{task.title}</strong>
                      {task.description ? <div className="muted">{task.description}</div> : null}
                    </td>
                    <td>{task.status}</td>
                    <td>{task.priority}</td>
                    <td>{task.assigneeId || "unassigned"}</td>
                    <td>{task.missionId || "n/a"}</td>
                    <td>{formatTs(task.updatedAt || task.createdAt)}</td>
                    <td>
                      {hasTransition ? (
                        <div className="actions compact-actions">
                          <select
                            value={transitionTargets[task.id] ?? transitionOptions[0]}
                            onChange={(e) =>
                              setTransitionTargets((prev) => ({
                                ...prev,
                                [task.id]: e.target.value,
                              }))
                            }
                          >
                            {transitionOptions.map((status) => (
                              <option key={`${task.id}-${status}`} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                          <button
                            className="secondary"
                            disabled={transitioningId === task.id || loading || creating}
                            onClick={() => transitionTask(task.id)}
                          >
                            {transitioningId === task.id ? "Applying..." : "Apply"}
                          </button>
                        </div>
                      ) : (
                        <span className="muted">no transitions</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </DashboardShell>
  );
}
