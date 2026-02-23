"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DEFAULT_API_BASE,
  loginWithToken,
  normalizeApiBase,
} from "@/lib/dashboard-api";

const SESSION_STORAGE_API_BASE = "ventureos.dashboardNext.apiBase";
const SESSION_STORAGE_TOKEN = "ventureos.dashboardNext.token";

const DashboardSessionContext = createContext(null);

function readStorage(key, fallbackValue) {
  if (typeof window === "undefined") return fallbackValue;
  const raw = window.localStorage.getItem(key);
  return raw == null ? fallbackValue : raw;
}

export function DashboardSessionProvider({ children }) {
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [token, setToken] = useState("");
  const [authState, setAuthState] = useState("idle");
  const [authError, setAuthError] = useState("");
  const [lastAuthAt, setLastAuthAt] = useState("");

  useEffect(() => {
    setApiBase(readStorage(SESSION_STORAGE_API_BASE, DEFAULT_API_BASE));
    setToken(readStorage(SESSION_STORAGE_TOKEN, ""));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SESSION_STORAGE_API_BASE, apiBase);
  }, [apiBase]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SESSION_STORAGE_TOKEN, token);
  }, [token]);

  useEffect(() => {
    setAuthState("idle");
    setAuthError("");
    setLastAuthAt("");
  }, [apiBase, token]);

  const authenticate = useCallback(async () => {
    const base = normalizeApiBase(apiBase);
    const cleanToken = String(token ?? "").trim();
    if (!base) throw new Error("API base URL is required");
    if (!cleanToken) throw new Error("Token is required to authenticate session");

    setAuthState("authenticating");
    setAuthError("");
    try {
      await loginWithToken(base, cleanToken);
      setAuthState("authenticated");
      setLastAuthAt(new Date().toISOString());
      setAuthError("");
    } catch (err) {
      setAuthState("error");
      const message = err instanceof Error ? err.message : "Authentication failed";
      setAuthError(message);
      throw err;
    }
  }, [apiBase, token]);

  const authenticateIfNeeded = useCallback(async () => {
    if (authState === "authenticated") return;
    await authenticate();
  }, [authState, authenticate]);

  const value = useMemo(
    () => ({
      apiBase,
      setApiBase,
      token,
      setToken,
      authState,
      authError,
      lastAuthAt,
      authenticate,
      authenticateIfNeeded,
      normalizedApiBase: normalizeApiBase(apiBase),
    }),
    [
      apiBase,
      token,
      authState,
      authError,
      lastAuthAt,
      authenticate,
      authenticateIfNeeded,
    ],
  );

  return (
    <DashboardSessionContext.Provider value={value}>
      {children}
    </DashboardSessionContext.Provider>
  );
}

export function useDashboardSession() {
  const ctx = useContext(DashboardSessionContext);
  if (!ctx) {
    throw new Error("useDashboardSession must be used inside DashboardSessionProvider");
  }
  return ctx;
}
