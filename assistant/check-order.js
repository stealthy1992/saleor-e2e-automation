const { getOrder } = require('./saleor');

(async () => {
  const [number, email, wrongEmail = 'someone.else@example.com'] = process.argv.slice(2);
  if (!number || !email) {
    console.error('usage: node assistant/check-order.js <orderNumber> <email> [wrongEmail]');
    process.exit(1);
  }

  const order = await getOrder(number, email);
  if (order) {
    const lines = order.lines.map((l) => `${l.quantity}x ${l.productName}`).join(', ');
    console.log(`order ${order.number}: ${order.status} | pay ${order.paymentStatus}/${order.chargeStatus} | total ${order.total.gross.amount} ${order.total.gross.currency} | shipping ${order.shippingPrice.gross.amount} | channel ${order.channel.slug} | ${lines}`);
  } else {
    console.log(`order ${number}: NOT FOUND for that email`);
  }

  const wrong = await getOrder(number, wrongEmail);
  console.log(`wrong email: ${wrong ? 'LEAK - order returned' : 'refused (null)'}`);

  const missing = await getOrder('99999999', email);
  console.log(`unknown number: ${missing ? 'unexpected order returned' : 'null'}`);
})().catch((e) => {
  console.error('check failed:', e.message);
  process.exit(1);
});