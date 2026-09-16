const { test, expect } = require('../../fixtures/checkout');

test('createOrder fixture produces a real order locally', async ({ createOrder }) => {
    const { orderId, orderNumber } = await createOrder({
        lineItems: [{ name: 'Monospace Tee', quantity: 1 }],
        email: `order-check-${Date.now()}@tester.com`,
    });
    console.log('orderId:', orderId);
    console.log('orderNumber:', orderNumber);
    expect(orderId).toBeTruthy();
    expect(orderNumber).toBeTruthy();
});