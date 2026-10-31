'use strict';
const { TOOLS, TOOL_BY_NAME, validateArgs } = require('./tools');

const MAX_STEPS = Number(process.env.AGENT_MAX_STEPS || 6);
const FALLBACK_REPLY = "Sorry, I couldn't complete that. Please try again or contact support.";

// One session = one customer conversation. `backend` is anything with call(name, args) and state();
// both may return a Promise (the Saleor backend does, the mock does not).
function createSession(backend) {
  return { messages: [], turn: 0, pending: new Map(), backend };
}

const pendingKey = (args) => `${args.order_number}|${args.email.trim().toLowerCase()}`;

// Runs one tool call the model asked for. status: ok | invalid | blocked.
async function execute(session, name, args) {
  if (!TOOL_BY_NAME[name]) return { status: 'invalid', result: { error: 'unknown_tool' } };
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
  if (isRefund && args.confirm === true && r.result.status === 'recorded') session.pending.delete(key);
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
      session.messages.push({ role: 'assistant', content: out.text });
      return { reply: out.text, trace, modelCalls, truncated: false };
    }
    if (out.type !== 'tool_call') throw new Error('provider returned an unknown step type');
    session.messages.push({ role: 'assistant', tool_call: { name: out.name, args: out.args, ...(out.meta ? { meta: out.meta } : {}) } });
    const done = await execute(session, out.name, out.args);
    trace.push({ step, tool: out.name, args: out.args, status: done.status, result: done.result });
    session.messages.push({ role: 'tool', name: out.name, content: JSON.stringify(done.result) });
  }

  session.messages.push({ role: 'assistant', content: FALLBACK_REPLY });
  return { reply: FALLBACK_REPLY, trace, modelCalls, truncated: true };
}

module.exports = { createSession, runTurn, MAX_STEPS, FALLBACK_REPLY };
