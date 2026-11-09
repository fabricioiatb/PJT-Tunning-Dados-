const { Router } = require('express');
const { garagens } = require('../db');
const { HttpError, notFound, toObjectId } = require('../errors');

const router = Router();

// Normaliza o corpo recebido antes de gravar:
// - remove campos controlados pelo servidor;
// - tipos de veículo em maiúsculas;
// - aceita localizacao como { lat, lng } e converte para GeoJSON Point
//   (o MongoDB usa a ordem [longitude, latitude]).
function normalizar(body) {
  const doc = { ...body };
  delete doc._id;
  delete doc.criado_em;
  delete doc.atualizado_em;

  if (Array.isArray(doc.vagas)) {
    doc.vagas = doc.vagas.map((v) => ({ ...v, tipo: String(v.tipo || '').toUpperCase() }));
  }
  if (Array.isArray(doc.tarifas)) {
    doc.tarifas = doc.tarifas.map((t) => ({ ...t, tipo_veiculo: String(t.tipo_veiculo || '').toUpperCase() }));
  }
  const loc = doc.endereco?.localizacao;
  if (loc && loc.lat !== undefined && loc.lng !== undefined) {
    doc.endereco = {
      ...doc.endereco,
      localizacao: { type: 'Point', coordinates: [Number(loc.lng), Number(loc.lat)] },
    };
  }
  if (doc.endereco?.uf) doc.endereco.uf = String(doc.endereco.uf).toUpperCase();
  return doc;
}

// Total de vagas calculado na leitura (não armazenado, evita inconsistência).
const comTotal = (g) => g && { ...g, total_vagas: (g.vagas || []).reduce((s, v) => s + (v.total || 0), 0) };

// GET /garagens?cidade=Sao Paulo&comodidade=lava-rapido&ativa=true
router.get('/', async (req, res) => {
  const filtro = {};
  if (req.query.cidade) filtro['endereco.cidade'] = req.query.cidade;
  if (req.query.ativa !== undefined) filtro.ativa = req.query.ativa === 'true';
  if (req.query.comodidade) filtro.comodidades = req.query.comodidade; // casa com qualquer elemento do array
  if (req.query.tipo_vaga) filtro['vagas.tipo'] = String(req.query.tipo_vaga).toUpperCase();

  const lista = await garagens().find(filtro).sort({ nome: 1 }).toArray();
  res.json(lista.map(comTotal));
});

// GET /garagens/proximas?lat=-23.56&lng=-46.65&raio_km=5
// Usa o índice 2dsphere; o resultado já vem ordenado por distância.
router.get('/proximas', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const raioKm = Number(req.query.raio_km || 5);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new HttpError(400, 'Informe lat e lng numéricos');
  }

  const lista = await garagens()
    .aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] },
          distanceField: 'distancia_m',
          maxDistance: raioKm * 1000,
          query: { ativa: true },
          spherical: true,
        },
      },
      { $set: { distancia_m: { $round: ['$distancia_m', 0] } } },
    ])
    .toArray();
  res.json(lista.map(comTotal));
});

router.get('/:id', async (req, res) => {
  const g = await garagens().findOne({ _id: toObjectId(req.params.id) });
  if (!g) throw notFound('Garagem');
  res.json(comTotal(g));
});

// POST /garagens  — o validador $jsonSchema da coleção garante o núcleo
// obrigatório; campos extras são aceitos livremente.
router.post('/', async (req, res) => {
  const agora = new Date();
  const doc = { ativa: true, comodidades: [], ...normalizar(req.body), criado_em: agora, atualizado_em: agora };
  const { insertedId } = await garagens().insertOne(doc);
  res.status(201).json(comTotal({ _id: insertedId, ...doc }));
});

// PUT /garagens/:id  — substitui o documento inteiro (campos não enviados
// deixam de existir; é assim que se "remove" um campo opcional).
router.put('/:id', async (req, res) => {
  const _id = toObjectId(req.params.id);
  const atual = await garagens().findOne({ _id }, { projection: { criado_em: 1 } });
  if (!atual) throw notFound('Garagem');

  const doc = { ativa: true, ...normalizar(req.body), criado_em: atual.criado_em, atualizado_em: new Date() };
  await garagens().replaceOne({ _id }, doc);
  res.json(comTotal({ _id, ...doc }));
});

// PATCH /garagens/:id  — atualização parcial ($set só dos campos enviados).
router.patch('/:id', async (req, res) => {
  const set = normalizar(req.body);
  if (!Object.keys(set).length) throw new HttpError(400, 'Nenhum campo para atualizar');

  const g = await garagens().findOneAndUpdate(
    { _id: toObjectId(req.params.id) },
    { $set: { ...set, atualizado_em: new Date() } },
    { returnDocument: 'after' }
  );
  if (!g) throw notFound('Garagem');
  res.json(comTotal(g));
});

router.delete('/:id', async (req, res) => {
  const { deletedCount } = await garagens().deleteOne({ _id: toObjectId(req.params.id) });
  if (!deletedCount) throw notFound('Garagem');
  res.status(204).end();
});

module.exports = router;
