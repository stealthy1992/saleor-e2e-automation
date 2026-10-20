// tests/k6/scenarios/chat-flow.js
//
// Load-tests the support assistant's POST /api/chat against the STUB provider
// (LLM_PROVIDER=stub, optional STUB_LATENCY_MS). Policy questions only: order
// questions would trigger Saleor order lookups and are out of scope here.
//
// The stub never calls Gemini, so this scenario cannot burn the free-tier quota.
// setup() refuses to run unless /health reports provider "stub".
//
// Run (terminal 1, in the Saleor repo):
//   $env:LLM_PROVIDER='stub'; $env:STUB_LATENCY_MS='200'; npm run assistant
// Run (terminal 2):
//   k6 run tests/k6/scenarios/chat-flow.js -e ASSISTANT_URL=http://localhost:3100

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { buildSummary } from '../lib/report.js';

const LABELS = ['ANSWERABLE', 'NOT_COVERED', 'CONFLICT', 'AMBIGUOUS'];

// No order numbers here: the router would treat them as order lookups.
const QUESTIONS = [
  'How long does delivery take to Lahore?',
  'Do you deliver to Karachi?',
  'Can I return an opened item?',
  'What payment methods do you accept?',
  'Can I cancel before my parcel ships?',
  'Is there a charge for exchanges?',
];

const replyValid = new Counter('chat_reply_valid');
const replyInvalid = new Counter('chat_reply_invalid');

export const options = {
  scenarios: {
    chat_flow: {
      executor: 'ramping-vus',
      exec: 'chatFlow',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 5 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    // Scoped to name:'chat' so the one-time /health call in setup() never counts.
    'http_req_duration{name:chat}': ['p(95)<600'],
    'http_req_failed{name:chat}': ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  const baseUrl = __ENV.ASSISTANT_URL || 'http://localhost:3100';
  const res = http.get(`${baseUrl}/health`, { tags: { name: 'chat-setup' } });
  if (res.status !== 200) {
    throw new Error(`Assistant /health returned ${res.status}. Is the assistant running?`);
  }
  const provider = res.json('provider');
  if (provider !== 'stub') {
    throw new Error(`Assistant provider is "${provider}", not "stub". Refusing to load-test a real LLM.`);
  }
  return { baseUrl };
}

export function chatFlow(data) {
  const message = QUESTIONS[(__VU + __ITER) % QUESTIONS.length];

  const res = http.post(
    `${data.baseUrl}/api/chat`,
    JSON.stringify({ message }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'chat' },
    }
  );

  let body = null;
  try {
    body = res.json();
  } catch (e) {
    body = null;
  }

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'answer is a non-empty string': () => !!body && typeof body.answer === 'string' && body.answer.length > 0,
    'clauses is an array': () => !!body && Array.isArray(body.clauses),
    'label is one of the four': () => !!body && LABELS.indexOf(body.label) !== -1,
  });

  if (ok) {
    replyValid.add(1);
  } else {
    replyInvalid.add(1);
  }

  sleep(1);
}

export function handleSummary(data) {
  return buildSummary(data, 'chat-flow');
}