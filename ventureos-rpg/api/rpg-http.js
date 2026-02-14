const {
  defaultDbPath,
  getLatestStatsAll,
  getLatestStatsAgent,
  getTacticalOverlay,
  getKhalaNetwork,
  getKhalaNetworkForAgent,
  getActiveProtocols,
  getEscalationStats
} = require('./rpg-service');

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function handleOptions(req, res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end();
}

function handleRpgApi(req, res, { dbPath = defaultDbPath() } = {}) {
  if (!req.url) return false;
  if (!req.url.startsWith('/api/rpg/')) return false;

  if (req.method === 'OPTIONS') {
    handleOptions(req, res);
    return true;
  }
  if (req.method && req.method !== 'GET') {
    sendJson(res, { ok: false, error: 'Method not allowed' }, 405);
    return true;
  }

  // Run async without forcing the caller to await.
  (async () => {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean); // [api,rpg,...]
    const route = parts.slice(2); // after api/rpg

    try {
      if (route.length === 1 && route[0] === 'stats') {
        const data = await getLatestStatsAll({ dbPath });
        return sendJson(res, data);
      }
      if (route.length === 2 && route[0] === 'stats') {
        const data = await getLatestStatsAgent(route[1], { dbPath });
        return sendJson(res, data, data.ok ? 200 : 404);
      }
      if (route.length === 2 && route[0] === 'tactical-overlay') {
        const data = await getTacticalOverlay(route[1], { dbPath });
        return sendJson(res, data, data.ok ? 200 : 404);
      }
      if (route.length === 1 && route[0] === 'khala-network') {
        const driftLimit = url.searchParams.get('driftLimit');
        const data = await getKhalaNetwork({ dbPath, driftLimit });
        return sendJson(res, data);
      }
      if (route.length === 2 && route[0] === 'khala-network') {
        const driftLimit = url.searchParams.get('driftLimit');
        const data = await getKhalaNetworkForAgent(route[1], { dbPath, driftLimit });
        return sendJson(res, data, data.ok ? 200 : 404);
      }
      if (route.length === 2 && route[0] === 'protocols') {
        const data = await getActiveProtocols(route[1], { dbPath, limit: url.searchParams.get('limit') || 20 });
        return sendJson(res, data, data.ok ? 200 : 404);
      }
      if (route.length === 2 && route[0] === 'escalations') {
        const data = await getEscalationStats(route[1], { dbPath, windowDays: url.searchParams.get('windowDays') || 30 });
        return sendJson(res, data, data.ok ? 200 : 404);
      }

      sendJson(res, { ok: false, error: 'Not found' }, 404);
    } catch (e) {
      console.error('RPG API error:', e);
      sendJson(res, { ok: false, error: 'Internal error', details: String(e?.message || e) }, 500);
    }
  })();

  return true;
}

module.exports = { handleRpgApi };
