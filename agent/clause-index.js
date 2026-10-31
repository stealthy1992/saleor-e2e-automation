'use strict';

// Builds the policy clause index (Option A): one line per clause, "N.N <first ~70 characters>".
// Pure functions, no network, no files. The policy text is private, so the index only ever lives
// in memory (system prompt); it is never written to a committed file.

const CLAUSE_LINE = /^(\d+\.\d+)\s+(.*)$/; // same pattern as extractClause in saleor-tools.js
const MAX_CHARS = 70;

function buildClauseIndex(policyText, maxChars = MAX_CHARS) {
  const lines = [];
  const seen = new Set();
  for (const raw of String(policyText || '').split('\n')) {
    const m = raw.trim().match(CLAUSE_LINE);
    if (!m || seen.has(m[1])) continue; // headers, title and version lines do not match; keep the first of a duplicate number
    seen.add(m[1]);
    const text = m[2].replace(/\s+/g, ' ').trim();
    lines.push(`${m[1]} ${text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}...` : text}`);
  }
  return { index: lines.join('\n'), count: lines.length };
}

// Mock backend: the two placeholder clauses of mock-tools.js.
function mockClauseIndex() {
  return { index: '3.1 MOCK clause 3.1 (delivery).\n4.1 MOCK clause 4.1 (cancellation).', count: 2 };
}

module.exports = { buildClauseIndex, mockClauseIndex, MAX_CHARS };
