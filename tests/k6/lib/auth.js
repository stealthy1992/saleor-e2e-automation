// tests/k6/lib/auth.js
//
// Authenticates once per k6 test run (called from setup(), not per-VU/
// per-iteration) and hands the token back to every VU. Tagged
// 'graphql-setup' so this one-time call never counts toward the load
// test's own p95/error-rate thresholds.

import { graphqlRequest } from './graphql.js';

const TOKEN_CREATE = `
  mutation TokenCreate($email: String!, $password: String!) {
    tokenCreate(email: $email, password: $password) {
      token
      errors { field message }
    }
  }
`;

export function authenticate(baseUrl) {
  const email = __ENV.SALEOR_ADMIN_EMAIL;
  const password = __ENV.SALEOR_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'SALEOR_ADMIN_EMAIL / SALEOR_ADMIN_PASSWORD not set — pass them with -e flags ' +
      'or from Jenkins withCredentials(), same as the Playwright stage.'
    );
  }

  const result = graphqlRequest(
    baseUrl,
    TOKEN_CREATE,
    { email, password },
    null,
    'tokenCreate',
    'tokenCreate',
    'graphql-setup'
  );

  const token = result.body?.data?.tokenCreate?.token;
  if (!result.succeeded || !token) {
    throw new Error(`Auth failed during k6 setup(): ${JSON.stringify(result.businessErrors || result.body)}`);
  }

  return token;
}
