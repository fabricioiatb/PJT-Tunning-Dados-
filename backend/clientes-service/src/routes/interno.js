const { Router } = require('express');
const { pool } = require('../db');
const { exigir, normalizarPlaca } = require('../validacao');
const { PLANO_VIGENTE } = require('../sql');

const router = Router();

// GET /interno/mensalista?placa=ABC1D23&garagem_id=<ObjectId>
//
// Usado pelo Serviço de Sessões no check-in/check-out para decidir entre
// MENSALISTA (sem cobrança) e AVULSO (cobra pela tarifa da garagem).
// Uma única consulta: veículo -> cliente -> plano vigente naquela garagem
// (LEFT JOIN para responder mesmo quando a placa não tem plano ou nem existe).
router.get('/mensalista', async (req, res) => {
  exigir(req.query, ['placa', 'garagem_id']);
  const placa = normalizarPlaca(req.query.placa);

  const { rows } = await pool.query(
    `SELECT v.id AS veiculo_id, v.placa, v.tipo AS tipo_veiculo,
            c.id AS cliente_id, c.nome AS cliente_nome,
            p.id AS plano_id, p.valor_mensal, p.data_inicio, p.data_fim
       FROM veiculos v
       JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN planos p
              ON p.cliente_id = c.id
             AND p.garagem_id = $2
             AND ${PLANO_VIGENTE}
      WHERE v.placa = $1
      LIMIT 1`,
    [placa, req.query.garagem_id]
  );

  if (!rows.length) {
    return res.json({ placa, veiculo_cadastrado: false, mensalista: false });
  }

  const r = rows[0];
  res.json({
    placa: r.placa,
    veiculo_cadastrado: true,
    veiculo_id: r.veiculo_id,
    tipo_veiculo: r.tipo_veiculo,
    cliente_id: r.cliente_id,
    cliente_nome: r.cliente_nome,
    mensalista: r.plano_id !== null,
    plano: r.plano_id
      ? { id: r.plano_id, valor_mensal: r.valor_mensal, data_inicio: r.data_inicio, data_fim: r.data_fim }
      : null,
  });
});

module.exports = router;
