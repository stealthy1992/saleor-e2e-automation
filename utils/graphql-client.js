/**
 * Thin wrapper around Playwright's APIRequestContext for issuing GraphQL
 * requests against Saleor. No Apollo Client needed — Saleor's GraphQL
 * endpoint is a plain POST with a { query, variables } JSON body, so
 * Playwright's built-in request context handles it directly.
 */

/**
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} query - GraphQL query or mutation string
 * @param {object} [variables] - GraphQL variables
 * @param {string} [token] - optional Bearer token for authenticated requests
 */
async function graphqlRequest(request, query, variables = {}, token = null) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await request.post('/graphql/', {
    headers,
    data: { query, variables },
  });

  const body = await response.json();

  if (body.errors) {
    throw new Error(
      `GraphQL error(s): ${JSON.stringify(body.errors, null, 2)}`
    );
  }

  return { response, data: body.data };
}

module.exports = { graphqlRequest };