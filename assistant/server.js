const http = require('http');
const { getPolicyText } = require('./saleor');
const { buildPrompt } = require('./prompt');
const llm = require('./llm');

const PORT = Number(process.env.ASSISTANT_PORT || 3100);
const POLICY_TTL_MS = Number(process.env.POLICY_TTL_MS || 60000);
const MAX_BODY = 10 * 1024;
const MAX_MESSAGE = 1000;

let policyCache = { text: null, at: 0 };

async function currentPolicy() {
  const now = Date.now();
  if (!policyCache.text || now - policyCache.at > POLICY_TTL_MS) {
    policyCache = { text: await getPolicyText(), at: now };
    console.log(`policy loaded: ${policyCache.text.split('\n').length} lines`);
  }
  return policyCache.text;
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) reject(Object.assign(new Error('payload too large'), { status: 413 }));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

async function handleChat(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (e) {
    return send(res, e.status || 400, { error: e.message });
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return send(res, 400, { error: 'body must be valid JSON' });
  }

  const message = input && typeof input.message === 'string' ? input.message.trim() : '';
  if (!message) return send(res, 400, { error: '"message" must be a non-empty string' });
  if (message.length > MAX_MESSAGE) {
    return send(res, 400, { error: `"message" must be at most ${MAX_MESSAGE} characters` });
  }

  const started = Date.now();

  let policy;
  try {
    policy = await currentPolicy();
  } catch (e) {
    console.error('policy error:', e.message);
    return send(res, 502, { error: 'policy_unavailable' });
  }

  let text;
  try {
    text = await llm.complete({ prompt: buildPrompt(policy, message), question: message });
  } catch (e) {
    console.error('llm error:', e.message);
    return send(res, 502, { error: 'llm_error' });
  }

  let reply;
  try {
    reply = llm.parseReply(text);
  } catch (e) {
    console.error('reply error:', e.message);
    return send(res, 502, { error: 'invalid_model_reply' });
  }

  console.log(`chat ok: ${llm.describe()} label=${reply.label} ${Date.now() - started}ms`);
  return send(res, 200, reply);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { status: 'ok', ...llm.info() });
    }
    if (url.pathname === '/api/chat') {
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
      return await handleChat(req, res);
    }
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'internal_error' });
  }
});

server.listen(PORT, () => {
  console.log(`assistant listening on http://localhost:${PORT} (${llm.describe()})`);
});