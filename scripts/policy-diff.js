require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getPolicyText } = require('../assistant/saleor');

const HARNESS_DIR = process.env.EVAL_HARNESS_DIR || 'E:\\ollama-project';
const FILE = process.argv[2] || path.join(HARNESS_DIR, 'cases', 'policy_v1_1.md');

const lines = (text) => text.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
const normalise = (text) => text.replace(/\r\n/g, '\n').trim();

(async () => {
  if (!fs.existsSync(FILE)) {
    console.log(`policy-diff: SKIP (reference file not found: ${FILE})`);
    return;
  }
  const live = await getPolicyText();
  const file = fs.readFileSync(FILE, 'utf8');
  const a = lines(live);
  const b = lines(file);
  console.log(`saleor lines=${a.length} file lines=${b.length}`);
  console.log(`exact text equal: ${normalise(live) === normalise(file)}`);
  let diffs = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      diffs += 1;
      if (diffs <= 5) {
        console.log(`line ${i + 1}:\n  saleor: ${JSON.stringify(a[i])}\n  file:   ${JSON.stringify(b[i])}`);
      }
    }
  }
  console.log(`differing lines: ${diffs}`);
  if (diffs > 0) {
    console.error('policy-diff: DRIFT between Saleor policy page and policy_v1_1.md');
    process.exit(1);
  }
  console.log('policy-diff: OK');
})().catch((e) => {
  console.error('policy-diff error:', e.message);
  process.exit(1);
});