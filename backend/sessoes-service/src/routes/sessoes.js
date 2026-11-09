const { Router } = require('express');
const { db, types, dec, num, diaDe } = require('../db');
const { HttpError } = require('../errors');
const { calcular } = require('../cobranca');
const { consultarMensalista, consultarTarifa, ServicoIndisponivel } = require('../servicos');
const { placaValida, garagemIdValido, dataOpcional, formatar } = require('../util');

const router = Router();

const TIPOS = ['CARRO', 'MOTO', 'UTILITARIO'];

// ---------------------------------------------------------------------------
// POST /sessoes/checkin  { garagem_id, placa, tipo_veiculo?, entrada? }
//
// 1. Clientes: o veículo é cadastrado? é mensalista NESTA garagem?
// 2. Garagens: garagem existe/ativa, aceita o tipo, total de vagas e tarifa.
// 3. Capacidade: conta os veículos do tipo estacionados agora (partição
//    pequena de sessoes_abertas_por_garagem). Mensalista tem acesso garantido.
// 4. INSERT ... IF NOT EXISTS em sessoes_abertas_por_placa (LWT/Paxos):
//    garante no máximo UMA sessão aberta por placa, mesmo com requisições
//    simultâneas.
// 5. BATCH LOGGED nas outras 3 tabelas: ou todas recebem a sessão, ou
//    nenhuma (atomicidade entre partições/tabelas via batchlog).
//
// `entrada` é opcional (padrão: agora) — permite simular permanências.
// ---------------------------------------------------------------------------
router.post('/checkin', async (req, res) => {
  const placa = placaValida(req.body.placa);
  const garagemId = garagemIdValido(req.body.garagem_id);
  const agora = new Date();
  const entrada = dataOpcional(req.body.entrada, 'entrada', agora);
  if (entrada > agora) throw new HttpError(400, 'entrada não pode estar no futuro');

  // 1. Clientes (se estiver fora do ar, o veículo entra como avulso)
  let cliente = null;
  const avisos = [];
  try {
    cliente = await consultarMensalista(placa, garagemId);
  } catch (err) {
    if (!(err instanceof ServicoIndisponivel)) throw err;
    avisos.push('Serviço de Clientes indisponível: veículo registrado como avulso; será reavaliado no check-out');
  }
  const tipo = cliente?.veiculo_cadastrado
    ? cliente.tipo_veiculo
    : String(req.body.tipo_veiculo || 'CARRO').toUpperCase();
  if (!TIPOS.includes(tipo)) throw new HttpError(400, `tipo_veiculo deve ser um de: ${TIPOS.join(', ')}`);
  const mensalista = Boolean(cliente?.mensalista);

  // 2. Garagens (obrigatório: sem tarifa não dá para cobrar depois)
  const garagem = await consultarTarifa(garagemId, tipo);
  if (!garagem) throw new HttpError(404, 'Garagem não encontrada');
  if (!garagem.ativa) throw new HttpError(409, 'Garagem está inativa');
  if (!garagem.aceita_tipo) throw new HttpError(409, `Garagem não aceita veículos do tipo ${tipo}`);

  // 3. Capacidade
  const abertas = await db().execute(
    'SELECT tipo_veiculo FROM sessoes_abertas_por_garagem WHERE garagem_id = ?',
    [garagemId]
  );
  const ocupadas = abertas.rows.filter((r) => r.tipo_veiculo === tipo).length;
  if (!mensalista && ocupadas >= garagem.total_vagas) {
    throw new HttpError(409, `Garagem lotada para ${tipo}`, { ocupadas, total_vagas: garagem.total_vagas });
  }

  // 4. LWT: reserva a "sessão aberta" da placa
  const sessaoId = types.Uuid.random();
  const t = garagem.tarifa;
  const tarifa = {
    tolerancia_minutos: t.tolerancia_minutos ?? 0,
    primeira_hora: dec(t.primeira_hora),
    hora_adicional: dec(t.hora_adicional),
    diaria_maxima: dec(t.diaria_maxima),
  };
  const clienteId = cliente?.cliente_id ?? null;

  const lwt = await db().execute(
    `INSERT INTO sessoes_abertas_por_placa
       (placa, sessao_id, garagem_id, garagem_nome, entrada, tipo_veiculo, cliente_id, mensalista, tarifa)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     IF NOT EXISTS`,
    [placa, sessaoId, garagemId, garagem.nome, entrada, tipo, clienteId, mensalista, tarifa]
  );
  if (!lwt.wasApplied()) {
    const atual = lwt.first();
    throw new HttpError(409, 'Veículo já possui uma sessão aberta', {
      garagem_id: atual.garagem_id,
      garagem_nome: atual.garagem_nome,
      entrada: atual.entrada,
    });
  }

  // 5. Batch nas tabelas desnormalizadas
  const dia = diaDe(entrada);
  try {
    await db().batch(
      [
        {
          query: `INSERT INTO sessoes_abertas_por_garagem
                    (garagem_id, placa, sessao_id, entrada, tipo_veiculo, mensalista)
                  VALUES (?, ?, ?, ?, ?, ?)`,
          params: [garagemId, placa, sessaoId, entrada, tipo, mensalista],
        },
        {
          query: `INSERT INTO sessoes_por_garagem
                    (garagem_id, dia, entrada, sessao_id, placa, tipo_veiculo, cliente_id, mensalista, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ABERTA')`,
          params: [garagemId, dia, entrada, sessaoId, placa, tipo, clienteId, mensalista],
        },
        {
          query: `INSERT INTO sessoes_por_placa
                    (placa, entrada, sessao_id, garagem_id, garagem_nome, tipo_veiculo, mensalista, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'ABERTA')`,
          params: [placa, entrada, sessaoId, garagemId, garagem.nome, tipo, mensalista],
        },
      ],
      { logged: true }
    );
  } catch (err) {
    // Desfaz a reserva da placa (também via LWT, para não misturar LWT e
    // escrita comum na mesma linha).
    await db()
      .execute('DELETE FROM sessoes_abertas_por_placa WHERE placa = ? IF sessao_id = ?', [placa, sessaoId])
      .catch(() => {});
    throw err;
  }

  res.status(201).json({
    sessao_id: sessaoId.toString(),
    placa,
    garagem_id: garagemId,
    garagem_nome: garagem.nome,
    tipo_veiculo: tipo,
    entrada,
    mensalista,
    cliente_id: clienteId,
    veiculo_cadastrado: Boolean(cliente?.veiculo_cadastrado),
    tarifa: mensalista ? null : t,
    vagas: { tipo, ocupadas: ocupadas + 1, total: garagem.total_vagas },
    ...(avisos.length && { avisos }),
  });
});

