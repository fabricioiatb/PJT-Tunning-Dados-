const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// DATE -> string "YYYY-MM-DD" (sem isso o driver converte para Date no fuso
// local e a data pode "voltar" um dia ao virar JSON em UTC).
types.setTypeParser(1082, (v) => v);
// NUMERIC -> number (por padrão vem como string para não perder precisão;
// para valores monetários de 2 casas o float do JS é suficiente aqui).
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

const pool = new Pool({
  // Padrão = docker-compose rodando localmente (funciona mesmo sem .env).
  connectionString: process.env.DATABASE_URL || 'postgresql://garagem:garagem@localhost:5433/garagem_clientes',
  max: 10,
  // CURRENT_DATE (início/fim dos planos) no fuso do Brasil, não em UTC.
  options: `-c TimeZone=${process.env.DB_TIMEZONE || 'America/Sao_Paulo'}`,
});

// Executa uma função dentro de uma transação (BEGIN / COMMIT / ROLLBACK).
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Aplica o schema.sql (idempotente). Tenta algumas vezes porque o Postgres
// pode ainda estar subindo quando o serviço inicia junto com o docker-compose.
async function initSchema({ tentativas = 10, intervaloMs = 2000 } = {}) {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  for (let i = 1; i <= tentativas; i++) {
    try {
      await pool.query(sql);
      return;
    } catch (err) {
      if (i === tentativas) throw err;
      console.log(
        `Postgres indisponível (${err.code || err.message}), tentando de novo em ${intervaloMs}ms... [${i}/${tentativas}]`,
      );
      await new Promise((r) => setTimeout(r, intervaloMs));
    }
  }
}

module.exports = { pool, withTransaction, initSchema };
