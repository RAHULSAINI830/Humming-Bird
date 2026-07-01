const { parentPort } = require('node:worker_threads');
const { Client } = require('pg');

const encoder = new TextEncoder();

let clientPromise = null;
let loggedDatabaseHost = false;

function databaseHostForLog() {
  try {
    const parsed = new URL(process.env.DATABASE_URL || '');
    return `${parsed.hostname}:${parsed.port || '5432'}`;
  } catch {
    return 'invalid DATABASE_URL';
  }
}

async function getClient() {
  if (!clientPromise) {
    if (!loggedDatabaseHost) {
      loggedDatabaseHost = true;
      console.log(`Hummingbird Postgres connecting to ${databaseHostForLog()}`);
    }

    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/i.test(process.env.DATABASE_URL)
        ? { rejectUnauthorized: false }
        : undefined
    });
    clientPromise = client.connect().then(() => client);
  }

  return clientPromise;
}

function writeResponse(message, payload) {
  const control = new Int32Array(message.controlBuffer);
  const response = new Uint8Array(message.responseBuffer);
  const bytes = encoder.encode(JSON.stringify(payload));

  if (bytes.length > response.length) {
    const fallback = encoder.encode(JSON.stringify({
      ok: false,
      error: `Postgres response exceeded ${response.length} bytes. Narrow the query or increase POSTGRES_SYNC_RESPONSE_BYTES.`
    }));
    response.set(fallback.slice(0, response.length));
    Atomics.store(control, 1, Math.min(fallback.length, response.length));
  } else {
    response.set(bytes);
    Atomics.store(control, 1, bytes.length);
  }

  Atomics.store(control, 0, 1);
  Atomics.notify(control, 0, 1);
}

async function handle(message) {
  try {
    const client = await getClient();

    if (message.type === 'tableInfo') {
      const result = await client.query(
        `
          SELECT column_name AS name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
          ORDER BY ordinal_position
        `,
        [message.tableName]
      );
      writeResponse(message, { ok: true, data: { rows: result.rows } });
      return;
    }

    const result = await client.query(message.sql, message.params || []);
    writeResponse(message, {
      ok: true,
      data: {
        rows: result.rows || [],
        rowCount: result.rowCount || 0
      }
    });
  } catch (error) {
    writeResponse(message, {
      ok: false,
      error: error.message,
      code: error.code || ''
    });
  }
}

parentPort.on('message', (message) => {
  handle(message);
});
