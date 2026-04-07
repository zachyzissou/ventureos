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
    token,
    setToken,
    authState,
    authError,
    lastAuthAt,
    authenticate,
  } = useDashboardSession();
  const apiBaseInputId = "dashboard-api-base";
  const apiBaseHelpId = "dashboard-api-base-help";
  const tokenInputId = "dashboard-token";
  const tokenHelpId = "dashboard-token-help";
  const authErrorId = "dashboard-auth-error";

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
        <form
          className="actions auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            onAuthenticate();
          }}
        >
          <div className="field-group">
            <label htmlFor={apiBaseInputId}>Dashboard API base URL</label>
            <input
              id={apiBaseInputId}
              type="text"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              placeholder="https://ventureos.example.com"
              autoComplete="url"
              aria-describedby={apiBaseHelpId}
            />
            <p id={apiBaseHelpId} className="field-help muted">
              Used by the dashboard shell and authentication flow. Enter the fully-qualified base URL for the backend you want this tab to target.
            </p>
          </div>
          <div className="field-group">
            <label htmlFor={tokenInputId}>Session token</label>
            <input
              id={tokenInputId}
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste token for /api/login and Authorization header"
              autoComplete="current-password"
              spellCheck={false}
              aria-describedby={`${tokenHelpId}${authError ? ` ${authErrorId}` : ""}`}
            />
            <p id={tokenHelpId} className="field-help muted">
              Token input is masked in the UI. The current session stores the configured API base and token in this browser’s local storage so refreshes do not drop auth context.
            </p>
          </div>
          <button
            type="submit"
            disabled={authState === "authenticating"}
          >
            {authState === "authenticating" ? "Authenticating..." : "Authenticate Session"}
          </button>
        </form>
        {lastAuthAt ? <p className="muted">Last authenticated: {lastAuthAt}</p> : null}
        {authError ? (
          <p id={authErrorId} className="error-text" role="alert">
            {authError}
          </p>
        ) : null}
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
