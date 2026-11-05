// D:\saleor-e2e-automation\langfuse\gen-env.js
// One-off: writes langfuse/.env with random secrets (never overwrites an existing .env).
// Run: node langfuse\gen-env.js   (from D:\saleor-e2e-automation)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '.env');
if (fs.existsSync(target)) {
  console.error('langfuse/.env already exists: not overwriting (the Postgres password in the volume would no longer match).');
  process.exit(1);
}

const hex = (bytes) => crypto.randomBytes(bytes).toString('hex');
const postgresPassword = hex(16);
const minioPassword = hex(16);

const vars = {
  NEXTAUTH_URL: 'http://localhost:3300',
  NEXTAUTH_SECRET: hex(32),
  SALT: hex(16),
  ENCRYPTION_KEY: hex(32), // 64 hex chars, as Langfuse requires
  TELEMETRY_ENABLED: 'false',
  POSTGRES_PASSWORD: postgresPassword,
  DATABASE_URL: `postgresql://postgres:${postgresPassword}@postgres:5432/postgres`,
  CLICKHOUSE_PASSWORD: hex(16),
  REDIS_AUTH: hex(16),
  MINIO_ROOT_PASSWORD: minioPassword,
  LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY: minioPassword,
  LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY: minioPassword,
  LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY: minioPassword,
  // Headless first-run setup: org, project, API keys and a login user
  LANGFUSE_INIT_ORG_ID: 'saleor-qa',
  LANGFUSE_INIT_ORG_NAME: 'Saleor QA',
  LANGFUSE_INIT_PROJECT_ID: 'ops-agent-gate',
  LANGFUSE_INIT_PROJECT_NAME: 'Ops Agent Quality Gate',
  LANGFUSE_INIT_PROJECT_PUBLIC_KEY: `pk-lf-${crypto.randomUUID()}`,
  LANGFUSE_INIT_PROJECT_SECRET_KEY: `sk-lf-${crypto.randomUUID()}`,
  LANGFUSE_INIT_USER_EMAIL: 'admin@local.test',
  LANGFUSE_INIT_USER_NAME: 'admin',
  LANGFUSE_INIT_USER_PASSWORD: hex(12),
};

const text = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
fs.writeFileSync(target, text, { encoding: 'utf8', mode: 0o600 });
console.log(`Wrote ${target} (${Object.keys(vars).length} variables).`);
console.log('UI: http://localhost:3300  login: admin@local.test  password: LANGFUSE_INIT_USER_PASSWORD in that file');