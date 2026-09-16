const { test: authTest } = require('./auth');
const { request: pwRequest } = require('@playwright/test');
const { graphqlRequest } = require('../utils/graphql-client');
const pollForConfirmationEmail = require('../utils/confirmationToken');

exports.test = authTest.extend({
    limitedPermissionGroup: [
        async ({ staffToken }, use) => {
            const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });
            // Bug fix: addUsers: [staff.id] referenced a user that doesn't exist yet —
            // limitedPermissionGroup is created BEFORE limitedStaff in the dependency
            // chain, so `staff` was never in scope. Group membership is handled on the
            // staffCreate side instead (addGroups: [group.id]), so addUsers is dropped
            // here entirely rather than papered over with a forward reference.
            const { data: groupCreation } = await graphqlRequest(ctx, `
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
                    addChannels: ["Q2hhbm5lbDox"],
                    name: "New Custom Group",
                    restrictedAccessToChannels: true
                }
            }, staffToken);
            if (groupCreation.permissionGroupCreate.errors.length) {
                throw new Error(`limitedPermissionGroup fixture failed: ${JSON.stringify(groupCreation.permissionGroupCreate.errors)}`);
            }
            const group = groupCreation.permissionGroupCreate.group;
            await use(group);

            const { data: groupDeletion } = await graphqlRequest(ctx, `
                    mutation PermissionGroupDelete($id: ID!){
                        permissionGroupDelete(id: $id){
                            group { id name permissions { code name } }
                            errors { field code message }
                        }
                    }
                `, { id: group.id }, staffToken);
            if (groupDeletion.permissionGroupDelete.errors.length) {
                console.error(
                    `limitedPermissionGroup fixture teardown: permissionGroupDelete failed for ${group.id}: ` +
                    JSON.stringify(groupDeletion.permissionGroupDelete.errors)
                );
            }
            await ctx.dispose();
        },
        { scope: 'worker' },
    ],

    limitedStaff: [
        async ({ staffToken, limitedPermissionGroup }, use) => {
            const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });
            const limitedStaffInput = {
                firstName: "Auto Deleted Limited Access",
                password: "12345678",
                lastName: "User",
                email: `limited-staff-${Date.now()}@tester.com`,
                isActive: true,
            };
            // Bug fix: was hardcoded to "R3JvdXA6MTk=" (a fixed group ID from the old VPS
            // DB) instead of the group actually created by limitedPermissionGroup in this
            // run. Since there's no DB backup, that literal ID doesn't even exist locally.
            const { data: staffData } = await graphqlRequest(ctx, `
                mutation staffCreation($input: StaffCreateInput!){
                    staffCreate(input: $input){
                        user { id email firstName lastName isStaff isActive userPermissions { code name } accessibleChannels { id name }}
                        errors { field message code permissions groups users }
                    }
                }
            `, {
                input: {
                    firstName: limitedStaffInput.firstName,
                    lastName: limitedStaffInput.lastName,
                    email: limitedStaffInput.email,
                    isActive: limitedStaffInput.isActive,
                    addGroups: [limitedPermissionGroup.id],
                    redirectUrl: "http://localhost:9000/staff-setup"
                }
            }, staffToken);
            if (staffData.staffCreate.errors.length) {
                throw new Error(`limitedStaff fixture failed: ${JSON.stringify(staffData.staffCreate.errors)}`);
            }
            // Keep password alongside the returned user — limitedStaffToken needs it
            // and the API will never echo it back.
            const staff = { ...staffData.staffCreate.user, password: limitedStaffInput.password };
            await use(staff);

            const { data: staffDeletion } = await graphqlRequest(ctx, `
                    mutation StaffDelete($id: ID!){
                        staffDelete(id: $id){
                            user { id email firstName lastName isStaff }
                            errors { code field message }
                        }
                    }
                `, { id: staff.id }, staffToken);
            if (staffDeletion.staffDelete.errors.length) {
                console.error(
                    `limitedStaff fixture teardown: staffDelete failed for ${staff.email}: ` +
                    JSON.stringify(staffDeletion.staffDelete.errors)
                );
            }
            await ctx.dispose();
        },
        { scope: 'worker' },
    ],

    limitedStaffToken: [
        async ({ limitedStaff }, use) => {
            const ctx = await pwRequest.newContext({ baseURL: process.env.SALEOR_API_URL });
            // Bug fix: was pollForConfirmationEmail(limitedStaff.email) destructured as
            // `{ token: inviteToken }`, then the mutation below used `request` (undefined —
            // should be `ctx`) and `token` (undefined — the actual value was in
            // `inviteToken`). Both were stale references from a copy-paste off a
            // differently-shaped fixture.
            const { token: inviteToken } = await pollForConfirmationEmail(limitedStaff.email);
            const { data } = await graphqlRequest(ctx, `
                mutation SetPassword($email: String!, $password: String!, $token: String!){
                    setPassword(email: $email, password: $password, token: $token){
                        token refreshToken csrfToken 
                        user { id email isStaff isActive firstName lastName isConfirmed }
                        errors { field message code }
                    }
                }
            `, { email: limitedStaff.email, password: limitedStaff.password, token: inviteToken });
            if (data.setPassword.errors.length) {
                throw new Error(`limitedStaffToken fixture failed: ${JSON.stringify(data.setPassword.errors)}`);
            }
            const loginToken = data.setPassword.token;
            await use(loginToken);
            await ctx.dispose();
        },
        { scope: 'worker' },
    ],
});
exports.expect = authTest.expect;