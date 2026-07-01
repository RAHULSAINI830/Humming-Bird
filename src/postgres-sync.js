const { Worker } = require('node:worker_threads');

const RESPONSE_BYTES = Number(process.env.POSTGRES_SYNC_RESPONSE_BYTES || 128 * 1024 * 1024);

function rewritePlaceholders(sql) {
  let index = 0;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  return String(sql).replace(/./g, (char) => {
    if (escaped) {
      escaped = false;
      return char;
    }

    if (char === '\\') {
      escaped = true;
      return char;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      return char;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      return char;
    }

    if (char === '?' && !inSingle && !inDouble) {
      index += 1;
      return `$${index}`;
    }

    return char;
  });
}

function rewriteSql(sql, { returning = false } = {}) {
  let next = String(sql || '').trim();

  if (!next) return next;

  next = next.replace(/\bAUTOINCREMENT\b/gi, '');
  next = next.replace(/\bINTEGER\s+PRIMARY\s+KEY\s*(?=,|\))/gi, 'SERIAL PRIMARY KEY');
  next = next.replace(/\bTEXT\s+NOT\s+NULL\s+DEFAULT\s+CURRENT_TIMESTAMP\b/gi, 'TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP');
  next = next.replace(/\bTEXT\s+DEFAULT\s+CURRENT_TIMESTAMP\b/gi, 'TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP');
  next = next.replace(/\bDATETIME\b/gi, 'TIMESTAMP');
  next = next.replace(/datetime\(([^)]+)\)/gi, '$1');
  next = next.replace(/group_concat\(DISTINCT\s+([^),]+)\)/gi, "string_agg(DISTINCT $1, ',')");
  next = next.replace(/group_concat\(([^),]+)\)/gi, "string_agg($1, ',')");
  next = next.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, 'INSERT INTO');
  next = rewritePlaceholders(next);

  const isInsert = /^\s*INSERT\s+INTO/i.test(next);
  const hasConflict = /\bON\s+CONFLICT\b/i.test(next);
  const hasReturning = /\bRETURNING\b/i.test(next);

  if (isInsert && !hasConflict && /INSERT\s+OR\s+IGNORE/i.test(String(sql))) {
    next = `${next.replace(/;+\s*$/, '')} ON CONFLICT DO NOTHING`;
  }

  if (returning && isInsert && !hasReturning) {
    next = `${next.replace(/;+\s*$/, '')} RETURNING id`;
  }

  return next;
}

function normalizeValue(value) {
  if (typeof value !== 'string') return value;
  if (/^-?\d+$/.test(value) && value.length < 16) return Number(value);
  if (/^-?\d+\.\d+$/.test(value) && value.length < 24) return Number(value);
  return value;
}

function normalizeRows(rows) {
  return (rows || []).map((row) => {
    const next = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      next[key] = normalizeValue(value);
    });
    return next;
  });
}

class PostgresSyncWorker {
  constructor() {
    this.worker = new Worker(require.resolve('./postgres-worker.js'));
    this.nextId = 1;
  }

  request(payload) {
    const controlBuffer = new SharedArrayBuffer(8);
    const responseBuffer = new SharedArrayBuffer(RESPONSE_BYTES);
    const control = new Int32Array(controlBuffer);
    const response = new Uint8Array(responseBuffer);
    const id = this.nextId++;

    this.worker.postMessage({
      ...payload,
      id,
      controlBuffer,
      responseBuffer
    });

    const timeout = Number(process.env.POSTGRES_SYNC_TIMEOUT || 120000);
    const waitResult = Atomics.wait(control, 0, 0, timeout);

    if (waitResult === 'timed-out') {
      throw new Error('Postgres query timed out.');
    }

    const length = Atomics.load(control, 1);
    const text = Buffer.from(response.slice(0, length)).toString('utf8');
    const result = JSON.parse(text || '{}');

    if (!result.ok) {
      const error = new Error(result.error || 'Postgres query failed.');
      error.code = result.code;
      throw error;
    }

    return result.data;
  }
}

let sharedWorker = null;

function worker() {
  if (!sharedWorker) sharedWorker = new PostgresSyncWorker();
  return sharedWorker;
}

class StatementSync {
  constructor(sql) {
    this.sql = sql;
  }

  all(...params) {
    if (/^\s*PRAGMA\s+table_info\(([^)]+)\)/i.test(this.sql)) {
      const tableName = this.sql.match(/^\s*PRAGMA\s+table_info\(([^)]+)\)/i)[1].replace(/['"`]/g, '').trim();
      const data = worker().request({ type: 'tableInfo', tableName });
      return normalizeRows(data.rows);
    }

    const data = worker().request({
      type: 'query',
      sql: rewriteSql(this.sql),
      params
    });
    return normalizeRows(data.rows);
  }

  get(...params) {
    return this.all(...params)[0];
  }

  run(...params) {
    const data = worker().request({
      type: 'query',
      sql: rewriteSql(this.sql, { returning: true }),
      params
    });
    const rows = normalizeRows(data.rows);
    return {
      changes: data.rowCount || 0,
      lastInsertRowid: rows[0]?.id || 0
    };
  }
}

class DatabaseSync {
  constructor() {}

  exec(sql) {
    const text = String(sql || '').trim();
    if (!text || /^PRAGMA\b/i.test(text)) return;

    const statements = text
      .split(/;\s*(?=(?:[^']*'[^']*')*[^']*$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      worker().request({
        type: 'query',
        sql: rewriteSql(statement),
        params: []
      });
    }
  }

  prepare(sql) {
    return new StatementSync(sql);
  }
}

module.exports = { DatabaseSync };
