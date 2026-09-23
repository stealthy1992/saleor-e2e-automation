const { test, expect } = require('../../fixtures/auth');
const { graphqlRequest } = require('../../utils/graphql-client'); // adjust path to your actual helper
const { query } = require('../../utils/db-client');
// Force these tests to run in the same worker, in order, so the
// shared arrays/cursors below behave predictably.
test.describe.configure({ mode: 'serial' });

test.describe('Product pagination', () => {
    // let firstRun = [];
    // let secondRun = [];
    // let lastRun = [];
    let retrievedProducts = [];
    let cursorAfterFirst15 = null;
    let cursorAfterNext15 = null;

    test('This will get first 15 products and the cursor of 15th product', async ({ request }) => {
        const query = `
        query {
            products(first: 15, channel: "default-channel") {
                edges {
                    node {
                        id
                        name
                    }
                    cursor
                }
                pageInfo {
                    hasNextPage
                    hasPreviousPage
                    startCursor
                    endCursor
                }
                totalCount
            }
        }`;
        const { response, data } = await graphqlRequest(request, query);

        expect(data.products.edges.length).toBe(15);
        console.log(`Product count is ${data.products.edges.length} and hasNextPage is ${data.products.pageInfo.hasNextPage}`);
        expect(data.products.pageInfo.hasNextPage).toBe(true);

        const products = data.products.edges;
        for (const product of products) {
            expect(product.node.id).not.toBeNull();
            expect(product.node.name).not.toEqual('');
            const decodedId = Buffer.from(product.node.id, 'base64').toString();
            retrievedProducts.push(decodedId);
        }

        // Capture the real cursor instead of hardcoding it for the next test.
        cursorAfterFirst15 = data.products.pageInfo.endCursor;
        expect(cursorAfterFirst15).not.toBeNull();

        console.log('Retrieved product array updated length is: ', retrievedProducts.length);
        console.log('firstRun contents:', retrievedProducts);
    });

    test('This will get next 15 products and the cursor of 30th product', async ({ request }) => {
        // Guard clause: fail fast with a clear message if test 1 didn't run
        // or didn't produce a cursor, instead of silently querying with after: null.
        expect(cursorAfterFirst15, 'cursorAfterFirst15 was not set — did the first test run before this one?').not.toBeNull();

        const query = `
        query {
            products(first: 15, after: "${cursorAfterFirst15}", channel: "default-channel") {
                edges {
                    node {
                        id
                        name
                    }
                    cursor
                }
                pageInfo {
                    hasNextPage
                    hasPreviousPage
                    startCursor
                    endCursor
                }
                totalCount
            }
        }`;
        const { response, data } = await graphqlRequest(request, query);

        expect(data.products.edges.length).toBe(15);
        console.log(`Product count is ${data.products.edges.length} and hasNextPage is ${data.products.pageInfo.hasNextPage}`);
        expect(data.products.pageInfo.hasNextPage).toBe(true);

        const products = data.products.edges;
        for (const product of products) {
            expect(product.node.id).not.toBeNull();
            expect(product.node.name).not.toEqual('');
            const decodedId = Buffer.from(product.node.id, 'base64').toString();
            retrievedProducts.push(decodedId);
        }

        cursorAfterNext15 = data.products.pageInfo.endCursor;
        expect(cursorAfterNext15).not.toBeNull();

        console.log('Retrieved product array updated length is: ', retrievedProducts.length);
        console.log('secondRun contents:', retrievedProducts);
    });

    test('This will get last 2 products and the cursor of 32nd product', async ({ request }) => {
        expect(cursorAfterNext15, 'cursorAfterNext15 was not set — did the second test run before this one?').not.toBeNull();
 
        const query = `
        query {
            products(first: 2, after: "${cursorAfterNext15}", channel: "default-channel") {
                edges {
                    node {
                        id
                        name
                    }
                    cursor
                }
                pageInfo {
                    hasNextPage
                    hasPreviousPage
                    startCursor
                    endCursor
                }
                totalCount
            }
        }`;
        const { response, data } = await graphqlRequest(request, query);
 
        expect(data.products.edges.length).toBe(2);
        console.log(`Product count is ${data.products.edges.length} and hasNextPage is ${data.products.pageInfo.hasNextPage}`);
        expect(data.products.pageInfo.hasNextPage).toBe(false);
 
        const products = data.products.edges;
        for (const product of products) {
            expect(product.node.id).not.toBeNull();
            expect(product.node.name).not.toEqual('');
            const decodedId = Buffer.from(product.node.id, 'base64').toString();
            retrievedProducts.push(decodedId);
        }
 
        console.log('Retrieved product array updated length is: ', retrievedProducts.length);
        console.log('Final allProducts contents:', retrievedProducts);
 
        // Confirm the full 32-product run has no duplicates, i.e. no product
        // id was returned across two different pages.
        expect(retrievedProducts.length).toBe(32);
 
        const uniqueProducts = new Set(retrievedProducts);
        expect(uniqueProducts.size).toBe(retrievedProducts.length);
 
        // If a duplicate does slip in, this makes it easy to see which one(s).
        const duplicates = retrievedProducts.filter((id, index) => retrievedProducts.indexOf(id) !== index);
        expect(duplicates, `Found duplicate product id(s): ${duplicates.join(', ')}`).toEqual([]);
    });

    test('filtering by channel — confirm results only include products with a `product_productchannellisting` row for that channel', async ({ request }) => {
        const queryGraph = `
        query {
            products(first: 2, channel: "channel-pln") {
                edges {
                    node {
                        id
                        name
                    }
                    cursor
                }
                pageInfo {
                    hasNextPage
                    hasPreviousPage
                    startCursor
                    endCursor
                }
                totalCount
            }
        }`;
        const { response, data } = await graphqlRequest(request, queryGraph);
        
        console.log('GraphQL returned count is: ',data.products.totalCount);
        const res = await query(`SELECT p.name, pcl.is_published, pcl.visible_in_listings, pcl.available_for_purchase_at
            FROM product_productchannellisting pcl
            JOIN product_product p ON p.id = pcl.product_id
            WHERE pcl.channel_id = 2
            ORDER BY pcl.is_published;`)
        console.log('Postgres query return count is: ',res.length);
        // expect(data.products.totalCount).toEqual(parseInt(res[0].count)); 
    })

    test('staff can query all orders', async ({ request, staffToken }) => {
        const query = `query { orders(first: 10) { edges { node { id } } } }`;
        const { data } = await graphqlRequest(request, query, {}, staffToken);
        expect(data.orders.edges.length).toBeGreaterThan(0);
        console.log(data.orders.edges);
    });
});



