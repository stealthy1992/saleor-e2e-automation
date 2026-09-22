const { test, expect } = require('../../fixtures/auth');
const { graphqlRequest } = require('../../utils/graphql-client');
const pollForConfirmationEmail = require('../../utils/confirmationToken');
const { query } = require('../../utils/db-client');
const { request: pwRequest } = require('@playwright/test');

test.describe.serial('This suite will test limited-access user creation and permissions', () => {
    let staffId, limitedStaffToken, productId, data;
    const limitedStaff = {
        firstName: "Auto Deleted Limited Access",
        password: "12345678",
        lastName: "User",
        email: `limited-staff-${Date.now()}@tester.com`,
        isActive: true,
        // addGroups: ["R3JvdXA6MTk="], // "name": "Products management", "permissions": "MANAGE_PRODUCTS"
        // redirectUrl: "https://saleor.solception.com/staff-setup"
    }
    test('this will create a limited-access user', async ({ request, staffToken }) => {
        const { response, data } = await graphqlRequest(request, `
                mutation staffCreation($input: StaffCreateInput!){
                    staffCreate(input: $input){
                        user { id email firstName lastName isStaff isActive userPermissions { code name } accessibleChannels { id name }}
                        errors { field message code permissions groups users }
                    }
                }
            `, {
            input: {
                firstName: limitedStaff.firstName,
                lastName: limitedStaff.lastName,
                email: limitedStaff.email,
                isActive: limitedStaff.isActive,
                addGroups: ["R3JvdXA6MTk="], // "name": "Products management", "permissions": "MANAGE_PRODUCTS"
                redirectUrl: "http://localhost:9000/staff-setup"
            }
        }, staffToken);

        console.log(data);
        staffId = data.staffCreate.user.id;
        expect(data.staffCreate.user.email).toBe(limitedStaff.email);
        expect(data.staffCreate.user.firstName).toBe(limitedStaff.firstName);
        expect(data.staffCreate.user.lastName).toBe(limitedStaff.lastName);
        expect(data.staffCreate.user.isActive).toBe(limitedStaff.isActive);
        expect(data.staffCreate.user.isStaff).toBe(true);
        expect(data.staffCreate.errors).toEqual([]);

        const row = await query('SELECT * FROM account_user WHERE email = $1 LIMIT 1', [limitedStaff.email]);
        console.log('DB returned result is: ', row);

        expect(row[0].is_confirmed).toBe(true);
        expect(row[0].email).toBe(data.staffCreate.user.email);
        expect(row[0].is_staff).toBe(data.staffCreate.user.isStaff);
        expect(row[0].is_active).toBe(data.staffCreate.user.isActive);
        expect(row[0].first_name).toBe(data.staffCreate.user.firstName);
        expect(row[0].last_name).toBe(data.staffCreate.user.lastName);

        // console.log('staff Id is: ', staffId);
    })

    test('This will create a new user group and assign the created staff to it', async ({ request, staffToken }) => {
        const { response, data } = await graphqlRequest(request, `
                mutation PermissionGroupCreate($input: PermissionGroupCreateInput!){
                    permissionGroupCreate(input: $input){
                        group { id name users { id email } permissions {
                        code name 
                        }  userCanManage accessibleChannels { id name }}
                        errors { field message code permissions users channels }
                    }
                }
            `, {
            input: {
                addPermissions: ["MANAGE_PRODUCTS"],
                addUsers: [staffId],
                addChannels: ["Q2hhbm5lbDox"],
                name: `Super Custom Group ${Date.now()}`,
                restrictedAccessToChannels: true
            }
        }, staffToken);

        console.log('Permission group result is: ', data.permissionGroupCreate.errors);
    })

    test('This will set password for the limited-access staff', async ({ request }) => {
        const { email, token } = await pollForConfirmationEmail(limitedStaff.email);
        const { data } = await graphqlRequest(request, `
                mutation SetPassword($email: String!, $password: String!, $token: String!){
                    setPassword(email: $email, password: $password, token: $token){
                        token refreshToken csrfToken 
                        user { id email isStaff isActive firstName lastName isConfirmed }
                        errors { field message code }
                    }
                }
            `, { email: limitedStaff.email, password: limitedStaff.password, token: token })

        console.log(data);
        limitedStaffToken = data.setPassword.token;
        expect(data.setPassword.errors).toEqual([]);
        expect(data.setPassword.token.trim()).not.toBe('');
        expect(data.setPassword.refreshToken.trim()).not.toBe('');
        expect(data.setPassword.csrfToken.trim()).not.toBe('');
        expect(data.setPassword.user.id).toBe(staffId);
        expect(data.setPassword.user.email).toBe(limitedStaff.email);
        expect(data.setPassword.user.firstName).toBe(limitedStaff.firstName);
        expect(data.setPassword.user.lastName).toBe(limitedStaff.lastName);
        expect(data.setPassword.user.isActive).toBe(limitedStaff.isActive);
        expect(data.setPassword.user.isStaff).toBe(true);
        expect(data.setPassword.user.isConfirmed).toBe(true);

    })

    test('This will test if this staff user has ability to create a product', async ({ request }) => {
        const mutation = `
            mutation CreateProduct($input: ProductCreateInput!) {
                productCreate(input: $input) {
                    product { id name slug description }
                    errors { field message }
                }
            }
        `;

        const variables = {
            input: {
                name: 'Limited Staff T-Shirt',
                productType: 'UHJvZHVjdFR5cGU6MjA=',
                category: 'Q2F0ZWdvcnk6Mzg=',
                description: JSON.stringify({
                    time: Date.now(),
                    blocks: [
                        {
                            id: 'test99',
                            type: 'paragraph',
                            data: { text: 'Product created to check limited-access user abilities.' },
                        },
                    ],
                    version: '2.22.2',
                }),
                chargeTaxes: true,
            },
        };

        const { response, data } = await graphqlRequest(request, mutation, variables, limitedStaffToken);
        console.log(data.productCreate.product);
        productId = data.productCreate.product.id;
        expect(data.productCreate.errors).toEqual([]);
        expect(data.productCreate.product.name).not.toBe('');
        expect(data.productCreate.product.slug).not.toBe('');
        expect(data.productCreate.product.description).not.toBe('');
    })

    test('This will test if this staff user has ability to update a product', async ({ request }) => {
        const mutation = `
            mutation ProductUpdate($id: ID!, $input: ProductInput!) {
                productUpdate(id: $id, input: $input) {
                    product { id name slug }
                    errors { field message code }
                }
            }
        `;
        const variables = {
            id: productId,
            input: {
                name: "Updated Limited-Staff T-Shirt"
            }
        }

        const { response, data } = await graphqlRequest(request, mutation, variables, limitedStaffToken);
        console.log(data);
        expect(data.productUpdate.errors).toEqual([]);
        expect(data.productUpdate.product.name).not.toBe('');
        expect(data.productUpdate.product.slug).not.toBe('');

    })

    test('channelCreate is denied — outside MANAGE_PRODUCTS scope', async ({ request }) => {

        await expect(
            graphqlRequest(request, `
                mutation ChannelCreate($input: ChannelCreateInput!){
                    channelCreate(input: $input){
                        channel { id name }
                        errors { field code message }
                    }    
                }
            `, {
                input: {
                    isActive: true,
                    name: 'North America',
                    slug: 'north-america',
                    currencyCode: "USD",
                    defaultCountry: "US"
                }
            }, limitedStaffToken)
        ).rejects.toThrow(/MANAGE_CHANNELS/i);
    })

    test('This will request deletion token to delete limited-access user', async ({ staffToken }) => {

        const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });
        // const limitedUserIdRow = (await query('SELECT * FROM account_user WHERE email = $1', [limitedStaff.email]))[0];
        // console.log('Limited user row is: ', limitedUserIdRow);
        // const graphqlId = Buffer.from(`User:${limitedStaff.id}`).toString('base64');
        const { data: delData } = await graphqlRequest(ctx, `
            mutation StaffDelete($id: ID!) {
                staffDelete(id: $id) {
                    errors { field message code }
                }
            }
        `, { id: staffId }, staffToken); // admin token, not limitedStaffToken
        expect(delData.staffDelete.errors).toEqual([]);
        const row = await query('SELECT * FROM account_user WHERE email = $1', [limitedStaff.email]);
        expect(row).toEqual([]);

    })
})