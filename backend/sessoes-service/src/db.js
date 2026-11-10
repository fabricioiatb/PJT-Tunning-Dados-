const fs = require('fs');
const path = require('path');
const cassandra = require('cassandra-driver');

const { types } = cassandra;
const KEYSPACE = process.env.CASSANDRA_KEYSPACE || 'garagem_sessoes';

const opcoes = {
  contactPoints: (process.env.CASSANDRA_CONTACT_POINTS || 'localhost').split(','),
  localDataCenter: process.env.CASSANDRA_LOCAL_DATA_CENTER || 'datacenter1',
  // Num cluster real seria LOCAL_QUORUM; com 1 nó, ONE e QUORUM equivalem.
  queryOptions: { consistency: types.consistencies.localQuorum, prepare: true },
};

let client;

// Aplica o schema.cql (cada comando separado por ';'). O nome do keyspace no
// arquivo é substituído pelo configurado em CASSANDRA_KEYSPACE.
async function aplicarSchema(c) {
  const cql = fs
    .readFileSync(path.join(__dirname, '..', 'db', 'schema.cql'), 'utf8')
    .replace(/^\s*--.*$/gm, '')
    .replace(/garagem_sessoes/g, KEYSPACE);
  for (const stmt of cql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    await c.execute(stmt);
  }
}

// O Cassandra leva ~1 min para aceitar conexões depois do docker-compose up.
async function conectar({ tentativas = 30, intervaloMs = 3000 } = {}) {
  for (let i = 1; ; i++) {
    const semKeyspace = new cassandra.Client(opcoes);
    try {
      await semKeyspace.connect();
      await aplicarSchema(semKeyspace);
      await semKeyspace.shutdown();
      break;
    } catch (err) {
      await semKeyspace.shutdown().catch(() => {});
      if (i === tentativas) throw err;
      console.log(
        `Cassandra indisponível (${err.message.split('\n')[0]}), tentando de novo em ${intervaloMs}ms... [${i}/${tentativas}]`,
      );
      await new Promise((r) => setTimeout(r, intervaloMs));
    }
  }
  client = new cassandra.Client({ ...opcoes, keyspace: KEYSPACE });
  await client.connect();
  return client;
}

const db = () => client;

// --- conversões entre JS e tipos do Cassandra -------------------------------

// decimal: o driver usa BigDecimal; na API trabalhamos com number.
const dec = (n) => (n == null ? null : types.BigDecimal.fromString(String(n)));
const num = (d) => (d == null ? null : Number(d.toString()));

// date (partição diária, em UTC): 'YYYY-MM-DD' <-> LocalDate
const diaDe = (date) => types.LocalDate.fromString(new Date(date).toISOString().slice(0, 10));

module.exports = { conectar, db, types, dec, num, diaDe, KEYSPACE };
