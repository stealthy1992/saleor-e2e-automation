const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const API_URL = (process.env.SALEOR_API_URL || 'http://localhost:8000').replace(/\/$/, '') + '/graphql/';
const APP_TOKEN = process.env.SALEOR_APP_TOKEN || '';
const CHANNEL = process.env.SALEOR_CHANNEL || 'channel-pkr';
const POLICY_SLUG = process.env.POLICY_SLUG || 'store-policy';

async function gql(query, variables = {}, { auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    if (!APP_TOKEN) throw new Error('SALEOR_APP_TOKEN is not set');
    headers.Authorization = `Bearer ${APP_TOKEN}`;
  }
  const res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
  if (!res.ok) throw new Error(`Saleor HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors) throw new Error(`Saleor GraphQL errors: ${JSON.stringify(body.errors)}`);
  return body.data;
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, '');
}

// EditorJS JSON -> plain lines. Headers keep their markdown markers so the result
// lines up with cases/policy_v1_1.md (useful for the drift test later).
function flattenBlocks(content) {
  const doc = typeof content === 'string' ? JSON.parse(content) : content;
  const lines = [];
  for (const block of doc.blocks || []) {
    if (block.type !== 'header' && block.type !== 'paragraph') {
      throw new Error(`flattenBlocks: unsupported block type "${block.type}"`);
    }
    const text = decodeEntities(stripTags((block.data && block.data.text) || '')).trim();
    if (!text) continue;
    if (block.type === 'header') lines.push(`${'#'.repeat(block.data.level || 2)} ${text}`);
    else lines.push(text);
  }
  return lines.join('\n');
}

async function getPolicyText(slug = POLICY_SLUG) {
  const data = await gql(
    `query Policy($slug: String!) { page(slug: $slug) { title isPublished content } }`,
    { slug }
  );
  if (!data.page) throw new Error(`getPolicyText: no published page with slug "${slug}"`);
  return flattenBlocks(data.page.content);
}

async function getProductByName(name, channel = CHANNEL) {
  const data = await gql(
    `query ProductByName($name: String!, $channel: String!) {
       products(first: 1, channel: $channel, where: { name: { eq: $name } }) {
         edges { node {
           name
           variants {
             name
             quantityAvailable
             pricing { price { gross { amount currency } } }
           }
         } }
       }
     }`,
    { name, channel }
  );
  const edge = data.products.edges[0];
  return edge ? edge.node : null;
}

async function getCurrentApp() {
  const data = await gql(`query { app { name permissions { code } } }`, {}, { auth: true });
  return data.app;
}

module.exports = { gql, flattenBlocks, getPolicyText, getProductByName, getCurrentApp };