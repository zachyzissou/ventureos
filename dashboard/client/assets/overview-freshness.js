(function initOverviewFreshnessUtils(globalScope) {
  function normalizeThresholds(thresholds) {
    const freshRaw = Number(thresholds && thresholds.freshMs);
    const staleRaw = Number(thresholds && thresholds.staleMs);
    const freshMs = Number.isFinite(freshRaw) && freshRaw > 0 ? freshRaw : 1;
    const staleMs = Number.isFinite(staleRaw) && staleRaw > freshMs ? staleRaw : freshMs + 1;
    return { freshMs, staleMs };
  }

  function formatFreshnessAge(ageMs) {
    const age = Math.max(0, Number(ageMs) || 0);
    if (age < 60000) return String(Math.max(1, Math.round(age / 1000))) + 's';
    if (age < 3600000) return String(Math.round(age / 60000)) + 'm';
    if (age < 86400000) return String(Math.round(age / 3600000)) + 'h';
    return String(Math.round(age / 86400000)) + 'd';
  }

  function classifyFreshnessState(sourceMs, thresholds, nowMs) {
    const ts = Number(sourceMs) || 0;
    if (ts <= 0) return { state: 'no-data', ageMs: null, sourceMs: 0 };

    const safeNow = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
    const ageMs = Math.max(0, safeNow - ts);
    const t = normalizeThresholds(thresholds);

    if (ageMs > t.staleMs) return { state: 'stale', ageMs, sourceMs: ts };
    if (ageMs > t.freshMs) return { state: 'aging', ageMs, sourceMs: ts };
    return { state: 'fresh', ageMs, sourceMs: ts };
  }

  function summarizeFreshnessStates(states) {
    const rows = Array.isArray(states) ? states : [];
    const stale = rows.filter((r) => r && r.state === 'stale').length;
    const aging = rows.filter((r) => r && r.state === 'aging').length;
    const unavailable = rows.filter((r) => r && r.state === 'no-data').length;

    if (stale > 0) return { state: 'stale', stale, aging, unavailable };
    if (aging > 0) return { state: 'aging', stale, aging, unavailable };
    if (unavailable > 0) return { state: 'unavailable', stale, aging, unavailable };
    return { state: 'fresh', stale, aging, unavailable };
  }

  globalScope.OverviewFreshnessUtils = {
    normalizeThresholds,
    formatFreshnessAge,
    classifyFreshnessState,
    summarizeFreshnessStates,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
