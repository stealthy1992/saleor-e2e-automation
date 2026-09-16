const { test, expect } = require('../../fixtures/auth');
const { graphqlRequest } = require('../../utils/graphql-client');

test.describe.serial('This will add, update, and remove channel', () => {
    let channelID;
    test('This will create a channel', async ({ request, staffToken }) => {
        const mutation =
            `
            mutation CreateChannel($input: ChannelCreateInput!){
                channelCreate(input: $input){
                    channel{
                        id slug name isActive
                    }
                    errors{ field message code }
                }
            }
        `

        const variables = {
            input: {
                isActive: true,
                name: 'North America',
                slug: 'north-america',
                currencyCode: "USD",
                defaultCountry: "US"
            }
        }

        const { response, data } = await graphqlRequest(request, mutation, variables, staffToken);
        expect(response.ok()).toBeTruthy();
        console.log(data);
        channelID = data.channelCreate.channel.id;
    })

    test('This will update a channel', async ({ request, staffToken }) => {
        const mutation =
            `
            mutation UpdateChannel($id: ID!, $input: ChannelUpdateInput!){
                channelUpdate(id: $id, input: $input){
                    channel{
                        id slug name isActive
                    }
                    errors{ field message code }
                }
            }
        `

        const variables = {
            id: channelID,
            input: {
                isActive: false,
                name: 'North America',
                slug: 'north-america',
                defaultCountry: "US"

            }
        }

        const { response, data } = await graphqlRequest(request, mutation, variables, staffToken );
        expect(response.ok()).toBeTruthy();
        expect(data.channelUpdate.channel.isActive).toBe(false);
    })

    test('This will delete a channel', async ({request, staffToken}) => {
        const mutation = 
        `
            mutation DeleteChannel($id: ID!, $input: ChannelDeleteInput){
                channelDelete(id: $id, input: $input){
                    errors{ code message field }
                }
            }
        `

        const variables = {
            id: channelID,
            input: {
                channelId: "Q2hhbm5lbDox"
            }
        }

        const { resposne, data } = await graphqlRequest(request, mutation, variables, staffToken);
        console.log(data);
        expect(data.channelDelete.errors).toEqual([])
    })
})