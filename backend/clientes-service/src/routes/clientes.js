const { Router } = require('express');
const { pool, withTransaction } = require('../db');
const { notFound } = require('../errors');
const { normalizarCpf, normalizarPlaca, exigir, montarUpdate } = require('../validacao');
const { PLANO_VIGENTE } = require('../sql');

const router = Router();

// Tipo derivado: MENSALISTA se existe plano vigente, senão AVULSO.
const SELECT_CLIENTE = `
  SELECT c.*,
         CASE WHEN EXISTS (
           SELECT 1 FROM planos p WHERE p.cliente_id = c.id AND ${PLANO_VIGENTE}
         ) THEN 'MENSALISTA' ELSE 'AVULSO' END AS tipo,
         (SELECT count(*)::int FROM veiculos v WHERE v.cliente_id = c.id) AS qtd_veiculos
    FROM clientes c`;

// GET /clientes?busca=joao  (busca por nome ou CPF)
router.get('/', async (req, res) => {
  const { busca } = req.query;
  const params = [];
  let where = '';
  if (busca) {
    params.push(`%${busca}%`);
    where = 'WHERE c.nome ILIKE $1 OR c.cpf LIKE $1';
  }
  const { rows } = await pool.query(`${SELECT_CLIENTE} ${where} ORDER BY c.nome`, params);
  res.json(rows);
});

// GET /clientes/:id  -> cliente + veículos + planos
router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(`${SELECT_CLIENTE} WHERE c.id = $1`, [req.params.id]);
  if (!rows.length) throw notFound('Cliente');

  const [veiculos, planos] = await Promise.all([
    pool.query('SELECT * FROM veiculos WHERE cliente_id = $1 ORDER BY placa', [req.params.id]),
    pool.query(
      `SELECT p.*, (${PLANO_VIGENTE}) AS vigente FROM planos p WHERE p.cliente_id = $1 ORDER BY p.data_inicio DESC`,
      [req.params.id],
    ),
  ]);

  res.json({ ...rows[0], veiculos: veiculos.rows, planos: planos.rows });
});

// POST /clientes  { nome, cpf, email?, telefone?, veiculos?: [{ placa, modelo, cor, tipo }] }
// Cliente e veículos são gravados na MESMA transação: se uma placa for
// inválida/duplicada, o cliente também não é criado.
router.post('/', async (req, res) => {
  exigir(req.body, ['nome', 'cpf']);
  const { nome, email, telefone, veiculos = [] } = req.body;
  const cpf = normalizarCpf(req.body.cpf);

  const cliente = await withTransaction(async (tx) => {
    const { rows } = await tx.query(
      `INSERT INTO clientes (nome, cpf, email, telefone) VALUES ($1, $2, $3, $4) RETURNING *`,
      [nome, cpf, email, telefone],
    );
    const novo = rows[0];
    novo.veiculos = [];
    for (const v of veiculos) {
      exigir(v, ['placa']);
      const r = await tx.query(
        `INSERT INTO veiculos (cliente_id, placa, modelo, cor, tipo)
         VALUES ($1, $2, $3, $4, COALESCE($5, 'CARRO')) RETURNING *`,
        [novo.id, normalizarPlaca(v.placa), v.modelo, v.cor, v.tipo],
      );
      novo.veiculos.push(r.rows[0]);
    }
    return novo;
  });

  res.status(201).json(cliente);
});

// PUT /clientes/:id  (atualização parcial)
router.put('/:id', async (req, res) => {
  const upd = montarUpdate(req.body, ['nome', 'cpf', 'email', 'telefone'], { cpf: normalizarCpf });
  if (!upd) return res.status(400).json({ erro: 'Nenhum campo para atualizar' });

  const { rows } = await pool.query(
    `UPDATE clientes SET ${upd.sets} WHERE id = $${upd.values.length + 1} RETURNING *`,
    [...upd.values, req.params.id],
  );
  if (!rows.length) throw notFound('Cliente');
  res.json(rows[0]);
});

// DELETE /clientes/:id  (veículos e planos saem junto via ON DELETE CASCADE)
router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM clientes WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Cliente');
  res.status(204).end();
});

module.exports = router;
