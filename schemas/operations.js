'use strict';
// One schema per operation you assert on. Keep each in lock-step with the query's SELECTION SET:
// obj() is strict, so selecting a new field without adding it here fails (on purpose).
const H = require('./helpers');
const { obj, arr, str, bool, id, email, dateTime, money, jwt, numericString, nullable, connection, gqlEnum, error, currency, ok, failed } = H;

// tokenCreate: success and failure are different shapes, expressed as an invariant.
const tokenPayload = obj({
  token: nullable(jwt),
  refreshToken: nullable(jwt),
  user: nullable(obj({ id, email, isStaff: bool })),
  errors: arr(error()),
});
tokenPayload.if = { type: 'object', properties: { errors: { type: 'array', maxItems: 0 } } };
tokenPayload.then = { type: 'object', properties: { token: { type: 'string' }, user: { type: 'object' } } };
tokenPayload.else = { type: 'object', properties: { token: { type: 'null' }, user: { type: 'null' } } };

module.exports = {
  graphqlFailure: failed,

  shop: ok({ shop: obj({ name: str, domain: obj({ host: str }) }) }),

  tokenCreate: ok({ tokenCreate: tokenPayload }),

  channels: ok({
    channels: arr(obj({ id, name: str, slug: str, isActive: bool, currencyCode: currency }), { minItems: 1 }),
  }),

  productsPage: ok({
    products: connection(obj({ id, name: str }), { totalCount: true, cursor: true }),
  }),

  // Shape observed in build #53 stdout. Enum fallbacks are replaced by live values once you run schema:snapshot.
  checkoutComplete: ok({
    checkoutComplete: obj({
      order: nullable(obj({
        id,
        number: numericString,
        status: gqlEnum('OrderStatus', ['DRAFT', 'UNCONFIRMED', 'UNFULFILLED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'PARTIALLY_RETURNED', 'RETURNED', 'CANCELED', 'EXPIRED']),
        chargeStatus: gqlEnum('OrderChargeStatusEnum', ['NONE', 'PARTIAL', 'FULL', 'OVERCHARGED']),
        isPaid: bool,
        created: dateTime,
        total: obj({ currency, gross: money }),
      })),
      confirmationNeeded: bool,
      errors: arr(error()),
    }),
  }),
};
