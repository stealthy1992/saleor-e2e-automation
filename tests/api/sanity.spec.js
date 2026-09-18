const { test, expect } = require('@playwright/test');
const { query } = require('../../utils/db-client');

test.describe('DB connectivity - sanity check', () => {
  test('staff account exists in Postgres', async () => {
    const rows = await query(
      'SELECT email, is_staff FROM account_user WHERE email = $1',
      [process.env.ADMIN_EMAIL]
    );
    // console.log(rows);
    expect(rows.length).toBe(1);
    expect(rows[0].is_staff).toBe(true);
  });

  test('fetch total number of products', async () => {
    const products = await query(
      'SELECT name, category_id FROM product_product LIMIT 50'
    );
    // console.log(rows);
    expect(products.length).toBeGreaterThan(0);
    for(let product of products){
        expect(product.name).not.toBe('');
        expect(product.category_id).not.toBeNull();
        console.log(`Product name is ${product.name} and category ID is ${product.category_id}`);
    }
  })

  test('Product channels do exist and have an associated product ID', async () => {
    const channels = await query(
        'SELECT channel_id, product_id FROM product_productchannellisting'
    )
    expect(channels.length).not.toBe(0);
    for(let channel of channels){
        expect(channel.channel_id).not.toBeNull();
        expect(channel.product_id).not.toBeNull();
        console.log(`Channel ${channel.channel_id} has associated product ID ${channel.product_id}`);
    }
  })

});