// scripts/cleanup-perf-data.js
//
// Hard-deletes leftover data from k6 perf runs:
//   - perf-variant-* product variants (product-variant-creation.js)
//   - perf-order-*/perf-checkout-* orders and their dependent rows
//     (order-refund.js, checkout-order-flow.js)
//
// k6 has no Postgres client, so this cascade can't live inside the k6
// scenarios themselves — it runs as a separate Node step, using the same
// db-client.js the Playwright fixtures already use.
//
// The order-side cascade order matters (FK dependents before parents) and
// was derived by hitting each constraint in turn against the live schema:
// payment_transaction -> payment_payment -> order_orderevent ->
// warehouse_allocation -> discount_orderlinediscount -> order_orderline ->
// order_fulfillmentline -> order_fulfillment -> discount_orderdiscount ->
// order_order. If you upgrade Saleor and this script starts failing on a
// new FK, add the child-table DELETE for whatever table the error names,
// ahead of its parent's DELETE.
//
// Usage: node scripts/cleanup-perf-data.js

const { query, closePool } = require('../utils/db-client'); // adjust path if db-client.js lives elsewhere

async function main() {
  console.log('[cleanup] deleting perf-variant-* product variants...');
  const deletedVariants = await query(
    `DELETE FROM product_productvariant WHERE sku LIKE 'perf-variant-%' RETURNING id`
  );
  console.log(`[cleanup] deleted ${deletedVariants.length} variant(s)`);

  const emailFilter = `(user_email LIKE 'perf-order-%@loadtest.local' OR user_email LIKE 'perf-checkout-%@loadtest.local')`;
  const orderIds = `SELECT id FROM order_order WHERE ${emailFilter}`;
  const lineIds = `SELECT id FROM order_orderline WHERE order_id IN (${orderIds})`;

  console.log('[cleanup] deleting perf-order-*/perf-checkout-* order data...');

  await query(`
    DELETE FROM payment_transaction WHERE payment_id IN (
      SELECT id FROM payment_payment WHERE order_id IN (${orderIds})
    )
  `);
  await query(`DELETE FROM payment_payment WHERE order_id IN (${orderIds})`);
  await query(`DELETE FROM order_orderevent WHERE order_id IN (${orderIds})`);
  await query(`DELETE FROM warehouse_allocation WHERE order_line_id IN (${lineIds})`);
  await query(`DELETE FROM discount_orderlinediscount WHERE line_id IN (${lineIds})`);
  await query(`DELETE FROM order_orderline WHERE order_id IN (${orderIds})`);
  await query(`
    DELETE FROM order_fulfillmentline WHERE fulfillment_id IN (
      SELECT id FROM order_fulfillment WHERE order_id IN (${orderIds})
    )
  `);
  await query(`DELETE FROM order_fulfillment WHERE order_id IN (${orderIds})`);
  await query(`DELETE FROM discount_orderdiscount WHERE order_id IN (${orderIds})`);

  const deletedOrders = await query(`DELETE FROM order_order WHERE ${emailFilter} RETURNING id`);
  console.log(`[cleanup] deleted ${deletedOrders.length} order(s)`);
}

main()
  .then(async () => {
    console.log('[cleanup] done.');
    await closePool();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[cleanup] FAILED:', err);
    await closePool();
    process.exit(1);
  });