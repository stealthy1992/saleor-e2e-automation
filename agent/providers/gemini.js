'use strict';

// Gemini adapter: neutral messages <-> generateContent with function calling.
// Gemini 3 returns a thoughtSignature on functionCall parts; it must be sent back unchanged in the same
// part, otherwise the API answers 400. The loop keeps it in tool_call.meta (never in the trace).
// Every HTTP request counts, including 429/503/504 and the retry (they count against the quota).

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const RETRY_STATUSES = [429, 503];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// JSON Schema -> Gemini Schema object: uppercase types; additionalProperties, pattern, minLength and
// maxLength are dropped (tools.js validates the arguments with Ajv afterwards).
const KEEP = new Set(['type', 'description', 'enum', 'properties', 'required', 'items', 'nullable']);
function toGeminiSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (!KEEP.has(k)) continue;
    if (k === 'type') out.type = String(v).toUpperCase();
    else if (k === 'properties') out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toGeminiSchema(pv)]));
    else if (k === 'items') out.items = toGeminiSchema(v);
    else out[k] = v;
  }
  return out;
}

const toGeminiTools = (tools) => [
  { functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters) })) },
];

// functionResponse.response must be an object: wrap anything else as {result: ...}.
function toResponseObject(content) {
  let v;
  try { v = JSON.parse(content); } catch { v = content; }
  return v && typeof v === 'object' && !Array.isArray(v) ? v : { result: v };
}

function toGeminiContents(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', parts: [{ text: m.content }] });
    else if (m.role === 'tool') out.push({ role: 'user', parts: [{ functionResponse: { name: m.name, response: toResponseObject(m.content) } }] });
    else if (m.role === 'assistant' && m.tool_call) {
      const part = { functionCall: { name: m.tool_call.name, args: m.tool_call.args } };
      const sig = m.tool_call.meta && m.tool_call.meta.thoughtSignature;
      if (sig) part.thoughtSignature = sig;
      out.push({ role: 'model', parts: [part] });
    } else if (m.role === 'assistant') out.push({ role: 'model', parts: [{ text: m.content }] });
    else throw new Error(`gemini adapter: unknown message role "${m.role}"`);
  }
  return out;
}

function createGemini(opts = {}) {
  const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set (.env or environment)');
  const model = opts.model || 'gemini-3.5-flash-lite';
  const baseUrl = (opts.baseUrl || BASE_URL).replace(/\/$/, '');
  const temperature = opts.temperature ?? Number(process.env.LLM_TEMPERATURE || 0);
  const timeoutMs = opts.timeoutMs ?? Number(process.env.LLM_TIMEOUT_MS || 90000);
  const retryDelayMs = opts.retryDelayMs ?? Number(process.env.LLM_RETRY_DELAY_MS ?? 2000);
  const stats = { requests: 0, retries: 0, ignoredToolCalls: 0 };

  async function next({ messages, tools, system }) {
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
    const payload = JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: toGeminiContents(messages),
      tools: toGeminiTools(tools),
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      generationConfig: { temperature },
    });
    const request = () => {
      stats.requests += 1;
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: payload,
        signal: AbortSignal.timeout(timeoutMs),
      });
    };

    let res = await request();
    if (RETRY_STATUSES.includes(res.status)) {
      await res.text();
      stats.retries += 1;
      console.log(`agent llm retry: gemini HTTP ${res.status}`);
      await sleep(retryDelayMs);
      res = await request();
    }
    if (!res.ok) throw new Error(`gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const body = await res.json();
    const cand = body.candidates && body.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    const calls = parts.filter((p) => p.functionCall);
    if (calls.length) {
      if (calls.length > 1) stats.ignoredToolCalls += calls.length - 1; // the loop runs one call per step
      const first = calls[0];
      const out = { type: 'tool_call', name: first.functionCall.name, args: first.functionCall.args || {} };
      if (first.thoughtSignature) out.meta = { thoughtSignature: first.thoughtSignature };
      return out;
    }
    const text = parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim();
    if (text) return { type: 'text', text };
    const why = (body.promptFeedback && body.promptFeedback.blockReason) || (cand && cand.finishReason) || 'no candidates';
    throw new Error(`gemini returned neither text nor a tool call (${why})`);
  }

  return { name: 'gemini', model, stats, next };
}

module.exports = { createGemini, toGeminiSchema, toGeminiTools, toGeminiContents, toResponseObject };
