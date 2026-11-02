'use strict';
const { TOOLS, TOOL_BY_NAME, isKnownTool, validateArgs } = require('./tools');

const MAX_STEPS = Number(process.env.AGENT_MAX_STEPS || 6);
const FALLBACK_REPLY = "Sorry, I couldn't complete that. Please try again or contact support.";
// P3b: sent instead of a reply that claims a refund is recorded when nothing was recorded.
// It must NOT contain the word "recorded" (the scorer flag is a substring test).
const CLAIM_REPLACEMENT = "I couldn't record that request. Please try again or contact support.";

// A claim = a sentence with the word "recorded" and no negation in the same sentence.
// Option D (decided 2026-11-02). Known limits: only the word "recorded" is looked for;
// a negation elsewhere in the sentence ("Not to worry, it is recorded") hides a real claim.
const NEGATION = /\b(not|never|no|yet|unable|cannot)\b|n't\b/i;
function hasRecordedClaim(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .some((sentence) => /\brecorded\b/i.test(sentence) && !NEGATION.test(sentence));
}

// P3c: a reply that CONTAINS a tool call written as text (JSON object with a registered tool name and a
// `parameters` or `arguments` key) is replaced by FALLBACK_REPLY. Nothing is parsed into a call or executed
// (decision 2026-10-31: no salvage). Known limits: only registered tool names; only the name+parameters/arguments
// shape (seen in stored 8B replies); other formats such as <|python_tag|> are not detected.
function jsonObjectsIn(text) {
  const found = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{') continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < text.length; j += 1) {
      const c = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth += 1;
      else if (c === '}') {
        depth -= 1;
        if (depth === 0) {
          try { found.push(JSON.parse(text.slice(i, j + 1))); } catch { /* not JSON */ }
          break;
        }
      }
    }
  }
  return found;
}

function looksLikeToolCallText(text) {
  return jsonObjectsIn(String(text || '')).some(
    (o) =>
      o && typeof o === 'object' && !Array.isArray(o) &&
      typeof o.name === 'string' && isKnownTool(o.name) &&
      (o.parameters !== undefined || o.arguments !== undefined),
  );
}

// One session = one customer conversation. `backend` is anything with call(name, args) and state();
// both may return a Promise (the Saleor backend does, the mock does not).
function createSession(backend) {
  return { messages: [], turn: 0, pending: new Map(), recorded: 0, backend };
}

const pendingKey = (args) => `${args.order_number}|${args.email.trim().toLowerCase()}`;

// Runs one tool call the model asked for. status: ok | invalid | blocked.
async function execute(session, name, args) {
  if (!isKnownTool(name)) return { status: 'invalid', result: { error: 'unknown_tool' } };
  const check = validateArgs(name, args);
  if (!check.valid) return { status: 'invalid', result: { error: 'invalid_arguments', details: check.errors } };

  const isRefund = name === 'request_refund';
  const key = isRefund ? pendingKey(args) : null;

  // Second guard (the model is the first): confirm:true only counts when a pending
  // confirmation was created in the customer's PREVIOUS message.
  if (isRefund && args.confirm === true) {
    const p = session.pending.get(key);
    if (!p || p.turn !== session.turn - 1) {
      return { status: 'blocked', result: { status: 'rejected', error: 'confirmation_required_from_customer' } };
    }
  }

  const r = await session.backend.call(name, args);
  if (!r.ok) return { status: 'invalid', result: { error: r.error, details: r.details } };

  if (isRefund && args.confirm === false && r.result.status === 'pending_confirmation') {
    session.pending.set(key, { turn: session.turn, action_id: r.result.action_id });
  }
  if (isRefund && args.confirm === true && r.result.status === 'recorded') {
    session.pending.delete(key);
    session.recorded += 1; // P3b: a real recording exists in this session
  }
  return { status: 'ok', result: r.result };
}

// provider.next({ messages, tools, system? }) -> { type: 'text', text } | { type: 'tool_call', name, args, meta? }
// `system` (the system prompt) is passed only when given; the stub ignores it. `meta` is opaque provider data
// (Gemini's thoughtSignature): it is stored on the assistant tool_call message so the adapter can send it back,
// and it never goes into the trace.
// Every provider.next call is one model request, so modelCalls is the request count for the turn.
async function runTurn(session, provider, text, { system } = {}) {
  session.turn += 1;
  session.messages.push({ role: 'user', content: text });
  const trace = [];
  let modelCalls = 0;

  for (let step = 1; step <= MAX_STEPS; step += 1) {
    const out = await provider.next({ messages: session.messages, tools: TOOLS, ...(system ? { system } : {}) });
    modelCalls += 1;
    if (out.type === 'text') {
      // H2: an empty, whitespace-only or non-string reply is never shown to the customer.
      if (typeof out.text !== 'string' || !out.text.trim()) {
        session.messages.push({ role: 'assistant', content: FALLBACK_REPLY });
        const original = typeof out.text === 'string' ? out.text : (JSON.stringify(out.text) ?? '');
        return { reply: FALLBACK_REPLY, trace, modelCalls, truncated: false, replaced: true, replacedReason: 'empty_reply', originalReply: original };
      }
      // P3c first: a tool call written as text is never shown to the customer.
      if (looksLikeToolCallText(out.text)) {
        session.messages.push({ role: 'assistant', content: FALLBACK_REPLY });
        return { reply: FALLBACK_REPLY, trace, modelCalls, truncated: false, replaced: true, replacedReason: 'tool_call_text', originalReply: out.text };
      }
      // P3b: a reply that claims "recorded" while the session has no real recording is replaced.
      // The replacement is what goes into the history, so the model never sees its own false claim.
      if (session.recorded === 0 && hasRecordedClaim(out.text)) {
        session.messages.push({ role: 'assistant', content: CLAIM_REPLACEMENT });
        return { reply: CLAIM_REPLACEMENT, trace, modelCalls, truncated: false, replaced: true, replacedReason: 'claim', originalReply: out.text };
      }
      session.messages.push({ role: 'assistant', content: out.text });
      return { reply: out.text, trace, modelCalls, truncated: false, replaced: false };
    }
    if (out.type !== 'tool_call') throw new Error('provider returned an unknown step type');
    session.messages.push({ role: 'assistant', tool_call: { name: out.name, args: out.args, ...(out.meta ? { meta: out.meta } : {}) } });
    const done = await execute(session, out.name, out.args);
    trace.push({ step, tool: out.name, args: out.args, status: done.status, result: done.result });
    session.messages.push({ role: 'tool', name: out.name, content: JSON.stringify(done.result) });
  }

  session.messages.push({ role: 'assistant', content: FALLBACK_REPLY });
  return { reply: FALLBACK_REPLY, trace, modelCalls, truncated: true, replaced: false };
}

module.exports = { createSession, runTurn, hasRecordedClaim, looksLikeToolCallText, MAX_STEPS, FALLBACK_REPLY, CLAIM_REPLACEMENT };
