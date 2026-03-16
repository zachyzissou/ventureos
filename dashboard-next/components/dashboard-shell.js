"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useDashboardSession } from "@/components/dashboard-session-context";

const ROUTES = [
  { href: "/readiness", label: "Readiness" },
  { href: "/overview", label: "Overview" },
  { href: "/logs", label: "Logs" },
  { href: "/task-board", label: "Task Board" },
];

function authBadgeClass(authState) {
  if (authState === "authenticated") return "chip go";
  if (authState === "authenticating") return "chip hold";
  if (authState === "error") return "chip blocked";
  return "chip";
}

function authLabel(authState) {
  if (authState === "authenticated") return "authenticated";
  if (authState === "authenticating") return "authenticating";
  if (authState === "error") return "auth error";
  return "idle";
}

export function DashboardShell({
  title,
  subtitle,
  loadedAt,
  actionButtons,
  children,
}) {
  const pathname = usePathname();
  const {
    apiBase,
    setApiBase,
    normalizedApiBase,
    token,
    setToken,
    authState,
    authError,
    lastAuthAt,
    authenticate,
  } = useDashboardSession();

  async function onAuthenticate() {
    try {
      await authenticate();
    } catch {
      // Error details are already captured in shared session state.
    }
  }

  return (
    <main className="page">
      <section className="card shell-card">
        <div className="shell-row">
          <div className="shell-title-wrap">
            <strong className="shell-title">Dashboard Next Hybrid</strong>
            <span className="muted">Backend auth + API routes remain source of truth</span>
          </div>
          <span className={authBadgeClass(authState)}>{authLabel(authState)}</span>
        </div>
        <div className="nav-row">
          {ROUTES.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className={`nav-chip${pathname === route.href ? " active" : ""}`}
            >
              {route.label}
            </Link>
          ))}
        </div>
        <div className="actions">
          <div className="field-group">
            <label className="field-label" htmlFor="dashboard-api-base">
              Dashboard API base URL
            </label>
            <input
              id="dashboard-api-base"
              type="text"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              placeholder="http://localhost:7000"
              aria-describedby="dashboard-api-base-help"
            />
            <p id="dashboard-api-base-help" className="field-help">
              Read-only pages call this base directly. Task Board proxies use this same value
              when forwarding requests through Next API routes.
            </p>
            {normalizedApiBase ? (
              <p className="field-help">Normalized base: {normalizedApiBase}</p>
            ) : (
              <p className="field-help">Enter a valid dashboard API base URL to enable requests.</p>
            )}
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="dashboard-token">
              Session token
            </label>
            <input
              id="dashboard-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Token for /api/login and Authorization header"
              autoComplete="current-password"
              spellCheck="false"
              aria-describedby="dashboard-token-help"
            />
            <p id="dashboard-token-help" className="field-help">
              Stored only in this browser session storage. The token is masked in the UI and sent
              to authenticate or forward authorized requests.
            </p>
          </div>
          <button
            disabled={authState === "authenticating"}
            onClick={onAuthenticate}
          >
            {authState === "authenticating" ? "Authenticating..." : "Authenticate Session"}
          </button>
        </div>
        {lastAuthAt ? <p className="muted">Last authenticated: {lastAuthAt}</p> : null}
        {authError ? <p className="error-text">{authError}</p> : null}
      </section>

      <section className="hero">
        <h1 className="title">{title}</h1>
        <p className="subtitle">{subtitle}</p>
      </section>

      <section className="card">
        <h3>Actions</h3>
        <div className="actions">{actionButtons}</div>
        {loadedAt ? <p className="muted">Last loaded: {loadedAt}</p> : null}
      </section>

      {children}
    </main>
  );
}
