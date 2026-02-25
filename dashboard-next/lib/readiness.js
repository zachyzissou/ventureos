function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value, fallback = "") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function asNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeReadinessPayload(payload) {
  const root = asRecord(payload);
  if (!root) {
    return { ok: false, available: false, error: "Invalid payload shape" };
  }

  const latest = asRecord(root.latest);
  const summary = latest ? asRecord(latest.summary) : null;

  return {
    ok: Boolean(root.ok),
    available: Boolean(root.available),
    reason: asString(root.reason, ""),
    latest: latest
      ? {
          timestamp: asString(latest.timestamp, ""),
          generatedAt: asString(latest.generatedAt, ""),
          summary: {
            profile: asString(summary?.profile, "full"),
            verdict: asString(summary?.verdict, "blocked"),
            readinessScore: asNumber(summary?.readinessScore, 0),
            confidence: asString(summary?.confidence, "low"),
            warnings: asNumber(summary?.warnings, 0),
            requiredFailures: asNumber(summary?.requiredFailures, 0),
            requiredSkipped: asNumber(summary?.requiredSkipped, 0),
            totalChecks: asNumber(summary?.totalChecks, 0),
          },
          checksByGroup: asArray(latest.checksByGroup).map((row) => {
            const group = asRecord(row) ?? {};
            return {
              id: asString(group.id, "unknown"),
              total: asNumber(group.total, 0),
              pass: asNumber(group.pass, 0),
              fail: asNumber(group.fail, 0),
              skipped: asNumber(group.skipped, 0),
            };
          }),
          blockers: asArray(latest.blockers).map((row) => {
            const blocker = asRecord(row) ?? {};
            return {
              id: asString(blocker.id, "unknown"),
              description: asString(blocker.description, "No description"),
              severity: asString(blocker.severity, "info"),
              owner: asString(blocker.owner, "Unassigned"),
              likelyCause: asString(blocker.likelyCause, "Unknown"),
              nextCommand: asString(blocker.nextCommand, "Inspect logs."),
            };
          }),
        }
      : null,
    error: asString(root.error, ""),
  };
}
