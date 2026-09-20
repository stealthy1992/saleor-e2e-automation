// fixtures/ui.js — the single source every ui/*.spec.js file imports from
const { test: checkoutTest } = require('./checkout');   // chains auth -> product -> checkout
const { test: customerTest } = require('./customer');   // chains auth -> product -> customer

// customer.js and checkout.js both branch off product.js independently today —
// merge them into one chain instead of two siblings:
exports.test = checkoutTest.extend({
    // pull in customer.js's fixtures here so this one object has everything:
    testCustomer: customerTest._pool?.testCustomer ?? undefined, // illustrative only
});
exports.expect = checkoutTest.expect;