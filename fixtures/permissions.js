
const { test: baseTest, expect } = require('../fixtures/customer'); // full chain: auth -> product -> customer
const { request: pwRequest } = require('@playwright/test');
const { graphqlRequest } = require('../../utils/graphql-client');

const test = baseTest.extend({
    staffToken: [
        async ({ }, use) => {
            const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });
            const mutation = `
        mutation TokenCreate($email: String!, $password: String!) {
          tokenCreate(email: $email, password: $password) {
            token
            errors { field message code }
          }
        }
      `;
            const { data } = await graphqlRequest(ctx, mutation, {
                email: process.env.LIMITED_ACCESS_USER_EMAIL,
                password: process.env.LIMITED_ACCESS_USER_PASSWORD, // whatever you set it to
            });
            if (data.tokenCreate.errors.length) {
                throw new Error(`limited staffToken override failed: ${JSON.stringify(data.tokenCreate.errors)}`);
            }
            await use(data.tokenCreate.token);
            await ctx.dispose();
        },
        { scope: 'worker' },
    ],
});

exports.test = test;
exports.expect = expect;