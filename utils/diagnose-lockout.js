// utils/diagnose-lockout-window.js
//
// STANDALONE — run with `node utils/diagnose-lockout-window.js`.
// Follow-up to diagnose-lockout.js. Two questions left open:
//   1. Is ONE prior request really enough to trigger it (not N failures)?
//   2. What's the precise window length, measured by polling rather than
//      trusting the embedded "suspended till" timestamp alone?

const { request } = require('@playwright/test');
const { graphqlRequest } = require('./graphql-client');

const BASE_URL = process.env.SALEOR_API_URL || 'https://saleor.solception.com';

const TOKEN_CREATE_QUERY = `
  mutation TokenCreate($email: String!, $password: String!) {
    tokenCreate(email: $email, password: $password) {
      token
      errors { field message code }
    }
  }
`;

async function attemptLogin(ctx, email, password) {
  const { data } = await graphqlRequest(ctx, TOKEN_CREATE_QUERY, { email, password });
  const err = data.tokenCreate.errors[0];
  return { message: err?.message ?? null, code: err?.code ?? null };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isSuspended = (msg) => !!msg && /suspend/i.test(msg);

(async () => {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  try {
    console.log('--- Test 1: does exactly ONE prior request trigger a block on the very next one? ---');
    const a1 = await attemptLogin(ctx, `single-a-${Date.now()}@test.com`, 'wrong');
    console.log('request 1:', a1.message, '| code:', a1.code);
    await sleep(50); // small gap, still well under the ~700-900ms window observed
    const a2 = await attemptLogin(ctx, `single-b-${Date.now()}@test.com`, 'wrong');
    console.log('request 2 (50ms later):', a2.message, '| code:', a2.code);
    console.log(
      isSuspended(a2.message)
        ? '=> Confirmed: a SINGLE prior request is enough to trigger it. This is a flat rate limit, not a failure-count threshold.'
        : '=> One prior request did NOT trigger it — threshold is likely 2+ requests in the window.'
    );

    console.log('\nWaiting 2s to clear any lingering window before Test 2...');
    await sleep(2000);

    console.log('--- Test 2: poll to find the real window length empirically ---');
    const trigger = await attemptLogin(ctx, `window-trigger-${Date.now()}@test.com`, 'wrong');
    const triggeredAt = Date.now();
    console.log('trigger request:', trigger.message);

    let elapsed = 0;
    let cleared = false;
    while (elapsed < 3000) {
      await sleep(100);
      elapsed = Date.now() - triggeredAt;
      const probe = await attemptLogin(ctx, `window-probe-${Date.now()}@test.com`, 'wrong');
      if (!isSuspended(probe.message)) {
        console.log(`=> Window cleared ~${elapsed}ms after the triggering request.`);
        cleared = true;
        break;
      }
    }
    if (!cleared) console.log('=> Still suspended after 3000ms — window is longer than expected, re-check.');
  } finally {
    await ctx.dispose();
  }
})();