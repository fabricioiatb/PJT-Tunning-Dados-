const { Router } = require('express');
const { garagens, TIPOS_VEICULO } = require('../db');
const { HttpError, notFound, toObjectId } = require('../errors');

const router = Router();

// GET /interno/garagens/:id/tarifa?tipo_veiculo=CARRO
//
// Usado pelo Serviço de Sessões no check-in (capacidade) e no check-out
// (cálculo do valor). A projeção com $elemMatch faz o MongoDB devolver só
// o item de tarifa e de vaga do tipo pedido, e não o documento inteiro.
router.get('/garagens/:id/tarifa', async (req, res) => {
  const tipo = String(req.query.tipo_veiculo || 'CARRO').toUpperCase();
  if (!TIPOS_VEICULO.includes(tipo)) {
    throw new HttpError(400, `tipo_veiculo deve ser um de: ${TIPOS_VEICULO.join(', ')}`);
  }

  const g = await garagens().findOne(
    { _id: toObjectId(req.params.id) },
    {
      projection: {
        nome: 1,
        ativa: 1,
        tarifas: { $elemMatch: { tipo_veiculo: tipo } },
        vagas: { $elemMatch: { tipo } },
      },
    }
  );
  if (!g) throw notFound('Garagem');

  const tarifa = g.tarifas?.[0];
  const vaga = g.vagas?.[0];
  res.json({
    garagem_id: g._id,
    nome: g.nome,
    ativa: g.ativa !== false,
    tipo_veiculo: tipo,
    aceita_tipo: Boolean(tarifa && vaga),
    total_vagas: vaga?.total ?? 0,
    tarifa: tarifa
      ? {
          tolerancia_minutos: tarifa.tolerancia_minutos ?? 0,
          primeira_hora: tarifa.primeira_hora,
          hora_adicional: tarifa.hora_adicional,
          diaria_maxima: tarifa.diaria_maxima ?? null,
        }
      : null,
  });
});

module.exports = router;
