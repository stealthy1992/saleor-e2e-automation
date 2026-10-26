# SCRUM-15 kit

Files (paths mirror the repo): utils/{schema-validator,schema-matchers,schema-from-query,response-validator}.js,
schemas/{helpers,operations}.js, scripts/{snapshot-schema,schema-coverage-report}.js,
tests/api/{contract,schema-drift,schema-generator}.spec.js

npm i -D ajv ajv-formats graphql@16
package.json: "schema:snapshot": "node scripts/snapshot-schema.js",
              "test:contract": "playwright test --project=api --grep @contract",
              "schema:coverage": "node scripts/schema-coverage-report.js"

## Wiring into graphql-client.js (one call after the response is parsed)
  const { validateResponse } = require('../utils/response-validator');
  ...
  const body = await res.json();
  validateResponse(query, body);      // throws SchemaValidationError (strict) - SCHEMA_VALIDATE=warn|off to relax
  return body;
