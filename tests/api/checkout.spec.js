const { test, expect } = require('../../fixtures/auth');
const { graphqlRequest } = require('../../utils/graphql-client');

test.describe.serial('This will test the entire checkout process', () => {
    let customerToken, checkoutId;
    let customer = {
        email: 'test-user-274356@tester.com',
        password: '12345678',
        firstName: 'Mack',
        lastName: 'Travolta'
    }


    test('this will create customer token and authenticates user', async ({ request }) => {
        const { response, data } = await graphqlRequest(request,
            `
                mutation TokenCreate($email: String!, $password: String!) {
                tokenCreate(email: $email, password: $password) {
                    token
                    errors { field message code }
                }
            }
            `
            , { email: customer.email, password: customer.password },)

        customerToken = data.tokenCreate.token;

    })

    test('this will create a checkout', async ({ request }) => {
        const mutation =
            `
            mutation CreateCheckout($input: CheckoutCreateInput!){
                checkoutCreate(input: $input){
                    checkout { 
                        id created updatedAt quantity email
                        user { id email firstName lastName isStaff isActive isConfirmed } 
                        lines { id quantity variant { id name sku } }
                        shippingAddress { 
                            firstName
                            lastName
                            streetAddress1
                            streetAddress2
                            city
                            country { code country }
                    
                        }
                        billingAddress {
                            firstName
                            lastName
                            streetAddress1
                            streetAddress2
                            city
                            country { code country }
                        }
                        shippingMethods { id name description maximumDeliveryDays minimumDeliveryDays active  }
                        delivery { id shippingMethod { id name }}
                    }
                    errors { field, message, code }
                }
            }
        `

        const variables = {
            input: {
                email: customer.email,
                channel: 'default-channel',
                lines: [
                    {
                        quantity: 1,
                        variantId: 'UHJvZHVjdFZhcmlhbnQ6MzU4'
                    }
                ],
                shippingAddress: {
                    firstName: customer.firstName,
                    lastName: customer.lastName,
                    streetAddress1: "350 5th Avenue",
                    streetAddress2: "Suite 7500",
                    city: "New York",
                    countryArea: "NY",
                    postalCode: "10118",
                    country: "US"
                },
                saveBillingAddress: true,
                billingAddress: {
                    firstName: customer.firstName,
                    lastName: customer.lastName,
                    streetAddress1: "350 5th Avenue",
                    streetAddress2: "Suite 7500",
                    city: "New York",
                    countryArea: "NY",
                    postalCode: "10118",
                    country: "US"
                },
            }
        }

        const { response, data } = await graphqlRequest(request, mutation, variables, customerToken);
        // console.log(data);
        console.log(data.checkoutCreate.errors);
        checkoutId = data.checkoutCreate.checkout.id;
        console.log('Checkout ID is: ',checkoutId);
        // console.log('User is: ', data.checkoutCreate.checkout.user);
        // console.log('Line items are: ', data.checkoutCreate.checkout.lines);
        // console.log('Billing address is: ', data.checkoutCreate.checkout.billingAddress)
        // console.log('Shipping address is: ', data.checkoutCreate.checkout.shippingAddress)

    })

    test('Updates the shipping method of the checkout', async ({ request }) => {

        const { response, data } = await graphqlRequest(request, `
                mutation CheckoutDeliveryMethodUpdate($id: ID, $deliveryMethodId: ID){
                    checkoutDeliveryMethodUpdate(id: $id, deliveryMethodId: $deliveryMethodId){
                        checkout { 
                            id created updatedAt quantity email
                            user { id email firstName lastName isStaff isActive isConfirmed } 
                            lines { id quantity variant { id name sku } }
                            shippingAddress { 
                                firstName
                                lastName
                                streetAddress1
                                streetAddress2
                                city
                                country { code country }
                        
                            }
                            billingAddress {
                                firstName
                                lastName
                                streetAddress1
                                streetAddress2
                                city
                                country { code country }
                            }
                            delivery { id shippingMethod { id name }}
                        }
                        errors { field message code }
                    }
                }
            `, { deliveryMethodId: "U2hpcHBpbmdNZXRob2Q6MTU=", id: checkoutId}, customerToken);

            console.log(data.checkoutDeliveryMethodUpdate.checkout.delivery);
    })

    test('Creates a new payment for given checkout.', async ({ request }) => {
        const { response, data } = await graphqlRequest(request, `
                mutation CheckoutPaymentCreate($id: ID, $input: PaymentInput!){
                    checkoutPaymentCreate(id: $id, input: $input){
                        checkout { id, created, user { id email firstName } email quantity delivery { id shippingMethod { id, name }} } 
                        payment { id gateway isActive chargeStatus }
                        errors { field code message }
                    }
                }
            `, { id: checkoutId, input: { gateway: "mirumee.payments.dummy", token: "fake-token"}}, customerToken);

        console.log(data);
    })

    test('This will charge the amount and will complete the checkout process', async ({ request }) => {
        const { response, data } = await graphqlRequest(request, `
                mutation CheckoutComplete($id: ID, $redirectUrl: String){
                    checkoutComplete(id: $id, redirectUrl: $redirectUrl){
                        order { id number paymentStatusDisplay chargeStatus created status user { id email firstName } lines { id productName variantName quantity } total { currency gross { currency amount } }isPaid }
                        confirmationNeeded
                        errors { field message code }
                    }
                }
            `, { id: checkoutId, redirectUrl: "http://localhost:9000/order-complete"}, customerToken);
        console.log(data);    
        console.log(data.checkoutComplete.order.total);
    })
})