const { test, expect } = require('../../fixtures/auth');
const { graphqlRequest } = require('../../utils/graphql-client');
const { query, pool } = require('../../utils/db-client');

test.describe.serial('Product creation, update, and deletion module', () => {
    let productId;
    test('creating a product', async ({ request, staffToken }) => {
        const mutation = `
            mutation CreateProduct($input: ProductCreateInput!) {
                productCreate(input: $input) {
                    product { id name slug description }
                    errors { field message }
                }
            }
        `;

        const variables = {
            input: {
                name: 'Cool T-Shirt',
                productType: 'UHJvZHVjdFR5cGU6MjA=', // verify this is real first — see below
                category: 'Q2F0ZWdvcnk6Mzg=',        // same
                description: JSON.stringify({
                    time: Date.now(),
                    blocks: [
                        {
                            id: 'test1239',
                            type: 'paragraph',
                            data: { text: 'Excellent quality stylish shirt.' },
                        },
                    ],
                    version: '2.22.2',
                }),
                chargeTaxes: true,
            },
        };

        const { response, data } = await graphqlRequest(request, mutation, variables, staffToken);
        console.log('Created product is: ', data.productCreate.errors);
        productId = data.productCreate.product.id;
        console.log('Product ID is: ', productId)
        expect(response.ok()).toBeTruthy();
        expect(data.productCreate.errors).toEqual([]);
        expect(data.productCreate.product).not.toBeNull();
        expect(data.productCreate.product.name).toBe('Cool T-Shirt')
        expect(data.productCreate.product.slug).toBe('cool-t-shirt');

        const decodedId = Buffer.from(productId, 'base64').toString();
        console.log('Decode product ID is: \n', decodedId);
        const id = Number(decodedId.split(':')[1]);
        console.log('DB returned ID is: ', id)
        const result = await query('SELECT * FROM product_product WHERE id = $1 LIMIT 1', [id]);
        const descriptionObj = JSON.parse(data.productCreate.product.description);

        // Step 2: Traverse into blocks → first block → data → text
        const descriptionText = descriptionObj.blocks[0].data.text;

        // console.log(text);
        expect(result[0].name).toBe(data.productCreate.product.name);
        expect(result[0].slug).toBe(data.productCreate.product.slug);
        expect(result[0].description_plaintext).toBe(descriptionText);

    });

    test('Updating a product', async ({ request, staffToken }) => {
        // console.log('TOKEN IS: ',staffToken)
        const mutation = `
            mutation ProductUpdate($id: ID!, $input: ProductInput!) {
                productUpdate(id: $id, input: $input) {
                    product { id name slug }
                    errors { field message code }
                }
            }
        `;
        const variables = {
            id: productId,
            input: {
                name: "Updated Hot Shirt"
            }
        }

        const { response, data } = await graphqlRequest(request, mutation, variables, staffToken);
        expect(response.ok()).toBeTruthy();
        console.log('Updated product is: ', data);
        expect(data.productUpdate.product.name).toBe('Updated Hot Shirt')
        expect(data.productUpdate.errors).toEqual([]);
        expect(data.productUpdate.product).not.toBeNull();
        expect(data.productUpdate.product.slug).toBe('cool-t-shirt');

        const decodedId = Buffer.from(productId, 'base64').toString();
        console.log('Decode product ID is: \n', decodedId);
        const id = Number(decodedId.split(':')[1]);
        console.log('DB returned ID is: ', id)
        const result = await query('SELECT * FROM product_product WHERE id = $1 LIMIT 1', [id]);
        // const descriptionObj = JSON.parse(data.productUpdate.product.description);

        // Step 2: Traverse into blocks → first block → data → text
        // const descriptionText = descriptionObj.blocks[0].data.text;

        // console.log(text);
        expect(result[0].name).toBe(data.productUpdate.product.name);
        expect(result[0].slug).toBe(data.productUpdate.product.slug);
        // expect(result[0].description_plaintext).toBe(descriptionText);


    })

    test('assigning the product multiple sales channel', async ({ request, staffToken }) => {
        const mutation = `
            mutation ProductChannelListingUpdate($id: ID!, $input: ProductChannelListingUpdateInput!) {
                productChannelListingUpdate(id: $id, input: $input) {
                    product {
                        id
                        channelListings {
                            channel { slug }
                            isPublished
                            visibleInListings
                        }
                    }
                    errors { field message code }
                }
            }
        `

        const variables = {
            id: productId,
            input: {
                updateChannels: [
                    {
                        channelId: "Q2hhbm5lbDox",
                        isPublished: true,
                        visibleInListings: true,
                    },
                    {
                        channelId: "Q2hhbm5lbDoy",
                        isPublished: true,
                        visibleInListings: true,
                    }
                ],
            },
        };

        const { response, data } = await graphqlRequest(request, mutation, variables, staffToken);
        console.log(data.productChannelListingUpdate.product.channelListings);
    })

    test('removing this product from a sales channel', async ({ request, staffToken}) => {
        const mutation = `
            mutation ProductChannelListingUpdate($id: ID!, $input: ProductChannelListingUpdateInput!) {
                productChannelListingUpdate(id: $id, input: $input) {
                    product {
                        id
                        channelListings {
                            channel { slug }
                            isPublished
                            visibleInListings
                        }
                    }
                    errors { field message code }
                }
            }
        `

        const variables = {
            id: productId,
            input: {
                removeChannels: [
                  "Q2hhbm5lbDoy"
                ],
            },
        };

        const { response, data } = await graphqlRequest(request, mutation, variables, staffToken);
        console.log(data.productChannelListingUpdate.errors[0]);


    })

    test('Deleting a product', async ({ request, staffToken }) => {
        // cleanup — see note below on why this matters
        const { response, data } = await graphqlRequest(
            request,
            `mutation DeleteProduct($id: ID!) { productDelete(id: $id) { errors { field message } } }`,
            { id: productId },
            staffToken
        );
        expect(response.ok()).toBeTruthy();
        expect(data.productDelete.errors).toEqual([]);

        const decodedId = Buffer.from(productId, 'base64').toString();
        const id = Number(decodedId.split(':')[1]);
        // console.log('DB returned ID is: ', id)
        const result = await query('SELECT * FROM product_product WHERE id = $1 LIMIT 1', [id]);
        expect(result).toEqual([]);
        // expect(data.productDelete.errors).toEqual([]);

    })
})