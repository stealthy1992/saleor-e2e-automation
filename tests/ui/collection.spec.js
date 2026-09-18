const { test, expect } = require('@playwright/test');
const CollectionPage = require('../../page-objects/CollectionPage');
const { query } = require('../../utils/db-client');
// console.log(process.env.SALEOR_DASHBOARD_URL);

test.describe.serial('Collection Testing Suite', () => {
    let collectionPage;
    let beforeUpdateInfo;
    let collectionId;
    let afterUpdateInfo;
    let assignedProductId;
    let channel, filter;
    const availableChannels = [{ channel_id: 1 }, { channel_id: 2 }];
    let assignedProduct = {
        name: 'Blue Plimsolls'
    };
    const collection = {
        name: 'Test Collection',
        description: 'Description for Test Colelction',
        channels: ['Channel-PLN']
    }
    const udpatedCollection = {
        name: 'Updated Test Collection',
        description: 'Updated Description for Test Collection'
    }
    const limitedStaffCollection = {
        name: 'Summer Picks Limited Edition',
        description: 'This collection has been edited by limited-access staff.'
    }
    test.beforeEach(async ({ page }) => {
        collectionPage = new CollectionPage(page);
    })


    test('E. Collection — Create/Update/Delete (P0)', async ({ page }) => {
        await test.step('CAT-UI-015 should create a collection with required fields', async () => {
            // console.log(process.env.SALEOR_DASHBOARD_URL);
            await page.goto('collections');
            await collectionPage.createCollection(collection);
            beforeUpdateInfo = await query('SELECT * FROM product_collection WHERE name = $1 LIMIT 1', [collection.name]);
            collectionId = beforeUpdateInfo[0].id;
        })

        await test.step('CAT-UI-016 should auto-generate the collection slug from its name', async () => {
            const slug = await collectionPage.fetchCurrentSlug();
            const expectedSlugValue = collection.name.trim().toLowerCase().replace(/\s+/g, '-')
            expect(slug).toBe(expectedSlugValue);

        })

        await test.step('CAT-UI-017 should update a collection name and description', async () => {
            await collectionPage.updateCollection(udpatedCollection);
            await page.waitForTimeout(2000);
            afterUpdateInfo = await query('SELECT * FROM product_collection WHERE id = $1 LIMIT 1', [collectionId]);
            console.log(`Collection ID is ${collectionId}`);
            expect(afterUpdateInfo[0].name).toBe(udpatedCollection.name);
            expect(afterUpdateInfo[0].description.blocks[0].data.text.trim()).toBe(udpatedCollection.description);
        })

        await test.step('CAT-UI-018 should assign a product to the test collection', async () => {
            await collectionPage.navigateToAssignedProducts();
            await collectionPage.assignProduct(assignedProduct);
            await page.waitForTimeout(2000);
            const assignedProductIDInDB = (await query('SELECT id FROM product_product WHERE name = $1',[assignedProduct.name]))[0];
            const productInCollectionResult = await query('SELECT product_id FROM product_collectionproduct WHERE collection_id = $1', [collectionId]);
            console.log(`DB result is ${productInCollectionResult} and UI ID is ${assignedProductIDInDB}`);
            // expect(productInCollectionResult).toContainEqual(assignedProductIDInDB.id);
            expect(productInCollectionResult.map(r => r.product_id)).toContain(assignedProductIDInDB.id);
            assignedProductId = productInCollectionResult[0].product_id;

        })



    })

    test('F. Collection — Channel Listing (P0)', async ({ page }) => {
        await test.step('CAT-UI-019 should toggle a collections published status for a channel', async () => {
            await page.goto('collections');
            await collectionPage.navigateToCollection(collection.name);
            await collectionPage.toggleChannelOn('Channel-USD');

        })

        await test.step('CAT-UI-020 should reflect channel-listing changes in product_collectionchannellisting immediately', async () => {
        
            console.log(`Collection ID is ${collectionId}`);
            const channelListingResult = await query('SELECT channel_id FROM product_collectionchannellisting WHERE collection_id = $1', [collectionId])
            // console.log(channelListingResult);
            expect(availableChannels).toContainEqual(channelListingResult[0]);
            // expect(channelListingResult).toEqual(expect.arrayContaining([{ channel_id: 1 }, { channel_id: 2 }]));
        })
    })

    test('G. Collection — Product Assignment (P0)', async ({ page }) => {
        // await test.step('CAT-UI-021 should add a product to a collection via the UI - SKIPPED') 
        await test.step('CAT-UI-022 should remove a product from a collection via the UI', async () => {
            await page.goto('collections');
            await collectionPage.navigateToCollection(udpatedCollection.name);
            await collectionPage.deleteProductFromCollection(assignedProduct);

        })
        await test.step('CAT-UI-023 should reflect assignment changes in product_collectionproduct immediately', async () => {
            const resultAfterProductDelete = await query('SELECT * FROM product_collectionproduct WHERE collection_id = $1 AND product_id = $2', [collectionId, assignedProductId])
            expect(resultAfterProductDelete).toEqual([]);
        })
        await test.step('CAT-UI-024 should allow the same product to belong to multiple collections', async () => {
            const productAvailabilityInOtherCollections = await query('SELECT * FROM product_collectionproduct WHERE  product_id = $1', [assignedProductId]);
            expect(productAvailabilityInOtherCollections).not.toEqual([]);
        })
    })

    test('H. List / Search / Filter (P1)', async ({ page }) => {
        await test.step('CAT-UI-026 should list all seeded categories on the Collections  page', async () => {
            await page.goto('collections');
            const collectionNames = await collectionPage.fetchCollections();
            const collectionsInDB = await query('SELECT * FROM product_collection');
            // console.log(collectionNames);
            // console.log(collectionsInDB);
            expect(collectionsInDB.map(o => o.name.trim())).toEqual(expect.arrayContaining(collectionNames));
        })
        await test.step('CAT-UI-027 should search collection by name', async () => {
            const searchResults = await collectionPage.searchCollection('Test');
            for (let searchResult of searchResults) {
                expect(searchResult).toContain('Test');
            }
            await collectionPage.clearSearchInput();
        })
        await test.step('CAT-UI-028 should filter collections by channel', async () => {
            channel = 'Channel-USD';
            filter = 'Channel';
            await collectionPage.addFilterOnCollections(filter, channel);
            const listedNames = await collectionPage.getAllCategoryNames();
            console.log(listedNames);
        })
    })

    test('Product Deletion', async ({ page }) => {
        await page.goto('collections');
        await collectionPage.navigateToCollection(udpatedCollection.name);
        await collectionPage.deleteCollection(udpatedCollection.name);
        const categoryCheckResult = await query('SELECT * FROM product_collection WHERE id = $1', [collectionId]);
        expect(categoryCheckResult).toEqual([]);
        const productAssignedResult = await query('SELECT * FROM product_collectionproduct WHERE collection_id = $1', [collectionId]);
        expect(productAssignedResult).toEqual([]);
        const productExistResult = await query('SELECT * FROM product_product WHERE id = $1', [assignedProductId]);
        expect(productExistResult.length).toBe(1);
        expect(productExistResult[0].name).toBe(assignedProduct.name);
    })

    test('CAT-UI-029 should allow the limited-access (MANAGE_PRODUCTS-only) staff to manage categories/collections via the UI', async ({ page }) => {
        await page.goto('collections'); // check the real path — 'collections' alone is likely missing the leading segment
        await collectionPage.navigateToCollection('Summer Picks');
        await collectionPage.updateCollection(limitedStaffCollection);
        const limitedStaffUpdateInfo = await query('SELECT * FROM product_collection WHERE id = $1 LIMIT 1', [5]);
        expect(limitedStaffUpdateInfo[0].name).toBe(limitedStaffCollection.name);
        expect(limitedStaffUpdateInfo[0].description.blocks[0].data.text.trim()).toBe(limitedStaffCollection.description);
    });
})