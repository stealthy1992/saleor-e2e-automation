require('dotenv').config();
const { request: pwRequest } = require('@playwright/test');
const { graphqlRequest } = require('../utils/graphql-client');
const pollForConfirmationEmail = require('../utils/confirmationToken');

async function main() {
    const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });

    const { data: authData } = await graphqlRequest(ctx, `
        mutation TokenCreate($email: String!, $password: String!) {
            tokenCreate(email: $email, password: $password) { token errors { field message code } }
        }
    `, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
    if (authData.tokenCreate.errors.length) throw new Error(`Admin auth failed: ${JSON.stringify(authData.tokenCreate.errors)}`);
    const staffToken = authData.tokenCreate.token;

    const { data: groupData } = await graphqlRequest(ctx, `
        mutation PermissionGroupCreate($input: PermissionGroupCreateInput!) {
            permissionGroupCreate(input: $input) { group { id name } errors { field message code } }
        }
    `, {
        input: { addPermissions: ["MANAGE_PRODUCTS"], name: "Standing Limited-Access QA Group", restrictedAccessToChannels: false }
    }, staffToken);
    if (groupData.permissionGroupCreate.errors.length) throw new Error(`Group creation failed: ${JSON.stringify(groupData.permissionGroupCreate.errors)}`);
    const groupId = groupData.permissionGroupCreate.group.id;

    const email = 'limited-staff-standing@tester.com'; // permanent, not timestamped — this account persists across runs
    const { data: staffData } = await graphqlRequest(ctx, `
        mutation StaffCreate($input: StaffCreateInput!) {
            staffCreate(input: $input) { user { id email } errors { field message code } }
        }
    `, {
        input: { firstName: "Standing", lastName: "Limited Access", email, isActive: true, addGroups: [groupId], redirectUrl: "http://localhost:9000/staff-setup" }
    }, staffToken);
    if (staffData.staffCreate.errors.length) throw new Error(`Staff creation failed: ${JSON.stringify(staffData.staffCreate.errors)}`);

    const { token: inviteToken } = await pollForConfirmationEmail(email);
    const password = '12345678';
    const { data: pwData } = await graphqlRequest(ctx, `
        mutation SetPassword($email: String!, $password: String!, $token: String!) {
            setPassword(email: $email, password: $password, token: $token) { token errors { field message code } }
        }
    `, { email, password, token: inviteToken });
    if (pwData.setPassword.errors.length) throw new Error(`setPassword failed: ${JSON.stringify(pwData.setPassword.errors)}`);

    console.log('\n✅ Standing limited-access account ready. Add these to .env:\n');
    console.log(`LIMITED_ACCESS_USER_EMAIL=${email}`);
    console.log(`LIMITED_ACCESS_USER_PASSWORD=${password}`);
    await ctx.dispose();
}

main().catch(err => { console.error(err); process.exit(1); });