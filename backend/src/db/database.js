import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQLITE_SCHEMA_PATH = join(__dirname, 'schema.sql');
const PG_SCHEMA_PATH = join(__dirname, 'schema.pg.sql');

/**
 * Converte placeholders "?" (SQLite) para "$1, $2, ..." (PostgreSQL),
 * ignorando "?" que estejam dentro de strings entre aspas simples.
 */
export function traduzirPlaceholdersPg(sql) {
  let idx = 0;
  let emTexto = false;
  let saida = '';

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      if (emTexto && sql[i + 1] === "'") {
        saida += "''";
        i++;
        continue;
      }
      emTexto = !emTexto;
      saida += ch;
    } else if (ch === '?' && !emTexto) {
      idx++;
      saida += `$${idx}`;
    } else {
      saida += ch;
    }
  }
  return saida;
}

function criarExecutorSqlite(conn) {
  return {
    type: 'sqlite',
    async get(sql, ...params) {
      return conn.prepare(sql).get(...params);
    },
    async all(sql, ...params) {
      return conn.prepare(sql).all(...params);
    },
    async run(sql, ...params) {
      const res = conn.prepare(sql).run(...params);
      return { changes: Number(res.changes ?? 0) };
    },
    async insert(sql, ...params) {
      const res = conn.prepare(sql).run(...params);
      return Number(res.lastInsertRowid);
    },
    async exec(sql) {
      conn.exec(sql);
    }
  };
}

function criarExecutorPg(runner) {
  return {
    type: 'postgres',
    async get(sql, ...params) {
      const res = await runner.query(traduzirPlaceholdersPg(sql), params);
      return res.rows[0] ?? undefined;
    },
    async all(sql, ...params) {
      const res = await runner.query(traduzirPlaceholdersPg(sql), params);
      return res.rows;
    },
    async run(sql, ...params) {
      const res = await runner.query(traduzirPlaceholdersPg(sql), params);
      return { changes: Number(res.rowCount ?? 0) };
    },
    async insert(sql, ...params) {
      const comReturning = /\bRETURNING\b/i.test(sql)
        ? sql
        : `${sql.trim().replace(/;$/, '')} RETURNING id`;
      const res = await runner.query(traduzirPlaceholdersPg(comReturning), params);
      return Number(res.rows[0]?.id);
    },
    async exec(sql) {
      await runner.query(sql);
    }
  };
}

/**
 * Inicializa o banco de dados:
 * - Se DATABASE_URL estiver definida (produção no Render/Neon), usa PostgreSQL.
 * - Caso contrário, usa SQLite local (ou ":memory:" nos testes).
 */
export async function createDatabase(options = {}) {
  const opts = typeof options === 'string' ? { dbPath: options } : options;
  const databaseUrl = (opts.databaseUrl ?? (opts.dbPath === ':memory:' ? '' : process.env.DATABASE_URL) ?? '').trim();

  if (databaseUrl) {
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
    });

    const schemaSql = readFileSync(PG_SCHEMA_PATH, 'utf-8');
    await pool.query(schemaSql);

    const executor = criarExecutorPg(pool);
    return {
      ...executor,
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const resultado = await fn(criarExecutorPg(client));
          await client.query('COMMIT');
          return resultado;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      },
      async close() {
        await pool.end();
      }
    };
  }

  const dbPath = opts.dbPath || './seu-bigode.db';
  const conn = new DatabaseSync(dbPath);
  conn.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') {
    conn.exec('PRAGMA journal_mode = WAL;');
  }

  const schemaSql = readFileSync(SQLITE_SCHEMA_PATH, 'utf-8');
  conn.exec(schemaSql);

  const executor = criarExecutorSqlite(conn);
  return {
    ...executor,
    async transaction(fn) {
      conn.exec('BEGIN IMMEDIATE');
      try {
        const resultado = await fn(executor);
        conn.exec('COMMIT');
        return resultado;
      } catch (err) {
        try {
          conn.exec('ROLLBACK');
        } catch {
          // transação já encerrada
        }
        throw err;
      }
    },
    async close() {
      conn.close();
    }
  };
}
