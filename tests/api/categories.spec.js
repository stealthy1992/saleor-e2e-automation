const { test, expect } = require('../../fixtures/auth');
const { graphqlRequest } = require('../../utils/graphql-client');
const { query } = require('../../utils/db-client');

test.describe('Catalog listing and channel filtering', () => {
  test('lists categories and matches the seeded category table', async ({ request }) => {
    const queryText = `
      query {
        categories(first: 5) {
          totalCount
          edges {
            node {
              id
              name
              slug
            }
          }
        }
      }
    `;

    const { response, data } = await graphqlRequest(request, queryText);

    expect(response.status()).toBe(200);
    expect(data.categories.totalCount).toBeGreaterThan(0);
    expect(data.categories.edges.length).toBeGreaterThan(0);

    const dbRows = await query('SELECT COUNT(*) AS count FROM product_category');
    expect(data.categories.totalCount).toBe(parseInt(dbRows[0].count, 10));

    const apiNames = data.categories.edges.map(({ node }) => node.name);
    const categoryRows = await query('SELECT name FROM product_category ORDER BY id LIMIT 5');

    const dbNames = categoryRows.map((row) => row.name);
    console.log(dbNames);
    console.log(apiNames);
    expect(apiNames).toEqual(expect.arrayContaining(dbNames));
  });

  test('lists collections for a channel and matches the seeded collection data', async ({ request }) => {
    const queryText = `
      query ($channel: String!) {
        collections(first: 10, channel: $channel) {
          totalCount
          edges {
            node {
              id
              name
              slug
            }
          }
        }
      }
    `;

    const { response, data } = await graphqlRequest(request, queryText, {
      channel: 'default-channel',
    });

    expect(response.status()).toBe(200);
    expect(data.collections.totalCount).toBeGreaterThan(0);
    expect(data.collections.edges.length).toBeGreaterThan(0);

    const dbRows = await query(`
      SELECT c.id, c.name, c.slug
      FROM product_collection c
      JOIN product_collectionchannellisting cc ON cc.collection_id = c.id
      WHERE cc.channel_id = 1
      ORDER BY c.id
    `);

    expect(data.collections.totalCount).toBe(dbRows.length);
    const apiNames = data.collections.edges.map(({ node }) => node.name);
    const dbNames = dbRows.map((row) => row.name);
    expect(apiNames).toEqual(expect.arrayContaining(dbNames));
  });

  test('returns channels with the seeded default channel and currency codes', async ({ request, staffToken }) => {
    const queryText = `
      query {
        channels {
          id
          name
          slug
          currencyCode
        }
      }
    `;

    const { response, data } = await graphqlRequest(request, queryText, {}, staffToken);

    expect(response.status()).toBe(200);
    expect(data.channels.length).toBeGreaterThan(0);

    const dbRows = await query('SELECT id, slug, currency_code FROM channel_channel ORDER BY id');
    const apiBySlug = new Map(data.channels.map((channel) => [channel.slug, channel]));

    for (const row of dbRows) {
      const channel = apiBySlug.get(row.slug);
      expect(channel, `missing channel ${row.slug} in GraphQL response`).toBeDefined();
      expect(channel.currencyCode).toBe(row.currency_code);
    }

    const defaultChannel = apiBySlug.get('default-channel');
    expect(defaultChannel).toBeDefined();
    expect(defaultChannel.currencyCode).toBe('USD');
  });

  test('filters products by channel using the product channel listing table', async ({ request }) => {
    const queryText = `
      query ($channel: String!) {
        products(first: 10, channel: $channel) {
          totalCount
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `;

    const { response, data } = await graphqlRequest(request, queryText, {
      channel: 'channel-pln',
    });

    expect(response.status()).toBe(200);
    expect(data.products.totalCount).toBeGreaterThan(0);
    expect(data.products.edges.length).toBeGreaterThan(0);

    const channelId = 2;
    const dbRows = await query(
      'SELECT product_id FROM product_productchannellisting WHERE channel_id = $1',
      [channelId]
    );
    const listingIds = new Set(dbRows.map((row) => row.product_id));

    for (const edge of data.products.edges) {
      const decoded = Buffer.from(edge.node.id, 'base64').toString('utf8');
      const match = decoded.match(/:(\d+)$/);
      expect(match, `unexpected GraphQL product id format: ${edge.node.id}`).not.toBeNull();

      const productId = parseInt(match[1], 10);
      expect(listingIds.has(productId), `product ${productId} is missing a listing row for channel ${channelId}`).toBe(true);
    }
  });

  test.describe.serial('creates, updates, and deletes a category', () => {
    let categoryId;
    test('creates a fresh category', async ({ request, staffToken }) => {
      const mutation = `
            mutation CreateCategory($input: CategoryInput!) {
                categoryCreate(input: $input) {
                    category { id name slug description }
                    errors { field message code }
                }
            }
        `;

      const variables = {
        input: {
          name: 'Desi Collection',
          description: JSON.stringify({
            time: Date.now(),
            blocks: [
              {
                id: 'category123',
                type: 'paragraph',
                data: { text: 'A collection of Desi outfits' },
              },
            ],
            version: '2.22.2',
          })
        },
      };

      const { response, data } = await graphqlRequest(request, mutation, variables, staffToken);
      categoryId = data.categoryCreate.category.id;
      console.log(data);
      expect(response.ok()).toBeTruthy();
      expect(data.categoryCreate.errors).toEqual([]);
      expect(data.categoryCreate.category).not.toBeNull();
      expect(data.categoryCreate.category.name).toBe('Desi Collection')
      expect(data.categoryCreate.category.slug).toBe('desi-collection');
    })
    test('updates a category name', async ({ request, staffToken }) => {
      const mutation = `
            mutation UpdateCategory($id: ID!, $input: CategoryInput!) {
                categoryUpdate(id: $id, input: $input) {
                    category { id name slug }
                    errors { field message code }
                }
            }
        `;

      const variables = {
        id: categoryId,
        input: {
          name: "Desi-style collection"
        }
      }

      const { response, data } = await graphqlRequest(request, mutation, variables, staffToken);
      console.log(data);
      expect(response.ok()).toBeTruthy();
      expect(data.categoryUpdate.errors).toEqual([]);
      expect(data.categoryUpdate.category).not.toBeNull();
      expect(data.categoryUpdate.category.name).toBe('Desi-style collection')
      expect(data.categoryUpdate.category.slug).toBe('desi-collection');
    })
    test('deletes a category', async ({ request, staffToken }) => {
      const { response, data } = await graphqlRequest(
        request,
        `mutation DeleteCategory($id: ID!) { categoryDelete(id: $id) { errors { field message } } }`,
        { id: categoryId },
        staffToken
      );
      console.log(data);
      expect(response.ok()).toBeTruthy();
      expect(data.categoryDelete.errors).toEqual([]);
    })
  });
});