// ---------------------------------------------------------------------------
// POST /sessoes/checkout  { placa, saida? }
//
// 1. Lê a sessão aberta da placa (leitura por chave primária).
// 2. Clientes: confirma se é mensalista AGORA (o plano pode ter sido criado ou
//    encerrado durante a permanência). Se o serviço estiver fora, usa o que
//    foi registrado no check-in.
// 3. Calcula o valor com a tarifa CONGELADA no check-in — não depende do
//    Serviço de Garagens estar no ar.
// 4. DELETE ... IF sessao_id = ? (LWT): impede check-out em dobro.
// 5. BATCH LOGGED: fecha a sessão nas tabelas de histórico e libera a vaga.
// ---------------------------------------------------------------------------
router.post('/checkout', async (req, res) => {
  const placa = placaValida(req.body.placa);

  const r = await db().execute('SELECT * FROM sessoes_abertas_por_placa WHERE placa = ?', [placa]);
  const s = r.first();
  if (!s) throw new HttpError(404, 'Nenhuma sessão aberta para esta placa');

  const agora = new Date();
  const saida = dataOpcional(req.body.saida, 'saida', agora);
  if (saida < s.entrada) throw new HttpError(400, 'saida não pode ser anterior à entrada');
  if (saida > agora) throw new HttpError(400, 'saida não pode estar no futuro');

  let mensalista = s.mensalista;
  let fonteMensalista = 'CLIENTES';
  try {
    mensalista = (await consultarMensalista(placa, s.garagem_id)).mensalista;
  } catch (err) {
    if (!(err instanceof ServicoIndisponivel)) throw err;
    fonteMensalista = 'CHECKIN';
  }

  const tarifa = s.tarifa && {
    tolerancia_minutos: s.tarifa.tolerancia_minutos,
    primeira_hora: num(s.tarifa.primeira_hora),
    hora_adicional: num(s.tarifa.hora_adicional),
    diaria_maxima: num(s.tarifa.diaria_maxima),
  };
  const cobranca = calcular({ entrada: s.entrada, saida, mensalista, tarifa });

  const del = await db().execute(
    'DELETE FROM sessoes_abertas_por_placa WHERE placa = ? IF sessao_id = ?',
    [placa, s.sessao_id]
  );
  if (!del.wasApplied()) throw new HttpError(409, 'Check-out já realizado para esta sessão');

  const dia = diaDe(s.entrada);
  const valor = dec(cobranca.valor);
  await db().batch(
    [
      {
        query: 'DELETE FROM sessoes_abertas_por_garagem WHERE garagem_id = ? AND placa = ?',
        params: [s.garagem_id, placa],
      },
      {
        query: `UPDATE sessoes_por_garagem
                   SET saida = ?, minutos = ?, valor = ?, mensalista = ?, status = 'FECHADA'
                 WHERE garagem_id = ? AND dia = ? AND entrada = ? AND sessao_id = ?`,
        params: [saida, cobranca.minutos, valor, mensalista, s.garagem_id, dia, s.entrada, s.sessao_id],
      },
      {
        query: `UPDATE sessoes_por_placa
                   SET saida = ?, minutos = ?, valor = ?, mensalista = ?, status = 'FECHADA'
                 WHERE placa = ? AND entrada = ? AND sessao_id = ?`,
        params: [saida, cobranca.minutos, valor, mensalista, placa, s.entrada, s.sessao_id],
      },
    ],
    { logged: true }
  );

  res.json({
    sessao_id: s.sessao_id.toString(),
    placa,
    garagem_id: s.garagem_id,
    garagem_nome: s.garagem_nome,
    tipo_veiculo: s.tipo_veiculo,
    cliente_id: s.cliente_id,
    entrada: s.entrada,
    saida,
    minutos: cobranca.minutos,
    mensalista,
    mensalista_fonte: fonteMensalista,
    regra: cobranca.regra,
    tarifa: mensalista ? null : tarifa,
    valor: cobranca.valor,
  });
});

// GET /sessoes/abertas/:placa — sessão aberta de uma placa (com o valor
// parcial "se saísse agora").
router.get('/abertas/:placa', async (req, res) => {
  const placa = placaValida(req.params.placa);
  const r = await db().execute('SELECT * FROM sessoes_abertas_por_placa WHERE placa = ?', [placa]);
  const s = r.first();
  if (!s) throw new HttpError(404, 'Nenhuma sessão aberta para esta placa');

  const sessao = formatar(s);
  const parcial = calcular({ entrada: s.entrada, saida: new Date(), mensalista: s.mensalista, tarifa: sessao.tarifa });
  res.json({ ...sessao, minutos_ate_agora: parcial.minutos, valor_se_sair_agora: parcial.valor });
});

module.exports = router;
