/*
  Optional standalone Express server for VentureOS RPG APIs.
  The dashboard integration uses openclaw-dashboard's built-in HTTP server + handleRpgApi.
*/

const express = require('express');
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

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

const DB_PATH = process.env.VENTUREOS_RPG_DB || defaultDbPath();

app.get('/api/rpg/stats', async (_req, res) => {
  res.json(await getLatestStatsAll({ dbPath: DB_PATH }));
});

app.get('/api/rpg/stats/:agent', async (req, res) => {
  const data = await getLatestStatsAgent(req.params.agent, { dbPath: DB_PATH });
  res.status(data.ok ? 200 : 404).json(data);
});

app.get('/api/rpg/tactical-overlay/:agent', async (req, res) => {
  const data = await getTacticalOverlay(req.params.agent, { dbPath: DB_PATH });
  res.status(data.ok ? 200 : 404).json(data);
});

app.get('/api/rpg/khala-network', async (req, res) => {
  const data = await getKhalaNetwork({ dbPath: DB_PATH, driftLimit: req.query.driftLimit });
  res.json(data);
});

app.get('/api/rpg/khala-network/:agent', async (req, res) => {
  const data = await getKhalaNetworkForAgent(req.params.agent, { dbPath: DB_PATH, driftLimit: req.query.driftLimit });
  res.status(data.ok ? 200 : 404).json(data);
});

app.get('/api/rpg/protocols/:agent', async (req, res) => {
  const data = await getActiveProtocols(req.params.agent, { dbPath: DB_PATH, limit: req.query.limit });
  res.status(data.ok ? 200 : 404).json(data);
});

app.get('/api/rpg/escalations/:agent', async (req, res) => {
  const data = await getEscalationStats(req.params.agent, { dbPath: DB_PATH, windowDays: req.query.windowDays });
  res.status(data.ok ? 200 : 404).json(data);
});

const PORT = parseInt(process.env.VENTUREOS_RPG_PORT || '7010', 10);
const HOST = process.env.VENTUREOS_RPG_HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`VentureOS RPG API (Express): http://${HOST}:${PORT}`);
  console.log(`DB: ${DB_PATH}`);
});
