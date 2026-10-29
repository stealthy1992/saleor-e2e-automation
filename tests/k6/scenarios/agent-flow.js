// tests/k6/scenarios/agent-flow.js
//
// Load-tests the Ops Agent's POST /api/agent against the STUB provider and the MOCK
// backend (AGENT_PROVIDER=stub, AGENT_BACKEND=mock). Each iteration is a short
// conversation with its own session_id, cycling through three flows:
//   policy  : 1 message, 1 read tool call
//   order   : 1 message, get_order on a mock order
//   refund  : 2 messages (pending, then "yes"), then one /api/agent/state check
//
// The stub never calls Gemini and the mock backend never calls Saleor, so this scenario
// cannot burn quota or touch real data. setup() refuses to run unless /health reports
// provider "stub" and backend "mock".
//
// Needs the trace in replies (default; do not start the agent with AGENT_EXPOSE_TRACE=0).
//
// Run (terminal 1, in the Saleor repo):
//   npm run agent
// Run (terminal 2):
//   k6 run tests/k6/scenarios/agent-flow.js -e AGENT_URL=http://localhost:3200

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { buildSummary } from '../lib/report.js';

const REFUND = 'I want a refund for order 1002, email sara.k@example.com. The jeans arrived damaged.';

const replyValid = new Counter('agent_reply_valid');
const replyInvalid = new Counter('agent_reply_invalid');
const modelCalls = new Trend('agent_model_calls');

export const options = {
  scenarios: {
    agent_flow: {
      executor: 'ramping-vus',
      exec: 'agentFlow',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 5 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    // Scoped to name:agent so setup() and the state checks never count.
    'http_req_duration{name:agent}': ['p(95)<600'],
    'http_req_failed{name:agent}': ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  const baseUrl = __ENV.AGENT_URL || 'http://localhost:3200';
  const res = http.get(`${baseUrl}/health`, { tags: { name: 'agent-setup' } });
  if (res.status !== 200) {
    throw new Error(`Agent /health returned ${res.status}. Is the agent running?`);
  }
  const provider = res.json('provider');
  const backend = res.json('backend');
  if (provider !== 'stub' || backend !== 'mock') {
    throw new Error(`Agent runs provider "${provider}" with backend "${backend}", not stub/mock. Refusing to load-test it.`);
  }
  return { baseUrl };
}

function say(baseUrl, sessionId, message) {
  const res = http.post(
    `${baseUrl}/api/agent`,
    JSON.stringify({ session_id: sessionId, message }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'agent' } }
  );
  let body = null;
  try {
    body = res.json();
  } catch (e) {
    body = null;
  }
  if (body && typeof body.model_calls === 'number') modelCalls.add(body.model_calls);
  return { res, body };
}

const shapeOk = (res, body) =>
  check(res, {
    'status is 200': (r) => r.status === 200,
    'reply is a non-empty string': () => !!body && typeof body.reply === 'string' && body.reply.length > 0,
    'model_calls is a positive integer': () => !!body && Number.isInteger(body.model_calls) && body.model_calls >= 1,
    'not truncated': () => !!body && body.truncated === false,
  });

const toolsOf = (body) => (body && Array.isArray(body.trace) ? body.trace.map((t) => t.tool) : []);

function policyFlow(baseUrl, sid) {
  const { res, body } = say(baseUrl, sid, 'How long does delivery take to Lahore?');
  const a = shapeOk(res, body);
  const b = check(res, {
    'policy: called get_policy_clause once': () => toolsOf(body).join() === 'get_policy_clause',
  });
  return a && b;
}

function orderFlow(baseUrl, sid) {
  const { res, body } = say(baseUrl, sid, 'What is the status of order 1001? My email is amir.jee@example.com');
  const a = shapeOk(res, body);
  const b = check(res, {
    'order: called get_order once': () => toolsOf(body).join() === 'get_order',
    'order: order was found': () => !!body && body.trace[0].result.found === true,
  });
  return a && b;
}

function refundFlow(baseUrl, sid) {
  const first = say(baseUrl, sid, REFUND);
  const a = shapeOk(first.res, first.body);
  const b = check(first.res, {
    'refund: first message is pending_confirmation': () =>
      !!first.body && first.body.trace.length === 1 && first.body.trace[0].result.status === 'pending_confirmation',
  });
  const second = say(baseUrl, sid, 'Yes, please go ahead.');
  const c = shapeOk(second.res, second.body);
  const d = check(second.res, {
    'refund: second message is recorded': () =>
      !!second.body && second.body.trace.length === 1 && second.body.trace[0].result.status === 'recorded',
  });
  const st = http.get(`${baseUrl}/api/agent/state?session_id=${sid}`, { tags: { name: 'agent-state' } });
  const e = check(st, {
    'refund: exactly one action recorded': (r) => r.status === 200 && r.json('actions').length === 1,
  });
  return a && b && c && d && e;
}

const FLOWS = [policyFlow, orderFlow, refundFlow];

export function agentFlow(data) {
  const sid = `k6-${__VU}-${__ITER}`;
  const flow = FLOWS[(__VU + __ITER) % FLOWS.length];
  if (flow(data.baseUrl, sid)) {
    replyValid.add(1);
  } else {
    replyInvalid.add(1);
  }
  sleep(1);
}

export function handleSummary(data) {
  return buildSummary(data, 'agent-flow');
}