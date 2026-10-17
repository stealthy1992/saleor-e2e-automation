const { getPolicyText, getProductByName, getCurrentApp } = require('./saleor');

(async () => {
  const policy = await getPolicyText();
  const lines = policy.split('\n');
  const headers = lines.filter((l) => l.startsWith('#')).length;
  const clauses = lines.filter((l) => /^\d+\.\d+ /.test(l)).length;
  console.log(`policy: lines=${lines.length} headers=${headers} clauses=${clauses}`);
  console.log(`policy first line: ${lines[0]}`);

  const product = await getProductByName('Tulip & Teak Jeans');
  if (!product) {
    console.log('product: NOT FOUND in channel');
  } else {
    for (const v of product.variants) {
      const p = v.pricing && v.pricing.price && v.pricing.price.gross;
      console.log(`product: ${product.name} | variant "${v.name}" | ${p ? p.amount + ' ' + p.currency : 'no price'} | available ${v.quantityAvailable}`);
    }
  }

  if (!process.env.SALEOR_APP_TOKEN) {
    console.log('app: skipped (SALEOR_APP_TOKEN not set)');
  } else {
    const app = await getCurrentApp();
    console.log(`app: ${app.name} | permissions: ${app.permissions.map((x) => x.code).join(', ')}`);
  }
})().catch((e) => {
  console.error('check failed:', e.message);
  process.exit(1);
});