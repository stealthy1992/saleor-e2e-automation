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

    console.log(data);

    const expectedHost = new URL(process.env.SALEOR_API_URL).host; // 'localhost:8000' locally, your VPS host in prod
    expect(data.shop.domain.host).toBe(expectedHost);
  });

  test('This will create a token for admin authentication', async ({ request }) => {
    const query = `
      mutation TokenCreate($email: String!, $password: String!) {
        tokenCreate(email: $email, password: $password) {
          token
          errors {
            field
            message
          }
        }
      }
    `;

    const { data } = await graphqlRequest(request, query, {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    });

    // console.log(data);
  })
});