const { test, expect } = require('@playwright/test');
const { graphqlRequest } = require('../../utils/graphql-client');

// Smoke test: confirms the whole pipeline works end to end before building
// out anything more complex (auth, mutations, DB assertions) on top of it.
test.describe('Shop query - smoke test', () => {
  test('returns shop name and domain', async ({ request }) => {
    const query = `
      query {
        shop {
          name
          domain {
            host
          }
        }
      }
    `;

    const { response, data } = await graphqlRequest(request, query);

    expect(response.status()).toBe(200);
    expect(data.shop.name).toBeTruthy();
    expect(data.shop.domain.host).toContain('solception.com');
  });
});