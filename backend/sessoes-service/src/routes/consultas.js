const { Router } = require('express');
const { db, types } = require('../db');
const { HttpError } = require('../errors');
const { buscarGaragem, ServicoIndisponivel } = require('../servicos');
const { placaValida, garagemIdValido, dataOpcional, formatar } = require('../util');

const router = Router();

const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_DIAS = 31;

// Lê todas as páginas de uma consulta (o driver pagina de fetchSize em
// fetchSize linhas; sem isso só a primeira página volta).
async function todasLinhas(query, params, fetchSize = 1000) {
  const linhas = [];
  let pageState;
  do {
    const rs = await db().execute(query, params, { fetchSize, pageState });
    linhas.push(...rs.rows);
    pageState = rs.pageState;
  } while (pageState);
  return linhas;
}

// Dias (UTC) cobertos pelo intervalo [inicio, fim], do mais recente ao mais antigo.
function diasDoIntervalo(inicio, fim) {
  const dias = [];
  const primeiro = Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate());
  for (let t = Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), fim.getUTCDate()); t >= primeiro; t -= DIA_MS) {
    dias.push(types.LocalDate.fromDate(new Date(t + 12 * 60 * 60 * 1000))); // meio-dia evita erro de fuso
  }
  return dias;
}

function resumir(sessoes) {
  const fechadas = sessoes.filter((s) => s.status === 'FECHADA');
  const faturamentoCent = fechadas.reduce((soma, s) => soma + Math.round((s.valor || 0) * 100), 0);
  const minutosTotal = fechadas.reduce((soma, s) => soma + (s.minutos || 0), 0);
  return {
    total: sessoes.length,
    abertas: sessoes.length - fechadas.length,
    fechadas: fechadas.length,
    mensalistas: sessoes.filter((s) => s.mensalista).length,
    avulsos: sessoes.filter((s) => !s.mensalista).length,
    faturamento: faturamentoCent / 100,
    permanencia_media_min: fechadas.length ? Math.round(minutosTotal / fechadas.length) : 0,
    ticket_medio_avulso: (() => {
      const pagas = fechadas.filter((s) => !s.mensalista);
      return pagas.length ? Math.round(faturamentoCent / pagas.length) / 100 : 0;
    })(),
  };
}

// ---------------------------------------------------------------------------
// GET /garagens/:garagem_id/sessoes?inicio=ISO&fim=ISO&status=ABERTA|FECHADA
//
// A consulta-modelo do Cassandra: para cada dia do intervalo lê UMA partição
// (garagem_id, dia) e, dentro dela, só a faixa de `entrada` pedida (as linhas
// estão ordenadas por entrada — é uma leitura sequencial). As partições são
// lidas em paralelo. Padrão: últimas 24h. Máximo: 31 dias.
//
// `status` é filtrado na aplicação: ele não faz parte da chave, e filtrar no
// banco exigiria ALLOW FILTERING (varredura) — anti-padrão no Cassandra.
// ---------------------------------------------------------------------------
router.get('/garagens/:garagem_id/sessoes', async (req, res) => {
  const garagemId = garagemIdValido(req.params.garagem_id);
  const fim = dataOpcional(req.query.fim, 'fim', new Date());
  const inicio = dataOpcional(req.query.inicio, 'inicio', new Date(fim.getTime() - DIA_MS));
  if (inicio > fim) throw new HttpError(400, 'inicio deve ser anterior a fim');

  const dias = diasDoIntervalo(inicio, fim);
  if (dias.length > MAX_DIAS) throw new HttpError(400, `Intervalo máximo de ${MAX_DIAS} dias`);

  const t0 = process.hrtime.bigint();
  const porDia = await Promise.all(
    dias.map((dia) =>
      todasLinhas(
        `SELECT * FROM sessoes_por_garagem
          WHERE garagem_id = ? AND dia = ? AND entrada >= ? AND entrada <= ?`,
        [garagemId, dia, inicio, fim]
      )
    )
  );
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  let sessoes = porDia.flat().map(formatar); // dias já vêm do mais recente, e cada partição em entrada DESC
  if (req.query.status) {
    const status = String(req.query.status).toUpperCase();
    sessoes = sessoes.filter((s) => s.status === status);
  }

  res.json({
    garagem_id: garagemId,
    inicio,
    fim,
    particoes_lidas: dias.length,
    tempo_consulta_ms: Math.round(ms * 10) / 10,
    resumo: resumir(sessoes),
    sessoes,
  });
});

// ---------------------------------------------------------------------------
// GET /garagens/:garagem_id/ocupacao — quem está estacionado agora, por tipo.
// Uma partição de sessoes_abertas_por_garagem (tamanho limitado pela
// capacidade da garagem) + totais de vagas do Serviço de Garagens.
// ---------------------------------------------------------------------------
router.get('/garagens/:garagem_id/ocupacao', async (req, res) => {
  const garagemId = garagemIdValido(req.params.garagem_id);

  const [rs, garagem] = await Promise.all([
    db().execute('SELECT * FROM sessoes_abertas_por_garagem WHERE garagem_id = ?', [garagemId]),
    buscarGaragem(garagemId).catch((err) => {
      if (err instanceof ServicoIndisponivel) return undefined; // mostra ocupação mesmo sem os totais
      throw err;
    }),
  ]);
  if (garagem === null) throw new HttpError(404, 'Garagem não encontrada');

  const veiculos = rs.rows.map(formatar).sort((a, b) => new Date(a.entrada) - new Date(b.entrada));
  const tipos = new Set([...(garagem?.vagas || []).map((v) => v.tipo), ...veiculos.map((v) => v.tipo_veiculo)]);

  const porTipo = [...tipos].map((tipo) => {
    const total = garagem ? garagem.vagas.find((v) => v.tipo === tipo)?.total ?? 0 : null;
    const ocupadas = veiculos.filter((v) => v.tipo_veiculo === tipo).length;
    return {
      tipo,
      total,
      ocupadas,
      livres: total == null ? null : Math.max(total - ocupadas, 0),
      ocupacao_percentual: total ? Math.round((ocupadas / total) * 1000) / 10 : null,
    };
  });

  res.json({
    garagem_id: garagemId,
    garagem_nome: garagem?.nome ?? null,
    ...(garagem === undefined && { aviso: 'Serviço de Garagens indisponível: totais de vagas desconhecidos' }),
    por_tipo: porTipo,
    veiculos,
  });
});

// GET /veiculos/:placa/sessoes?limite=20 — histórico de um veículo
// (uma partição de sessoes_por_placa, já em ordem decrescente de entrada).
router.get('/veiculos/:placa/sessoes', async (req, res) => {
  const placa = placaValida(req.params.placa);
  const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 20, 1), 500);

  const rs = await db().execute('SELECT * FROM sessoes_por_placa WHERE placa = ? LIMIT ?', [placa, limite]);
  const sessoes = rs.rows.map(formatar);
  res.json({ placa, resumo: resumir(sessoes), sessoes });
});

module.exports = router;
