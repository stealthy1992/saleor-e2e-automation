const { test, expect } = require('../../fixtures/auth');

const { graphqlRequest } = require('../../utils/graphql-client');
const pollForConfirmationEmail = require('../../utils/confirmationToken');
const { query } = require('../../utils/db-client');

test.describe.serial('Account related test cases', () => {

    // const customerEmail = 'james.t@tester.com';
    let customerId;
    let customerToken;
    const customer = {
        firstName: "Mack",
        lastName: "Travolta",
        email: `test-user-${Date.now()}@tester.com`,
        password: "12345678",
        metadataKey: "mack",
        metadataValue: "this account belongs to mack",
        channel: "default-channel"

    }

    test('registers a user account', async ({ request }) => {
        const mutation =
            `
            mutation RegisterAccount($input: AccountRegisterInput!){
                accountRegister(input: $input){
                    requiresConfirmation
                    errors {
                        field
                        message
                        code
                    }
                }
            }
        `

        const variables = {
            input: {
                firstName: customer.firstName,
                lastName: customer.lastName,
                email: customer.email,
                password: customer.password,
                channel: customer.channel,
                metadata: [
                    {
                        key: customer.metadataKey,
                        value: customer.metadataValue
                    }
                ],
                redirectUrl: "http://localhost:9000/:/confirm"
            }
        }

        const { response, data } = await graphqlRequest(request, mutation, variables);
        expect(response.ok()).toBeTruthy();
        // console.log(data);
        expect(data.accountRegister.requiresConfirmation).toBe(true);
        expect(data.accountRegister.errors).toEqual([]);
        const row = await query('SELECT * FROM account_user WHERE email = $1 LIMIT 1', [customer.email]);
        expect(row[0].is_confirmed).toBe(false);

    })

    test('confirms user registration', async ({ request, staffToken }) => {
        const { email, token } = await pollForConfirmationEmail(customer.email);
        customerToken = token;
        const mutation =
            `
            mutation AccountConfirmation($email: String!, $token: String!){
                confirmAccount(email: $email, token: $token){
                    user { id email isActive isConfirmed isStaff firstName lastName }
                    errors { field message code }
                }
            }
        `

        const variables = {
            email: email,
            token: token
        }

        const { response, data } = await graphqlRequest(request, mutation, variables, staffToken);
        expect(response.ok()).toBeTruthy();
        // console.log(data);
        expect(data.confirmAccount.user.email).toBe(customer.email);
        expect(data.confirmAccount.user.isActive).toBe(true);
        expect(data.confirmAccount.user.isConfirmed).toBe(true);
        expect(data.confirmAccount.user.isStaff).toBe(false);
        expect(data.confirmAccount.user.firstName).toBe(customer.firstName);
        expect(data.confirmAccount.user.lastName).toBe(customer.lastName);

        const row = await query('SELECT * FROM account_user WHERE email = $1 LIMIT 1', [customer.email]);
        expect(row[0].email).toBe(data.confirmAccount.user.email);
        expect(row[0].first_name).toBe(data.confirmAccount.user.firstName);
        expect(row[0].last_name).toBe(data.confirmAccount.user.lastName);
        expect(row[0].is_staff).toBe(data.confirmAccount.user.isStaff);
        expect(row[0].is_active).toBe(data.confirmAccount.user.isActive);
        expect(row[0].is_confirmed).toBe(data.confirmAccount.user.isConfirmed);

    })

    test('get customer token for deletion', async ({ request }) => {
        const mutation = `
            mutation TokenCreate($email: String!, $password: String!) {
                tokenCreate(email: $email, password: $password) {
                    token
                    errors { field message code }
                }
            }
        `

        const variables = {
            email: customer.email,
            password: customer.password
        }

        const { response, data } = await graphqlRequest( request, mutation, variables );
        // console.log(data);

        customerToken = data.tokenCreate.token;

        // const mutation = `
        //     mutation AccountDeletionRequest($channel: String, $redirectUrl: String!){
        //         accountRequestDeletion(channel: $channel, redirectUrl: $redirectUrl){
        //             errors { field message code }
        //         }
        //     }
        // `
        // const variable = {
        //     channel: "default-channel",
        //     redirectUrl: "https://saleor.solception.com/confirm"
        // }

        // const { response, data } = await graphqlRequest(request, mutation );
        // console.log(data);

    })

    test('deletes a user account', async ({ request  }) => {
        const mutation =
            `
            mutation DeleteAccount($token: String!){
                accountDelete(token: $token){
                    user { id email firstName lastName }
                    errors { field message code }
                }
            }
        `

        const variables = {
            token: customerToken
        }

        const { response, data } = await graphqlRequest(request, mutation, variables, customerToken );
        console.log(data);
    })
})