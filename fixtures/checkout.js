const { test: productTest } = require('./product'); // chains onto product.js -> auth.js (no customer.js needed — guest checkout)
const { request: pwRequest } = require('@playwright/test');
const { graphqlRequest } = require('../utils/graphql-client');
const { pool } = require('../utils/db-client'); // adjust path if db-client.js lives elsewhere

const DEFAULT_WAREHOUSE_ID = 'V2FyZWhvdXNlOjhlYjMxODE0LTNmYTgtNDA5My1hMGZkLTFiZmU1YmQ3NzQxOA==';

// Saleor's GraphQL IDs are Relay global IDs — base64("TypeName:<raw pk>") —
// not the raw Postgres primary key. order.id from checkoutComplete looks like
// "T3JkZXI6M2ZhODVmNjQtNTcxNy00NTYyLWIzZmMtMmM5NjNmNjZhZmE2", which decodes
// to "Order:3fa85f64-5717-4562-b3fc-2c963f66afa6". Every SQL query below must
// use the decoded UUID, never the raw GraphQL ID string, or every DELETE
// silently matches zero rows (no FK violation, no thrown error — just nothing
// deleted, which is exactly what was happening before this fix).
function decodeGlobalId(globalId) {
    const decoded = Buffer.from(globalId, 'base64').toString('utf-8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
        throw new Error(`decodeGlobalId: couldn't parse "${globalId}" (decoded to "${decoded}")`);
    }
    return decoded.slice(separatorIndex + 1);
}

// Hard-deletes finalized orders directly via SQL, since Saleor's schema has
// no orderDelete mutation for non-draft orders (only draftOrderDelete).
// Dependents-before-parents order, confirmed empirically across three
// separate cleanup sessions via real FK-violation errors. Scoped only to
// orderIds this fixture itself created — never a status/pattern filter —
// so there's no risk of touching real populatedb seed data.
async function hardDeleteOrders(globalOrderIds) {
    if (!globalOrderIds.length) return;
    const orderIds = globalOrderIds.map(decodeGlobalId);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `DELETE FROM payment_transaction
             WHERE payment_id IN (SELECT id FROM payment_payment WHERE order_id = ANY($1::uuid[]))`,
            [orderIds]
        );
        await client.query(
            `DELETE FROM payment_payment WHERE order_id = ANY($1::uuid[])`,
            [orderIds]
        );
        await client.query(
            `DELETE FROM warehouse_allocation
             WHERE order_line_id IN (SELECT id FROM order_orderline WHERE order_id = ANY($1::uuid[]))`,
            [orderIds]
        );
        await client.query(
            `DELETE FROM order_fulfillmentline
             WHERE fulfillment_id IN (SELECT id FROM order_fulfillment WHERE order_id = ANY($1::uuid[]))`,
            [orderIds]
        );
        await client.query(
            `DELETE FROM order_fulfillment WHERE order_id = ANY($1::uuid[])`,
            [orderIds]
        );
        await client.query(
            `DELETE FROM discount_orderlinediscount
             WHERE line_id IN (SELECT id FROM order_orderline WHERE order_id = ANY($1::uuid[]))`,
            [orderIds]
        );
        await client.query(
            `DELETE FROM order_orderline WHERE order_id = ANY($1::uuid[])`,
            [orderIds]
        );
        await client.query(
            `DELETE FROM order_orderevent WHERE order_id = ANY($1::uuid[])`,
            [orderIds]
        );
        await client.query(
            `DELETE FROM invoice_invoice WHERE order_id = ANY($1::uuid[])`,
            [orderIds]
        );
        await client.query(
            `DELETE FROM order_order_gift_cards WHERE order_id = ANY($1::uuid[])`,
            [orderIds]
        );
        await client.query(
            `DELETE FROM discount_orderdiscount WHERE order_id = ANY($1::uuid[])`,
            [orderIds]
        );
        await client.query(
            `DELETE FROM order_order WHERE id = ANY($1::uuid[])`,
            [orderIds]
        );

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`createOrder teardown: hardDeleteOrders failed, rolled back: ${err.message}`);
        throw err;
    } finally {
        client.release();
    }
}

