const { test: authTest } = require('./auth');
const { request: pwRequest } = require('@playwright/test'); // the request *module*, not the fixture
const { graphqlRequest } = require('../utils/graphql-client');

exports.test = authTest.extend({
    // A bare shell promotion — no rules yet. The test itself adds a rule via
    // the UI (that's the thing actually under test: the variant-search
    // dropdown inside the "Add rule" dialog). Created via mutation, not UI,
    // for speed and isolation — same pattern as every other fixture in this
    // project (checkout, customer, product all create their base object via
    // GraphQL, reserving UI actions for whatever the test is actually about).
    testPromotion: [
        async ({ staffToken }, use) => {
            const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });

            const mutation = `
                mutation CreatePromotion($input: PromotionCreateInput!) {
                    promotionCreate(input: $input) {
                        promotion { id name }
                        errors { field message code }
                    }
                }
            `;
            const variables = {
                input: {
                    name: `SCRUM-32 pagination test ${Date.now()}`,
                    type: "CATALOGUE",
                    startDate: new Date().toISOString(),
                },
            };

            const { data } = await graphqlRequest(ctx, mutation, variables, staffToken);
            if (data.promotionCreate.errors.length) {
                throw new Error(`testPromotion fixture failed: ${JSON.stringify(data.promotionCreate.errors)}`);
            }
            const promotion = data.promotionCreate.promotion;

            await use(promotion);

            // promotionDelete cascades and removes any rules the test added
            // via the UI along the way — no separate rule cleanup needed.
            const { data: deleteData } = await graphqlRequest(
                ctx,
                `mutation DeletePromotion($id: ID!) { promotionDelete(id: $id) { errors { field message code } } }`,
                { id: promotion.id },
                staffToken
            );
            if (deleteData.promotionDelete.errors.length) {
                console.error(
                    `testPromotion fixture teardown: promotionDelete failed for ${promotion.id}: ` +
                    JSON.stringify(deleteData.promotionDelete.errors)
                );
            }

            await ctx.dispose();
        },
        { scope: 'worker' },
    ],
});
exports.expect = authTest.expect;