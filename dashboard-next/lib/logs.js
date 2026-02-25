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

export function normalizeLogSourcesPayload(payload) {
  const root = asRecord(payload) ?? {};
  return {
    sources: asArray(root.sources).map((row) => {
      const source = asRecord(row) ?? {};
      return {
        id: asString(source.id, "unknown"),
        name: asString(source.name, "Unknown"),
        format: asString(source.format, "text"),
        size: asNumber(source.size, 0),
        modified: asString(source.modified, ""),
        lines: asNumber(source.lines, 0),
      };
    }),
  };
}

export function normalizeLogEntriesPayload(payload) {
  const root = asRecord(payload) ?? {};
  return {
    source: asString(root.source, ""),
    total: asNumber(root.total, 0),
    limit: asNumber(root.limit, 0),
    entries: asArray(root.entries).map((row) => {
      const entry = asRecord(row) ?? {};
      return {
        ts: asString(entry.ts, ""),
        level: asString(entry.level, "info"),
        source: asString(entry.source, "unknown"),
        message: asString(entry.message, ""),
        raw: asString(entry.raw, ""),
      };
    }),
  };
}
