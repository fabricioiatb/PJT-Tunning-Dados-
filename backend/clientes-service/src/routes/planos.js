const { Router } = require('express');
const { pool, withTransaction } = require('../db');
const { HttpError, notFound } = require('../errors');
const { exigir, validarGaragemId } = require('../validacao');
const { PLANO_VIGENTE } = require('../sql');

const router = Router();

const SELECT_PLANO = `
  SELECT p.*, c.nome AS cliente_nome, (${PLANO_VIGENTE}) AS vigente
    FROM planos p
    JOIN clientes c ON c.id = p.cliente_id`;

// GET /planos?cliente_id=1&garagem_id=...&ativo=true
router.get('/', async (req, res) => {
  const filtros = [];
  const params = [];
  if (req.query.cliente_id) {
    params.push(req.query.cliente_id);
    filtros.push(`p.cliente_id = $${params.length}`);
  }
  if (req.query.garagem_id) {
    params.push(req.query.garagem_id);
    filtros.push(`p.garagem_id = $${params.length}`);
  }
  if (req.query.ativo !== undefined) {
    params.push(req.query.ativo === 'true');
    filtros.push(`p.ativo = $${params.length}`);
  }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const { rows } = await pool.query(`${SELECT_PLANO} ${where} ORDER BY p.data_inicio DESC, p.id DESC`, params);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(`${SELECT_PLANO} WHERE p.id = $1`, [req.params.id]);
  if (!rows.length) throw notFound('Plano');
  res.json(rows[0]);
});

// POST /planos  { cliente_id, garagem_id, valor_mensal, data_inicio? }
// O índice único parcial uq_plano_ativo_cliente_garagem impede dois planos
// ativos do mesmo cliente na mesma garagem (vira HTTP 409).
router.post('/', async (req, res) => {
  exigir(req.body, ['cliente_id', 'garagem_id', 'valor_mensal']);
  const { cliente_id, garagem_id, valor_mensal, data_inicio } = req.body;
  validarGaragemId(garagem_id);

  const { rows } = await pool.query(
    `INSERT INTO planos (cliente_id, garagem_id, valor_mensal, data_inicio)
     VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE)) RETURNING *`,
    [cliente_id, garagem_id, valor_mensal, data_inicio]
  );
  res.status(201).json(rows[0]);
});

// PUT /planos/:id  { valor_mensal }  — só o valor é editável; trocar de
// garagem = encerrar este plano e abrir outro (preserva o histórico).
router.put('/:id', async (req, res) => {
  exigir(req.body, ['valor_mensal']);
  const { rows } = await pool.query(
    'UPDATE planos SET valor_mensal = $1 WHERE id = $2 RETURNING *',
    [req.body.valor_mensal, req.params.id]
  );
  if (!rows.length) throw notFound('Plano');
  res.json(rows[0]);
});

// PATCH /planos/:id/encerrar
// Transação com SELECT ... FOR UPDATE: trava a linha para que duas
// requisições simultâneas não encerrem/alterem o mesmo plano ao mesmo tempo.
router.patch('/:id/encerrar', async (req, res) => {
  const plano = await withTransaction(async (tx) => {
    const { rows } = await tx.query('SELECT * FROM planos WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!rows.length) throw notFound('Plano');
    if (!rows[0].ativo) throw new HttpError(409, 'Plano já está encerrado');

    const r = await tx.query(
      `UPDATE planos
          SET ativo = FALSE,
              data_fim = GREATEST(CURRENT_DATE, data_inicio)
        WHERE id = $1
        RETURNING *`,
      [req.params.id]
    );
    return r.rows[0];
  });
  res.json(plano);
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM planos WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Plano');
  res.status(204).end();
});

module.exports = router;
