'use strict';
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { createSession, runTurn } = require('./loop');
const { createMockTools } = require('./mock-tools');
const { buildClauseIndex, mockClauseIndex } = require('./clause-index');
const { buildSystemPrompt, PROMPT_VERSION } = require('./prompt');

const PORT = Number(process.env.AGENT_PORT || 3200);
const PROVIDER = (process.env.AGENT_PROVIDER || 'stub').toLowerCase();
const BACKEND = (process.env.AGENT_BACKEND || 'mock').toLowerCase();
const EXPOSE_TRACE = process.env.AGENT_EXPOSE_TRACE !== '0';
const MAX_BODY = 10 * 1024;
const MAX_MESSAGE = 1000;
const MAX_SESSIONS = 200;
const SESSION_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Providers: stub (default, no model), ollama (local dev), gemini (gates only, costs requests).
// Backends: mock (default, in-memory fixtures) or saleor (reads Saleor, records refunds in Postgres).
const DEFAULT_MODELS = { ollama: 'llama3.1:8b', gemini: 'gemini-3.5-flash-lite' };
const fail = (msg) => { console.error(`agent cannot start: ${msg}`); process.exit(1); };
if (!['stub', 'ollama', 'gemini'].includes(PROVIDER)) fail(`AGENT_PROVIDER "${PROVIDER}" is not available (stub, ollama or gemini)`);
if (BACKEND !== 'mock' && BACKEND !== 'saleor') fail(`AGENT_BACKEND "${BACKEND}" is not available (mock or saleor)`);

// The stub run needs no .env; the real providers read GEMINI_API_KEY / OLLAMA_URL from it (never overrides the shell).
if (PROVIDER !== 'stub') require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const MODEL = process.env.AGENT_MODEL || DEFAULT_MODELS[PROVIDER];

let provider;
try {
  if (PROVIDER === 'stub') provider = require('./providers/stub').createStub(); // loaded only for the stub (it needs assistant/router.js)
  else if (PROVIDER === 'ollama') provider = require('./providers/ollama').createOllama({ model: MODEL });
  else provider = require('./providers/gemini').createGemini({ model: MODEL });
} catch (e) {
  fail(e.message);
}
let systemPrompt; // built at start for the real providers; the stub ignores it
const sessions = new Map();

// The saleor backend is loaded only when asked for, so the default mock run needs no .env, no Saleor, no Postgres.
// assistant/saleor.js must be required BEFORE utils/db-client.js: it loads .env, and db-client reads DATABASE_URL on require.
let db = null;
let makeBackend = () => createMockTools();
let initBackend = async () => {};
if (BACKEND === 'saleor') {
  const saleor = require('../assistant/saleor');
  db = require('../utils/db-client');
  const { createSaleorTools, initSaleorBackend } = require('./saleor-tools');
  makeBackend = (sessionId) => createSaleorTools({ sessionId, saleor, db });
  initBackend = () => initSaleorBackend(db);
}

function getSession(id) {
  if (!sessions.has(id)) {
    if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
    sessions.set(id, createSession(makeBackend(id)));
  }
  return sessions.get(id);
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { tooLarge = true; return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) reject(Object.assign(new Error('payload too large'), { status: 413 }));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

async function handleAgent(req, res) {
  let raw;
  try { raw = await readBody(req); } catch (e) { return send(res, e.status || 400, { error: e.message }); }
  let input;
  try { input = JSON.parse(raw); } catch { return send(res, 400, { error: 'body must be valid JSON' }); }

  const message = input && typeof input.message === 'string' ? input.message.trim() : '';
  if (!message) return send(res, 400, { error: '"message" must be a non-empty string' });
  if (message.length > MAX_MESSAGE) return send(res, 400, { error: `"message" must be at most ${MAX_MESSAGE} characters` });
  let sessionId = input.session_id;
  if (sessionId === undefined) sessionId = crypto.randomUUID();
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) {
    return send(res, 400, { error: '"session_id" must match [A-Za-z0-9_-]{1,64}' });
  }

  const started = Date.now();
  try {
    const before = provider.stats ? provider.stats.requests : 0;
    const r = await runTurn(getSession(sessionId), provider, message, { system: systemPrompt });
    const http_requests = provider.stats ? ` http_requests=${provider.stats.requests - before}` : '';
    console.log(`agent ok: provider=${provider.name} calls=${r.trace.length} model_calls=${r.modelCalls}${http_requests} ${Date.now() - started}ms`);
    const body = { session_id: sessionId, reply: r.reply, model_calls: r.modelCalls, truncated: r.truncated };
    if (EXPOSE_TRACE) body.trace = r.trace;
    return send(res, 200, body);
  } catch (e) {
    console.error('agent error:', e.message);
    return send(res, 502, { error: 'agent_error' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      // The stub body stays exactly { status, provider, backend } (the specs compare it); real providers add model and request count.
      const extra = provider.stats ? { model: provider.model, model_requests: provider.stats.requests, ...(provider.stats.coercions !== undefined ? { coercions: provider.stats.coercions } : {}) } : {};
      return send(res, 200, { status: 'ok', provider: provider.name, backend: BACKEND, ...extra });
    }
    // Test hook: final state of a session (recorded refund actions, pending count, turns).
    if (req.method === 'GET' && url.pathname === '/api/agent/state') {
      const id = url.searchParams.get('session_id') || '';
      if (!sessions.has(id)) return send(res, 404, { error: 'unknown session' });
      const s = sessions.get(id);
      return send(res, 200, { turns: s.turn, ...(await s.backend.state()) });
    }
    if (url.pathname === '/api/agent') {
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
      return await handleAgent(req, res);
    }
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'internal_error' });
  }
});

// Real providers only: clause index from the live policy page (saleor) or the two mock clauses, then the system prompt.
async function buildPrompt() {
  const { index, count } = BACKEND === 'saleor'
    ? buildClauseIndex(await require('../assistant/saleor').getPolicyText())
    : mockClauseIndex();
  if (!count) throw new Error('the policy page has no clause lines like "3.1 text": clause index is empty');
  systemPrompt = buildSystemPrompt(index);
  console.log(`agent prompt: ${PROMPT_VERSION}, clause index ${count} clauses, system prompt ${systemPrompt.length} chars`);
  if (process.env.AGENT_PRINT_PROMPT === '1') console.log(`----- system prompt -----\n${systemPrompt}\n-------------------------`);
}

async function start() {
  await initBackend();
  if (PROVIDER !== 'stub') {
    await buildPrompt();
    if (provider.check) await provider.check();
  }
}

start()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`agent listening on http://localhost:${PORT} (provider=${provider.name} model=${provider.model || 'none'} backend=${BACKEND})`);
    });
  })
  .catch((e) => {
    console.error(`agent (provider=${PROVIDER} backend=${BACKEND}) failed to start:`, e.message);
    process.exit(1);
  });

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    if (db) await db.closePool().catch(() => {});
    process.exit(0);
  });
}
