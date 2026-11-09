const { Router } = require('express');
const { pool } = require('../db');
const { notFound } = require('../errors');
const { normalizarPlaca, exigir, montarUpdate } = require('../validacao');

const router = Router();

const SELECT_VEICULO = `
  SELECT v.*, c.nome AS cliente_nome
    FROM veiculos v
    JOIN clientes c ON c.id = v.cliente_id`;

// GET /veiculos?cliente_id=1&placa=ABC1D23
router.get('/', async (req, res) => {
  const filtros = [];
  const params = [];
  if (req.query.cliente_id) {
    params.push(req.query.cliente_id);
    filtros.push(`v.cliente_id = $${params.length}`);
  }
  if (req.query.placa) {
    params.push(normalizarPlaca(req.query.placa));
    filtros.push(`v.placa = $${params.length}`);
  }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const { rows } = await pool.query(`${SELECT_VEICULO} ${where} ORDER BY v.placa`, params);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(`${SELECT_VEICULO} WHERE v.id = $1`, [req.params.id]);
  if (!rows.length) throw notFound('Veículo');
  res.json(rows[0]);
});

// POST /veiculos  { cliente_id, placa, modelo?, cor?, tipo? }
router.post('/', async (req, res) => {
  exigir(req.body, ['cliente_id', 'placa']);
  const { cliente_id, modelo, cor, tipo } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO veiculos (cliente_id, placa, modelo, cor, tipo)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'CARRO')) RETURNING *`,
    [cliente_id, normalizarPlaca(req.body.placa), modelo, cor, tipo]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const upd = montarUpdate(req.body, ['cliente_id', 'placa', 'modelo', 'cor', 'tipo'], {
    placa: normalizarPlaca,
  });
  if (!upd) return res.status(400).json({ erro: 'Nenhum campo para atualizar' });

  const { rows } = await pool.query(
    `UPDATE veiculos SET ${upd.sets} WHERE id = $${upd.values.length + 1} RETURNING *`,
    [...upd.values, req.params.id]
  );
  if (!rows.length) throw notFound('Veículo');
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM veiculos WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Veículo');
  res.status(204).end();
});

module.exports = router;
