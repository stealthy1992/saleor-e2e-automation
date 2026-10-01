'use strict';
// node scripts/schema-coverage-report.js  -> which operations were validated (and how many failed) in the last run
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'test-results', 'schema-coverage');
const total = {};
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
  for (const [op, c] of Object.entries(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))) {
    total[op] = total[op] || { responses: 0, failures: 0 };
    total[op].responses += c.responses; total[op].failures += c.failures;
  }
}
const rows = Object.entries(total).sort(([a], [b]) => a.localeCompare(b));
if (!rows.length) { console.log('No coverage data. Run the API tests with the client wired to validateResponse first.'); process.exit(0); }
console.log('operation'.padEnd(44), 'responses'.padStart(9), 'failures'.padStart(9));
for (const [op, c] of rows) console.log(op.padEnd(44), String(c.responses).padStart(9), String(c.failures).padStart(9));
console.log(`\n${rows.length} distinct operations validated`);
process.exitCode = rows.some(([, c]) => c.failures) ? 1 : 0;
fs.writeFileSync(path.join(__dirname, '..', 'test-results', 'schema-coverage.json'), JSON.stringify(total, null, 2));
