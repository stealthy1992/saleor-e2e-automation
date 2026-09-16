const base = require('@playwright/test');
const { request: pwRequest } = require('@playwright/test'); // the request *module*, not the fixture
const { graphqlRequest } = require('../utils/graphql-client');

exports.test = base.test.extend({
  staffToken: [
    async ({ }, use) => {
      const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });
      const query = `
      mutation TokenCreate($email: String!, $password: String!) {
        tokenCreate(email: $email, password: $password) {
          token
          errors { field message code }
        }
      }
    `;

      let token = null;
      for (let attempt = 0; attempt < 5 && !token; attempt++) {
        const { data } = await graphqlRequest(ctx, query, {
          email: process.env.ADMIN_EMAIL,
          password: process.env.ADMIN_PASSWORD,
        });
        const err = data.tokenCreate.errors[0];
        if (data.tokenCreate.token) {
          token = data.tokenCreate.token;
        } else if (err?.code === 'LOGIN_ATTEMPT_DELAYED') {
          await new Promise((r) => setTimeout(r, 1200));
        } else {
          throw new Error(`staffToken fixture failed: ${err?.code} - ${err?.message}`);
        }
      }
      if (!token) throw new Error('staffToken fixture: exhausted retries');

      await use(token);
      await ctx.dispose();
    },
    { scope: 'worker' },
  ],
});
exports.expect = base.expect;