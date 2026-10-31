'use strict';

// Ollama adapter: neutral messages <-> POST {OLLAMA_URL}/api/chat with native tool calling.
// Provider object: { name, model, stats, next, check }. Every next() call is ONE HTTP request to Ollama.
// Written from the Ollama API as documented; the first live smoke verifies it against the real server.

const { TOOL_BY_NAME } = require('../tools');

// Decision 2026-10-31: llama3.1:8b sent confirm:"false" (a string). The intent was right, only the data type was wrong,
// so the adapter converts the exact strings "true"/"false" to booleans for fields the tool schema declares boolean.
// Nothing else is changed (other types, other strings, unknown tools stay as the model sent them and Ajv judges them).
function coerceBooleans(toolName, args) {
  const tool = TOOL_BY_NAME[toolName];
  if (!tool) return { args, count: 0 };
  const props = tool.parameters.properties || {};
  const out = { ...args };
  let count = 0;
  for (const [k, v] of Object.entries(out)) {
    if (props[k] && props[k].type === 'boolean' && typeof v === 'string') {
      const t = v.trim().toLowerCase();
      if (t === 'true' || t === 'false') { out[k] = t === 'true'; count += 1; }
    }
  }
  return { args: out, count };
}

const toOllamaTools = (tools) =>
  tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters }, // `kind` is ours, not sent
  }));

// Neutral {role:'user'|'assistant'|'tool', content, tool_call, name} -> Ollama messages.
function toOllamaMessages(messages, system) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'tool') out.push({ role: 'tool', tool_name: m.name, content: m.content });
    else if (m.role === 'assistant' && m.tool_call) {
      out.push({
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: m.tool_call.name, arguments: m.tool_call.args } }],
      });
    } else if (m.role === 'assistant') out.push({ role: 'assistant', content: m.content });
    else throw new Error(`ollama adapter: unknown message role "${m.role}"`);
  }
  return out;
}

function createOllama(opts = {}) {
  const baseUrl = (opts.baseUrl || process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
  const model = opts.model || 'llama3.1:8b';
  const temperature = opts.temperature ?? Number(process.env.LLM_TEMPERATURE || 0);
  const timeoutMs = opts.timeoutMs ?? Number(process.env.LLM_TIMEOUT_MS || 90000);
  const stats = { requests: 0, ignoredToolCalls: 0, coercions: 0 }; // coercions = string booleans converted

  // Fail fast at server start: Ollama reachable and the model pulled (GET /api/tags, no model run).
  async function check() {
    let res;
    try {
      res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    } catch (e) {
      throw new Error(`Ollama is not reachable at ${baseUrl} (${e.message}). Start Ollama first.`);
    }
    if (!res.ok) throw new Error(`Ollama /api/tags answered HTTP ${res.status}`);
    const body = await res.json();
    const names = (body.models || []).map((x) => x.name);
    const wanted = model.includes(':') ? model : `${model}:latest`;
    if (!names.includes(wanted)) throw new Error(`Ollama has no model "${model}". Installed: ${names.join(', ') || '(none)'}. Run: ollama pull ${model}`);
  }

  async function next({ messages, tools, system }) {
    stats.requests += 1;
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: toOllamaMessages(messages, system),
        tools: toOllamaTools(tools),
        options: { temperature },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    const msg = body.message || {};

    const calls = msg.tool_calls || [];
    if (calls.length) {
      if (calls.length > 1) stats.ignoredToolCalls += calls.length - 1; // the loop runs one call per step
      const fn = calls[0].function || {};
      let args = fn.arguments;
      if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch { throw new Error('ollama returned tool arguments that are not valid JSON'); }
      }
      if (!fn.name || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('ollama returned a malformed tool call');
      const fixed = coerceBooleans(fn.name, args);
      if (fixed.count) {
        stats.coercions += fixed.count;
        console.log(`agent llm: ollama sent a string for a boolean in ${fn.name}; converted (${fixed.count})`);
      }
      return { type: 'tool_call', name: fn.name, args: fixed.args };
    }
    if (typeof msg.content === 'string' && msg.content.trim()) return { type: 'text', text: msg.content.trim() };
    throw new Error('ollama returned neither text nor a tool call');
  }

  return { name: 'ollama', model, stats, next, check };
}

module.exports = { createOllama, toOllamaMessages, toOllamaTools, coerceBooleans };
