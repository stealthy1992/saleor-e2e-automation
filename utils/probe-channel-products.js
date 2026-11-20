// Read-only: what the PUBLIC storefront query sees per channel, plus API latency.
// Usage: node scripts/probe-channel-products.js [apiBase]   (default http://localhost:8000)
require('dotenv').config();
const BASE = (process.argv[2] || process.env.SALEOR_API_URL || 'http://localhost:8000').replace(/\/graphql\/?$/, '').replace(/\/$/, '');
const CHANNELS = ['default-channel', 'channel-pln', 'channel-pkr'];
const QUERY = `query ($channel: String!) {
  products(first: 3, channel: $channel) {
    totalCount
    edges { node { name } }
  }
}`;

async function ask(channel) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/graphql/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { channel } }),
      signal: AbortSignal.timeout(60000),
    });
    const json = await res.json();
    const p = json.data && json.data.products;
    return {
      channel,
      http: res.status,
      totalCount: p ? p.totalCount : 'n/a',
      sample: p ? p.edges.map((e) => e.node.name).join(' | ').slice(0, 60) : '',
      error: json.errors ? json.errors[0].message.slice(0, 70) : '',
      ms: Date.now() - started,
    };
  } catch (err) {
    return { channel, http: 'ERR', totalCount: 'n/a', sample: '', error: String(err.message).slice(0, 70), ms: Date.now() - started };
  }
}

// (async () => {
//   const rows = [];
//   for (const c of CHANNELS) rows.push(await ask(c));
//   console.log('Rows are following:')
//   console.table(rows);
// })();

module.exports = { ask }