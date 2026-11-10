// Clientes, veículos e planos de exemplo.  Uso: npm run seed
// Os planos apontam para os _id fixos das garagens do seed do MongoDB.
require('dotenv').config();
const { pool, withTransaction, initSchema } = require('./db');

const PAULISTA = '6720a0000000000000000001';
const PINHEIROS = '6720a0000000000000000002';
const CAMPINAS = '6720a0000000000000000003';

const CLIENTES = [
  {
    nome: 'Carla Mendes',
    cpf: '10120230344',
    email: 'carla@exemplo.com',
    telefone: '(11) 98888-1001',
    veiculos: [{ placa: 'CAR1A11', modelo: 'Onix', cor: 'Prata', tipo: 'CARRO' }],
    planos: [{ garagem_id: PAULISTA, valor_mensal: 350 }],
  },
  {
    nome: 'Davi Rocha',
    cpf: '20230340455',
    email: 'davi@exemplo.com',
    veiculos: [{ placa: 'MOT2B22', modelo: 'CG 160', cor: 'Vermelha', tipo: 'MOTO' }],
    planos: [],
  },
  {
    nome: 'Empresa Logística Norte',
    cpf: '30340450566',
    telefone: '(19) 3333-2002',
    veiculos: [
      { placa: 'VAN3C33', modelo: 'Sprinter', cor: 'Branca', tipo: 'UTILITARIO' },
      { placa: 'FRT3D44', modelo: 'Strada', cor: 'Branca', tipo: 'CARRO' },
    ],
    planos: [{ garagem_id: CAMPINAS, valor_mensal: 520 }],
  },
  {
    nome: 'Beatriz Lima',
    cpf: '40450560677',
    email: 'bia@exemplo.com',
    veiculos: [{ placa: 'BIA4E55', modelo: 'HB20', cor: 'Azul', tipo: 'CARRO' }],
    planos: [{ garagem_id: PINHEIROS, valor_mensal: 280 }],
  },
];

async function popular({ somenteSeVazio = false } = {}) {
  if (somenteSeVazio) {
    const { rows } = await pool.query('SELECT EXISTS (SELECT 1 FROM clientes) AS tem');
    if (rows[0].tem) return 0;
  }
  await withTransaction(async (tx) => {
    for (const c of CLIENTES) {
      const { rows } = await tx.query(
        `INSERT INTO clientes (nome, cpf, email, telefone) VALUES ($1, $2, $3, $4)
         ON CONFLICT (cpf) DO UPDATE SET nome = EXCLUDED.nome RETURNING id`,
        [c.nome, c.cpf, c.email, c.telefone],
      );
      const id = rows[0].id;
      for (const v of c.veiculos) {
        await tx.query(
          `INSERT INTO veiculos (cliente_id, placa, modelo, cor, tipo) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (placa) DO NOTHING`,
          [id, v.placa, v.modelo, v.cor, v.tipo],
        );
      }
      for (const p of c.planos) {
        await tx.query(
          `INSERT INTO planos (cliente_id, garagem_id, valor_mensal) VALUES ($1, $2, $3)
           ON CONFLICT (cliente_id, garagem_id) WHERE ativo DO NOTHING`,
          [id, p.garagem_id, p.valor_mensal],
        );
      }
    }
  });
  console.log(`Seed: ${CLIENTES.length} clientes de exemplo inseridos`);
  return CLIENTES.length;
}

module.exports = { popular };

if (require.main === module) {
  initSchema()
    .then(() => popular())
    .then(() => pool.end())
    .catch(async (err) => {
      console.error(err.message);
      await pool.end();
      process.exit(1);
    });
}
