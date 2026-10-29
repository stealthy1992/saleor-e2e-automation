'use strict';
const http = require('http');
const crypto = require('crypto');
const { createSession, runTurn } = require('./loop');
const { createMockTools } = require('./mock-tools');
const { createStub } = require('./providers/stub');

const PORT = Number(process.env.AGENT_PORT || 3200);
const PROVIDER = (process.env.AGENT_PROVIDER || 'stub').toLowerCase();
const BACKEND = (process.env.AGENT_BACKEND || 'mock').toLowerCase();
const EXPOSE_TRACE = process.env.AGENT_EXPOSE_TRACE !== '0';
const MAX_BODY = 10 * 1024;
const MAX_MESSAGE = 1000;
const MAX_SESSIONS = 200;
const SESSION_ID = /^[A-Za-z0-9_-]{1,64}$/;

// P1 supports only the stub provider and the mock backend (real Gemini and Saleor come in P2).
if (PROVIDER !== 'stub') throw new Error(`AGENT_PROVIDER "${PROVIDER}" is not available yet (P1: stub only)`);
if (BACKEND !== 'mock') throw new Error(`AGENT_BACKEND "${BACKEND}" is not available yet (P1: mock only)`);

const provider = createStub();
const sessions = new Map();

function getSession(id) {
  if (!sessions.has(id)) {
    if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
    sessions.set(id, createSession(createMockTools()));
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
    const r = await runTurn(getSession(sessionId), provider, message);
    console.log(`agent ok: provider=${provider.name} calls=${r.trace.length} model_calls=${r.modelCalls} ${Date.now() - started}ms`);
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
      return send(res, 200, { status: 'ok', provider: provider.name, backend: BACKEND });
    }
    // Test hook: final state of a mock session (recorded refund actions, pending count, turns).
    if (req.method === 'GET' && url.pathname === '/api/agent/state') {
      const id = url.searchParams.get('session_id') || '';
      if (!sessions.has(id)) return send(res, 404, { error: 'unknown session' });
      const s = sessions.get(id);
      return send(res, 200, { turns: s.turn, ...s.backend.state() });
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

server.listen(PORT, () => {
  console.log(`agent listening on http://localhost:${PORT} (provider=${provider.name} backend=${BACKEND})`);
});