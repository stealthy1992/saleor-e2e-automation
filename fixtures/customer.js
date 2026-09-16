const { test: productTest } = require('./product'); // chains onto product.js -> auth.js
const { request: pwRequest } = require('@playwright/test');
const { graphqlRequest } = require('../utils/graphql-client');
const pollForConfirmationEmail = require('../utils/confirmationToken');

exports.test = productTest.extend({
    testCustomer: [
        async ({ staffToken }, use) => {
            const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });

            // Captured once, up front — reused for polling, login, and the returned object.
            // Never rely on the API to echo the password back; it never will.
            const customerEmail = `checkout-customer-${Date.now()}@tester.com`;
            const customerPassword = "12345678";

            const registerMutation = `
                mutation RegisterAccount($input: AccountRegisterInput!){
                    accountRegister(input: $input){
                        requiresConfirmation
                        errors { field message code }
                    }
                }
            `;
            const registerVariables = {
                input: {
                    firstName: "Checkout",
                    lastName: "Customer",
                    email: customerEmail,
                    password: customerPassword,
                    channel: "default-channel",
                    metadata: [
                        { key: "checkout", value: "this account belongs to checkout customer" }
                    ],
                    redirectUrl: "http://localhost:9000/confirm"
                }
            };

            let { data } = await graphqlRequest(ctx, registerMutation, registerVariables);
            if (data.accountRegister.errors.length) {
                throw new Error(`testCustomer fixture (register) failed: ${JSON.stringify(data.accountRegister.errors)}`);
            }

            const { email, token } = await pollForConfirmationEmail(customerEmail);

            const confirmMutation = `
                mutation AccountConfirmation($email: String!, $token: String!){
                    confirmAccount(email: $email, token: $token){
                        user { id email isActive isConfirmed isStaff firstName lastName }
                        errors { field message code }
                    }
                }
            `;
            ({ data } = await graphqlRequest(ctx, confirmMutation, { email, token }));
            if (data.confirmAccount.errors.length) {
                throw new Error(`testCustomer fixture (confirm) failed: ${JSON.stringify(data.confirmAccount.errors)}`);
            }

            const customer = {
                id: data.confirmAccount.user.id, // needed for staff-side customerDelete in teardown
                email: data.confirmAccount.user.email,
                password: customerPassword,
                firstName: data.confirmAccount.user.firstName,
                lastName: data.confirmAccount.user.lastName,
                isActive: data.confirmAccount.user.isActive,
                isConfirmed: data.confirmAccount.user.isConfirmed,
                isStaff: data.confirmAccount.user.isStaff,
            };

            await use(customer); // <-- tests run here

            // Teardown: staff-side deletion, not the self-service email-token flow.
            // customerDelete removes the customer directly via staffToken — no Mailpit
            // round trip required, unlike accountRequestDeletion/accountDelete which is
            // the feature under test elsewhere, not a cleanup mechanism.
            const { data: deleteData } = await graphqlRequest(
                ctx,
                `mutation DeleteCustomer($id: ID!) { customerDelete(id: $id) { errors { field message code } } }`,
                { id: customer.id },
                staffToken
            );
            if (deleteData.customerDelete.errors.length) {
                // Don't throw in teardown — a failed cleanup shouldn't mask real test
                // results already reported. Log it so orphaned test data is visible.
                console.error(
                    `testCustomer fixture teardown: customerDelete failed for ${customer.email}: ` +
                    JSON.stringify(deleteData.customerDelete.errors)
                );
            }

            await ctx.dispose();
        },
        { scope: 'worker' },
    ],

    // Test-scoped (not worker) — every test that requests this gets its own
    // disposable customer, safe to rename/deactivate/delete. Section D
    // deletes it via the UI as part of the test itself; teardown below is
    // defensive against that.
    mutableCustomer: [
        async ({ staffToken }, use) => {
            const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });
            const customerEmail = `mutable-customer-${Date.now()}-${Math.random().toString(36).slice(2)}@tester.com`;
            const customerPassword = "12345678";

            const registerMutation = `
                mutation RegisterAccount($input: AccountRegisterInput!){
                    accountRegister(input: $input){
                        requiresConfirmation
                        errors { field message code }
                    }
                }
            `;
            let { data } = await graphqlRequest(ctx, registerMutation, {
                input: {
                    firstName: "Mutable",
                    lastName: "Customer",
                    email: customerEmail,
                    password: customerPassword,
                    channel: "default-channel",
                    redirectUrl: "http://localhost:9000/confirm"
                }
            });
            if (data.accountRegister.errors.length) {
                throw new Error(`mutableCustomer fixture (register) failed: ${JSON.stringify(data.accountRegister.errors)}`);
            }

            const { email, token } = await pollForConfirmationEmail(customerEmail);

            ({ data } = await graphqlRequest(ctx, `
                mutation AccountConfirmation($email: String!, $token: String!){
                    confirmAccount(email: $email, token: $token){
                        user { id email isActive isConfirmed isStaff firstName lastName }
                        errors { field message code }
                    }
                }
            `, { email, token }));
            if (data.confirmAccount.errors.length) {
                throw new Error(`mutableCustomer fixture (confirm) failed: ${JSON.stringify(data.confirmAccount.errors)}`);
            }
            console.log('Created customer in mutation is: ', data.confirmAccount.user);
            const customer = {
                id: data.confirmAccount.user.id,
                email: data.confirmAccount.user.email,
                password: customerPassword,
                firstName: data.confirmAccount.user.firstName,
                lastName: data.confirmAccount.user.lastName,
            };

            await use(customer);

            // Defensive: the test may have already deleted this customer
            // itself (Section D). customerDelete on an already-gone ID
            // throws a top-level GraphQL error rather than a userError, so
            // catch it instead of relying on data.customerDelete.errors.
            try {
                const { data: deleteData } = await graphqlRequest(
                    ctx,
                    `mutation DeleteCustomer($id: ID!) { customerDelete(id: $id) { errors { field message code } } }`,
                    { id: customer.id },
                    staffToken
                );
                if (deleteData.customerDelete.errors.length) {
                    console.error(`mutableCustomer fixture teardown: customerDelete failed for ${customer.email}: ${JSON.stringify(deleteData.customerDelete.errors)}`);
                }
            } catch (err) {
                console.log(`mutableCustomer fixture teardown: customerDelete threw (likely already deleted by the test) for ${customer.email}: ${err.message}`);
            }

            await ctx.dispose();
        },
        { scope: 'test' },
    ],

    customerToken: [
        async ({ testCustomer }, use) => {
            const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });

            const mutation = `
                mutation TokenCreate($email: String!, $password: String!) {
                    tokenCreate(email: $email, password: $password) {
                        token
                        errors { field message code }
                    }
                }
            `;
            const { data } = await graphqlRequest(ctx, mutation, {
                email: testCustomer.email,
                password: testCustomer.password,
            });
            if (data.tokenCreate.errors.length) {
                throw new Error(`customerToken fixture failed: ${JSON.stringify(data.tokenCreate.errors)}`);
            }

            await use(data.tokenCreate.token);
            await ctx.dispose();
        },
        { scope: 'worker' },
    ],
});
exports.expect = productTest.expect;