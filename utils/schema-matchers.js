'use strict';
// require('../../utils/schema-matchers') once in a spec to get:
//   expect(fullResponseBody).toMatchSchema('shop')
//   expect(dataObjectOnly).toMatchDataSchema('checkoutComplete')
const { expect } = require('@playwright/test');
const { validate } = require('./schema-validator');

const make = (dataOnly) =>
  function (received, name) {
    const { valid, errors } = validate(name, received, { dataOnly });
    return {
      pass: valid,
      name: dataOnly ? 'toMatchDataSchema' : 'toMatchSchema',
      message: () => valid
        ? `expected payload NOT to match schema "${name}"`
        : `payload violates schema "${name}":\n  - ${errors.join('\n  - ')}`,
    };
  };

expect.extend({ toMatchSchema: make(false), toMatchDataSchema: make(true) });
