const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

let poolClosed = false;

async function query(text, params) {
  if (poolClosed) {
    throw new Error('Cannot use a pool after calling end on the pool');
  }

  const result = await pool.query(text, params);
  return result.rows;
}

async function closePool() {
  if (poolClosed) return;
  poolClosed = true;
  await pool.end();
}

module.exports = { query, pool, closePool };