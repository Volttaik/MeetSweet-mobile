const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.resolve(__dirname, '..', 'migrations', '001_missing_schema.sql');

function getConfig(env = process.env) {
  const databaseUrl = env.TURSO_DATABASE_URL;
  const authToken = env.TURSO_AUTH_TOKEN;

  if (!databaseUrl || !authToken) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be provided by the environment.');
  }

  const baseUrl = databaseUrl.replace(/^libsql:/, 'https:').replace(/\/+$/, '');
  return { endpoint: `${baseUrl}/v2/pipeline`, authToken };
}

async function execute(endpoint, authToken, sqlStatements) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: sqlStatements.map((sql) => ({
        type: 'execute',
        stmt: { sql },
      })),
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Turso request failed with HTTP ${response.status}.`);
  }

  for (const result of body?.results ?? []) {
    if (result.type !== 'ok' || result.response?.type === 'error') {
      throw new Error(result.response?.error?.message || 'Turso returned a database error.');
    }
  }

  return body?.results ?? [];
}

function rowsFromResult(result) {
  return result?.response?.result?.rows ?? [];
}

async function readSchema(config) {
  const [tablesResult, postsResult] = await execute(config.endpoint, config.authToken, [
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_settings'",
    "SELECT name FROM pragma_table_info('posts') WHERE name = 'unlock_price'",
  ]);

  return {
    hasUserSettings: rowsFromResult(tablesResult).length === 1,
    hasUnlockPrice: rowsFromResult(postsResult).length === 1,
  };
}

function printSchemaStatus(schema) {
  console.log(
    `Turso schema check: posts.unlock_price=${schema.hasUnlockPrice ? 'present' : 'missing'}, ` +
      `user_settings=${schema.hasUserSettings ? 'present' : 'missing'}`,
  );
}

async function run(command = process.argv[2] || 'check', env = process.env) {
  if (!['check', 'migrate'].includes(command)) {
    throw new Error('Usage: node scripts/turso-migrate.js <check|migrate>');
  }

  const config = getConfig(env);
  const before = await readSchema(config);

  if (command === 'migrate') {
    const migrationSql = fs
      .readFileSync(migrationPath, 'utf8')
      .split(/;\s*(?=\n|$)/)
      .map((statement) => statement.replace(/^\s*--.*$/gm, '').trim())
      .filter(Boolean);

    const statementsToRun = [];
    if (!before.hasUnlockPrice) statementsToRun.push(migrationSql[0]);
    if (!before.hasUserSettings) statementsToRun.push(migrationSql[1]);

    if (statementsToRun.length > 0) {
      await execute(config.endpoint, config.authToken, statementsToRun);
      console.log(`Applied ${statementsToRun.length} Turso migration statement(s).`);
    } else {
      console.log('Turso schema is already up to date.');
    }
  }

  const after = await readSchema(config);
  printSchemaStatus(after);

  if (!after.hasUnlockPrice || !after.hasUserSettings) {
    throw new Error('Turso schema verification failed.');
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`Database setup failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { run };