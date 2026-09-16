#!/usr/bin/env node
// Standalone sanity check for SCRUM-20: confirms checkout.js's hard-delete
// teardown is actually keeping order_order clean. Not wired into CI yet
// (Jenkins pipeline is SCRUM-11) — run this manually after a suite run, or
// schedule it independently for now (see notes at the bottom of this file).
// When SCRUM-11 lands, this becomes a single `node scripts/check-orphaned-orders.js`
// post-build stage with a failed exit code failing the build.

require('dotenv').config();
const { query, pool } = require('../utils/db-client'); // adjust path to match your scripts/ location

async function main() {
    const orphaned = await query(
        `SELECT id, number, status, created_at
         FROM order_order
         WHERE status = 'canceled'
         ORDER BY created_at ASC`
    );

    if (orphaned.length === 0) {
        console.log('check-orphaned-orders: OK — no canceled orders left in order_order.');
        return 0;
    }

    console.error(`check-orphaned-orders: FAILED — ${orphaned.length} canceled order(s) found that should have been hard-deleted by checkout.js's teardown:`);
    for (const row of orphaned) {
        console.error(`  order_order.id=${row.id} number=${row.number} created_at=${row.created_at.toISOString()}`);
    }
    console.error('This means the teardown cascade in checkout.js either did not run, threw partway through and rolled back, or a new order was created and canceled outside that fixture (e.g. manual testing in the Dashboard).');
    return 1;
}

main()
    .then((exitCode) => {
        pool.end();
        process.exit(exitCode);
    })
    .catch((err) => {
        console.error('check-orphaned-orders: script itself threw:', err);
        pool.end();
        process.exit(2);
    });

/*
 * Running it today, without Jenkins:
 *
 *   node scripts/check-orphaned-orders.js
 *
 * Windows Task Scheduler (since you're on Windows): create a Basic Task,
 * trigger "On a schedule" (e.g. daily, or after your usual test-run window),
 * action "Start a program" -> node.exe, arguments:
 *   "C:\path\to\saleor-e2e-automation\scripts\check-orphaned-orders.js"
 * Start-in: your saleor-e2e-automation project root, so dotenv/db-client
 * resolve correctly.
 *
 * Exit codes: 0 = clean, 1 = orphaned orders found, 2 = script itself errored
 * (e.g. can't reach Postgres) — Task Scheduler can be configured to only
 * alert on non-zero, or just check manually for now.
 *
 * When SCRUM-11 (Jenkins) is built: add this as a post-build/post-suite
 * stage right after the Playwright run, same exit-code semantics — a
 * non-zero exit fails that stage without failing the whole pipeline if you
 * want it non-blocking initially, or fails the build outright once you
 * trust it.
 */