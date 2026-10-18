require('dotenv').config();
const { pool, query } = require('../utils/db-client');

const STATEMENTS = [
  `DELETE FROM payment_transaction
   WHERE payment_id IN (SELECT id FROM payment_payment WHERE order_id = ANY($1::uuid[]))`,
  `DELETE FROM payment_payment WHERE order_id = ANY($1::uuid[])`,
  `DELETE FROM warehouse_allocation
   WHERE order_line_id IN (SELECT id FROM order_orderline WHERE order_id = ANY($1::uuid[]))`,
  `DELETE FROM order_fulfillmentline
   WHERE fulfillment_id IN (SELECT id FROM order_fulfillment WHERE order_id = ANY($1::uuid[]))`,
  `DELETE FROM order_fulfillment WHERE order_id = ANY($1::uuid[])`,
  `DELETE FROM discount_orderlinediscount
   WHERE line_id IN (SELECT id FROM order_orderline WHERE order_id = ANY($1::uuid[]))`,
  `DELETE FROM order_orderline WHERE order_id = ANY($1::uuid[])`,
  `DELETE FROM order_orderevent WHERE order_id = ANY($1::uuid[])`,
  `DELETE FROM invoice_invoice WHERE order_id = ANY($1::uuid[])`,
  `DELETE FROM order_order_gift_cards WHERE order_id = ANY($1::uuid[])`,
  `DELETE FROM discount_orderdiscount WHERE order_id = ANY($1::uuid[])`,
];

async function main() {
  const [number, email, flag] = process.argv.slice(2);
  if (!number || !email) {
    console.error('usage: node scripts/delete-order.js <orderNumber> <email> [--yes]');
    process.exit(1);
  }

  const rows = await query(
    'SELECT id, number, status, user_email FROM order_order WHERE number = $1',
    [Number(number)]
  );
  if (rows.length !== 1) {
    console.error(`expected exactly 1 order with number ${number}, found ${rows.length}`);
    process.exit(1);
  }
  const order = rows[0];
  if ((order.user_email || '').toLowerCase() !== email.toLowerCase()) {
    console.error('email does not match that order; nothing deleted');
    process.exit(1);
  }

  console.log(`will delete order ${order.number} (${order.status}, ${order.user_email})`);
  if (flag !== '--yes') {
    console.log('dry run; re-run with --yes to delete');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const sql of STATEMENTS) await client.query(sql, [[order.id]]);
    const res = await client.query('DELETE FROM order_order WHERE id = ANY($1::uuid[])', [[order.id]]);
    await client.query('COMMIT');
    console.log(`deleted ${res.rowCount} order(s)`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`delete failed, rolled back: ${err.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());