exports.test = productTest.extend({
    createOrder: [
        async ({ staffToken }, use) => {
            const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });
            const createdOrderIds = [];

            async function resolveVariantId(productName) {
                const { data } = await graphqlRequest(ctx, `
                    query FindVariant($filter: ProductFilterInput!) {
                        products(first: 1, channel: "default-channel", filter: $filter) {
                            edges { node { id name variants { id name quantityAvailable } } }
                        }
                    }
                `, { filter: { search: productName } });
                const product = data.products.edges[0]?.node;
                if (!product) throw new Error(`createOrder: no product found matching "${productName}"`);
                // The GraphQL `search` filter is fuzzy/relevance-ranked, not exact —
                // it can silently return a different product than intended if the
                // catalog doesn't have one literally named `productName`. Fail here,
                // at resolution time, instead of downstream when partial-fulfillment
                // matching mysteriously finds zero lines for a "successfully" created order.
                if (!product.name.toLowerCase().includes(productName.toLowerCase())) {
                    throw new Error(`createOrder: search for "${productName}" resolved to a different product: "${product.name}" (id ${product.id}). Check the catalog for the exact product name.`);
                }
                const variant = product.variants.find(v => v.quantityAvailable > 0);
                if (!variant) throw new Error(`createOrder: product "${productName}" has no variant with available stock`);
                return variant.id;
            }

            async function createOrder({ lineItems, email, partialFulfillmentProductNames = [] }) {
                if (!email) throw new Error('createOrder: an email is required');

                const resolvedLines = [];
                for (const { name, quantity } of lineItems) {
                    resolvedLines.push({ quantity, variantId: await resolveVariantId(name) });
                }

                // Guest checkout — no customerToken passed anywhere below. This keeps
                // order.userEmail (what order.spec.js asserts against) as the single
                // source of truth, with no linked account to confuse the Dashboard's
                // "Customer details" display.
                const { data: createData } = await graphqlRequest(ctx, `
                    mutation CreateCheckout($input: CheckoutCreateInput!) {
                        checkoutCreate(input: $input) {
                            checkout { id shippingMethods { id name } }
                            errors { field message code }
                        }
                    }
                `, {
                    input: {
                        email,
                        channel: "default-channel",
                        lines: resolvedLines,
                        shippingAddress: {
                            firstName: "Checkout", lastName: "Tester",
                            streetAddress1: "350 5th Avenue", streetAddress2: "Suite 7500",
                            city: "New York", countryArea: "NY", postalCode: "10118", country: "US"
                        },
                        saveBillingAddress: true,
                        billingAddress: {
                            firstName: "Checkout", lastName: "Tester",
                            streetAddress1: "350 5th Avenue", streetAddress2: "Suite 7500",
                            city: "New York", countryArea: "NY", postalCode: "10118", country: "US"
                        },
                    }
                });
                if (createData.checkoutCreate.errors.length) {
                    throw new Error(`createOrder (checkoutCreate) failed: ${JSON.stringify(createData.checkoutCreate.errors)}`);
                }
                const checkout = createData.checkoutCreate.checkout;

                const shippingMethod = checkout.shippingMethods[0];
                if (!shippingMethod) throw new Error(`createOrder: no shipping methods available for checkout ${checkout.id}`);

                const { data: deliveryData } = await graphqlRequest(ctx, `
                    mutation CheckoutDeliveryMethodUpdate($id: ID, $deliveryMethodId: ID) {
                        checkoutDeliveryMethodUpdate(id: $id, deliveryMethodId: $deliveryMethodId) {
                            checkout { id }
                            errors { field message code }
                        }
                    }
                `, { id: checkout.id, deliveryMethodId: shippingMethod.id });
                if (deliveryData.checkoutDeliveryMethodUpdate.errors.length) {
                    throw new Error(`createOrder (deliveryMethodUpdate) failed: ${JSON.stringify(deliveryData.checkoutDeliveryMethodUpdate.errors)}`);
                }

                const { data: paymentData } = await graphqlRequest(ctx, `
                    mutation CheckoutPaymentCreate($id: ID, $input: PaymentInput!) {
                        checkoutPaymentCreate(id: $id, input: $input) {
                            checkout { id }
                            payment { id chargeStatus }
                            errors { field code message }
                        }
                    }
                `, { id: checkout.id, input: { gateway: "mirumee.payments.dummy", token: "fake-token" } });
                if (paymentData.checkoutPaymentCreate.errors.length) {
                    throw new Error(`createOrder (paymentCreate) failed: ${JSON.stringify(paymentData.checkoutPaymentCreate.errors)}`);
                }

                const { data: completeData } = await graphqlRequest(ctx, `
                    mutation CheckoutComplete($id: ID, $redirectUrl: String) {
                        checkoutComplete(id: $id, redirectUrl: $redirectUrl) {
                            order { id number lines { id quantity productName } }
                            confirmationNeeded
                            errors { field message code }
                        }
                    }
                `, { id: checkout.id, redirectUrl: "http://localhost:9000/order-complete" });
                if (completeData.checkoutComplete.errors.length) {
                    throw new Error(`createOrder (checkoutComplete) failed: ${JSON.stringify(completeData.checkoutComplete.errors)}`);
                }
                const order = completeData.checkoutComplete.order;
                if (!order) throw new Error(`createOrder: checkoutComplete returned no order (confirmationNeeded: ${completeData.checkoutComplete.confirmationNeeded})`);

                createdOrderIds.push(order.id);
                // console.log('Órder is: ',order);
                if (partialFulfillmentProductNames.length) {
                    console.log('Partial: ',partialFulfillmentProductNames);
                    const linesToFulfill = order.lines.filter(line =>
                        partialFulfillmentProductNames.some(name => line.productName.toLowerCase().includes(name.toLowerCase()))
                    );
                    console.log(linesToFulfill);
                    if (!linesToFulfill.length) throw new Error(`createOrder: none of ${JSON.stringify(partialFulfillmentProductNames)} matched an order line`);

                    const { data: fulfillData } = await graphqlRequest(ctx, `
                        mutation OrderFulfillmentCreate($order: ID!, $input: OrderFulfillInput!) {
                            orderFulfill(order: $order, input: $input) {
                                fulfillments { id status }
                                errors { field message code }
                            }
                        }
                    `, {
                        order: order.id,
                        input: { lines: linesToFulfill.map(line => ({ orderLineId: line.id, stocks: [{ quantity: line.quantity, warehouse: DEFAULT_WAREHOUSE_ID }] })) }
                    }, staffToken);
                    if (fulfillData.orderFulfill.errors.length) {
                        throw new Error(`createOrder (partial orderFulfill) failed: ${JSON.stringify(fulfillData.orderFulfill.errors)}`);
                    }
                }

                return { orderId: order.id, orderNumber: order.number };
            }

            await use(createOrder);

            for (const orderId of createdOrderIds) {
                try {
                    const { data: orderData } = await graphqlRequest(ctx, `
                        query OrderFulfillments($id: ID!) {
                            order(id: $id) { id status fulfillments { id status } }
                        }
                    `, { id: orderId }, staffToken);

                    const fulfillments = orderData.order?.fulfillments || [];
                    for (const fulfillment of fulfillments) {
                        if (fulfillment.status === 'CANCELED') continue;
                        const { data: cancelFulfillmentData } = await graphqlRequest(ctx, `
                            mutation OrderFulfillmentCancel($id: ID!, $input: FulfillmentCancelInput) {
                                orderFulfillmentCancel(id: $id, input: $input) {
                                    fulfillment { id status }
                                    errors { field message code }
                                }
                            }
                        `, { id: fulfillment.id, input: { warehouseId: DEFAULT_WAREHOUSE_ID } }, staffToken);
                        if (cancelFulfillmentData.orderFulfillmentCancel.errors.length) {
                            console.error(`createOrder teardown: orderFulfillmentCancel failed for ${fulfillment.id}: ${JSON.stringify(cancelFulfillmentData.orderFulfillmentCancel.errors)}`);
                        }
                    }

                    const { data } = await graphqlRequest(ctx, `
                        mutation OrderCancel($id: ID!) {
                            orderCancel(id: $id) {
                                order { id status }
                                errors { field message code }
                            }
                        }
                    `, { id: orderId }, staffToken);
                    if (data.orderCancel.errors.length) {
                        console.error(`createOrder teardown: orderCancel failed for ${orderId}: ${JSON.stringify(data.orderCancel.errors)}`);
                    }
                } catch (err) {
                    console.error(`createOrder teardown: cleanup threw for ${orderId}: ${err.message}`);
                }
            }

            // Hard-delete via SQL now that the GraphQL-side cancellation above has
            // run for every order — Saleor never actually deletes finalized orders
            // on its own, so this is the only way to keep the local DB from growing
            // unbounded across suite runs.
            try {
                await hardDeleteOrders(createdOrderIds);
            } catch (err) {
                console.error(`createOrder teardown: hardDeleteOrders threw for ${JSON.stringify(createdOrderIds)}: ${err.message}`);
            }

            await ctx.dispose();
        },
        { scope: 'worker' },
    ],
});
exports.expect = productTest.expect;