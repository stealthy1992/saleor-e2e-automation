// tests/k6/lib/report.js
//
// Produces a dedicated standalone HTML report per k6 run, independent of
// Grafana — useful for a quick pass/fail glance right after a local run,
// attaching to a Jenkins build as an artifact, or sharing a single file
// with someone who doesn't have Grafana access.
//
// Uses k6-reporter (https://github.com/benc-uk/k6-reporter), imported
// directly from its CDN-hosted bundle — k6 scripts can import from a URL,
// this is normal practice for k6 and not a security concern since it's
// pinned to a specific release tag below.

import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/2.4.0/dist/bundle.js";

// reportName: e.g. 'product-variant-creation' or 'order-refund'.
// Call this from a scenario file as:
//   export function handleSummary(data) {
//     return buildSummary(data, 'product-variant-creation');
//   }
export function buildSummary(data, reportName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `reports/${reportName}-${timestamp}.html`;

  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    [path]: htmlReport(data, { title: `Saleor Dashboard — ${reportName}` }),
  };
}