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

export function normalizeOverviewPayload({ health, services, system }) {
  const healthRow = asRecord(health) ?? {};
  const systemRow = asRecord(system) ?? {};
  const cpu = asRecord(systemRow.cpu) ?? {};
  const memory = asRecord(systemRow.memory) ?? {};
  const disk = asRecord(systemRow.disk) ?? {};

  const normalizedServices = asArray(services).map((row) => {
    const service = asRecord(row) ?? {};
    return {
      name: asString(service.name, "unknown"),
      active: Boolean(service.active),
    };
  });

  const activeCount = normalizedServices.filter((row) => row.active).length;

  return {
    health: {
      ok: Boolean(healthRow.ok),
      service: asString(healthRow.service, "unknown"),
      version: asString(healthRow.version, ""),
      uptime: asNumber(healthRow.uptime, 0),
      timestamp: asString(healthRow.timestamp, ""),
      dataMode: asString(healthRow.dataMode, "filesystem"),
    },
    services: {
      rows: normalizedServices,
      total: normalizedServices.length,
      active: activeCount,
      inactive: Math.max(0, normalizedServices.length - activeCount),
    },
    system: {
      cpuUsage: asNumber(cpu.usage, 0),
      diskPercent: asNumber(disk.percent, 0),
      memoryPercent: asNumber(memory.percent, 0),
      load1m: asString(asRecord(systemRow.loadAvg)?.["1m"], "n/a"),
      crashCount: asNumber(systemRow.crashCount, 0),
      crashesToday: asNumber(systemRow.crashesToday, 0),
      uptime: asNumber(systemRow.uptime, 0),
      diskUsed: asString(disk.used, ""),
      diskTotal: asString(disk.total, ""),
      memoryUsedGB: asString(memory.usedGB, ""),
      memoryTotalGB: asString(memory.totalGB, ""),
    },
  };
}
