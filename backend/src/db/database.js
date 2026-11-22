import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'schema.sql');

/**
 * Inicializa a conexão com o SQLite e aplica o schema das tabelas.
 * Aceita ":memory:" para rodar testes automatizados sem sujar o disco.
 */
export function createDatabase(dbPath = './seu-bigode.db') {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  const schemaSql = readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schemaSql);

  return db;
}
