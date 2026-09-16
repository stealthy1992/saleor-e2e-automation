const { test: authTest } = require('./auth');
const { request: pwRequest } = require('@playwright/test'); // the request *module*, not the fixture
const { graphqlRequest } = require('../utils/graphql-client');

exports.test = authTest.extend({

    testProduct: [
        async ({ staffToken }, use) => {
            const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });
            const query = `
        mutation CreateProduct($input: ProductCreateInput!) {
                productCreate(input: $input) {
                    product { id name slug description }
                    errors { field message }
                }
        }
      `
            const variables = {
                input: {
                    name: 'Extra-slim Jeans',
                    productType: 'UHJvZHVjdFR5cGU6MQ==',
                    category: 'Q2F0ZWdvcnk6Mjc=',
                    description: JSON.stringify({
                        time: Date.now(),
                        blocks: [
                            {
                                id: 'test99',
                                type: 'paragraph',
                                data: { text: 'Comfy slim jeans for men and women' },
                            },
                        ],
                        version: '2.22.2',
                    }),
                    chargeTaxes: true,
                },
            };

            const { data } = await graphqlRequest(ctx, query, variables, staffToken);
            if (data.productCreate.errors.length) {
                throw new Error(`testProduct fixture failed: ${JSON.stringify(data.productCreate.errors)}`);
            }
            const product = data.productCreate.product; // extract, don't pass the raw envelope

            await use(product);

            try {
                const { data: deleteData } = await graphqlRequest(
                    ctx,
                    `mutation DeleteProduct($id: ID!) { productDelete(id: $id) { errors { field message } } }`,
                    { id: product.id },
                    staffToken
                );
                if (deleteData.productDelete.errors.length) {
                    console.error(`testProduct fixture teardown: productDelete failed for ${product.id}: ${JSON.stringify(deleteData.productDelete.errors)}`);
                }
            } catch (err) {
                console.log(`testProduct fixture teardown: productDelete threw (likely already deleted by Section D) for ${product.id}: ${err.message}`);
            }

            await ctx.dispose();
        },
        { scope: 'worker' }
    ],
    productChannel: [
        async ({ testProduct, staffToken }, use) => {
            const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });
            const query = `
            mutation ProductChannelListingUpdate($id: ID!, $input: ProductChannelListingUpdateInput!) {
                productChannelListingUpdate(id: $id, input: $input) {
                    product {
                        id
                        name
                        channelListings {
                            channel { id slug }
                            isPublished
                            visibleInListings
                        }
                    }
                    errors { field message code }
                }
            }
        `

            const variables = {
                id: testProduct.id,
                input: {
                    updateChannels: [
                        {
                            channelId: "Q2hhbm5lbDox",
                            isPublished: true,
                            visibleInListings: true,
                            availableForPurchaseAt: new Date().toISOString(),
                            isAvailableForPurchase: true
                        },
                        {
                            channelId: "Q2hhbm5lbDoy",
                            isPublished: true,
                            visibleInListings: true,
                            availableForPurchaseAt: new Date().toISOString(),
                            isAvailableForPurchase: true
                        }
                    ],
                },
            };

            const { data } = await graphqlRequest(ctx, query, variables, staffToken);
            if (data.productChannelListingUpdate.errors.length) {
                throw new Error(`testProduct fixture failed: ${JSON.stringify(data.productChannelListingUpdate.errors)}`);
            }
            await use(data.productChannelListingUpdate.product);
            await ctx.dispose();
        },
        { scope: 'worker' }
    ],
    productVariant: [
        async ({ staffToken, productChannel }, use) => {

            const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });
            const query =
                `
            mutation ProductVariantCreate($input: ProductVariantCreateInput!) {
                productVariantCreate(input: $input) {
                    productVariant {
                        id
                        name
                        sku
                    }
                    errors { field message code }
                }
            }
        `

            const variables = {
                input: {
                    product: productChannel.id,
                    sku: "extra-colored-skinny jeans",
                    attributes: [],
                },
            }

            const { response, data } = await graphqlRequest(ctx, query, variables, staffToken);
            if (data.productVariantCreate.errors.length) {
                throw new Error(`testProduct fixture failed: ${JSON.stringify(data.productVariantCreate.errors)}`);
            }
            await use(data.productVariantCreate.productVariant);
            await ctx.dispose();
        },
        { scope: 'worker' }
    ],
    productWithPrice: [
        async ({ staffToken, productVariant }, use) => {
            const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });
            const mutation =
                `
            mutation ProductVariantChannelListingUpdate($id: ID!, $input: [ProductVariantChannelListingAddInput!]!) {
                productVariantChannelListingUpdate(id: $id, input: $input) {
                    variant { id name }
                    errors { field message code }
                }
            }
        `

            const variables = {
                id: productVariant.id,
                input: [
                    {
                        channelId: "Q2hhbm5lbDox",
                        price: 35.00,
                        costPrice: 35.00,
                        priorPrice: 35.00

                    }
                ]
            }

            const { data } = await graphqlRequest(ctx, mutation, variables, staffToken);
            if (data.productVariantChannelListingUpdate.errors.length) {
                throw new Error(`testProduct fixture failed: ${JSON.stringify(data.productVariantChannelListingUpdate.errors)}`);
            }

            // pricing is channel-scoped and does NOT reliably resolve on the
            // mutation's own response payload — a variant can have multiple
            // channel listings, so Saleor needs an explicit channel argument
            // on a fresh query to know which one to compute pricing against.
            const priceQuery = `
                query GetVariantPrice($id: ID!, $channel: String!) {
                    productVariant(id: $id, channel: $channel) {
                        id
                        name
                        pricing { price { gross { amount } } }
                    }
                }
            `;
            const { data: priceData } = await graphqlRequest(ctx, priceQuery, {
                id: data.productVariantChannelListingUpdate.variant.id,
                channel: "default-channel"
            }, staffToken);

            await use(priceData.productVariant);
            await ctx.dispose();
        },
        { scope: 'worker' }
    ],
    productVariantWithStock: [
        async ({ staffToken, productWithPrice }, use) => {
            const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });
            const query = `
            mutation ProductVariantStocksCreate($variantId: ID!, $stocks: [StockInput!]!) {
                productVariantStocksCreate(variantId: $variantId, stocks: $stocks) {
                    productVariant { id stocks { quantity warehouse { id name } } }
                    errors { field message code }
                }
            }
        `

            const variables = {
                variantId: productWithPrice.id,
                stocks: [
                    { warehouse: "V2FyZWhvdXNlOjQyNDJlOTBiLTIxNTktNDYyZS1iNmIyLTU3NzdhMmQ1NTJjMg==", quantity: 100 }
                ]
            };

            const { response, data } = await graphqlRequest(ctx, query, variables, staffToken);
            if (data.productVariantStocksCreate.errors.length) {
                throw new Error(`testProduct fixture failed: ${JSON.stringify(data.productVariantStocksCreate.errors)}`);
            }
            await use(data.productVariantStocksCreate.productVariant);
            await ctx.dispose();

        },
        { scope: 'worker' }
    ],

});
exports.expect = authTest.expect;