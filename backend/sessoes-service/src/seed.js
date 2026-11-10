// Gera um histórico de sessões FECHADAS para as garagens do seed do Mongo e
// mede a vazão de escrita.  Uso:  npm run seed -- [quantidade] [dias]
//   ex.: npm run seed -- 20000 30
//
// Precisa do Serviço de Garagens no ar (para usar as tarifas reais).
// Escreve em sessoes_por_garagem e sessoes_por_placa usando
// executeConcurrent (várias escritas em paralelo pelo driver) — o padrão de
// carga em que o Cassandra se destaca: muitas escritas pequenas e
// independentes, sem leitura antes da escrita.
require('dotenv').config();
const { executeConcurrent } = require('cassandra-driver').concurrent;
const { conectar, db, types, dec, diaDe } = require('./db');
const { calcular } = require('./cobranca');
const { consultarTarifa } = require('./servicos');

const GARAGENS = ['6720a0000000000000000001', '6720a0000000000000000002', '6720a0000000000000000003'];

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const rnd = (n) => Math.floor(Math.random() * n);
const placaAleatoria = () =>
  LETRAS[rnd(26)] + LETRAS[rnd(26)] + LETRAS[rnd(26)] + rnd(10) + LETRAS[rnd(26)] + rnd(10) + rnd(10);

// Permanência: maioria curta (até 3h), algumas longas.
function minutosAleatorios() {
  const r = Math.random();
  if (r < 0.1) return 1 + rnd(15); // dentro da tolerância
  if (r < 0.8) return 15 + rnd(180);
  if (r < 0.97) return 180 + rnd(600);
  return 24 * 60 + rnd(48 * 60); // mais de um dia
}

// Tarifas reais das garagens (tenta algumas vezes: no docker compose o
// Serviço de Garagens pode ainda estar subindo).
async function carregarTarifas({ tentativas = 20, intervaloMs = 3000 } = {}) {
  for (let i = 1; ; i++) {
    try {
      const tarifas = {};
      for (const g of GARAGENS) {
        for (const tipo of ['CARRO', 'MOTO']) {
          const t = await consultarTarifa(g, tipo);
          if (t?.aceita_tipo) (tarifas[g] ||= {})[tipo] = { nome: t.nome, tarifa: t.tarifa };
        }
      }
      if (Object.keys(tarifas).length === 0) throw new Error('garagens de exemplo não encontradas');
      return tarifas;
    } catch (err) {
      if (i === tentativas) throw err;
      await new Promise((r) => setTimeout(r, intervaloMs));
    }
  }
}

async function gerar(qtd = 10000, dias = 30) {
  const tarifas = await carregarTarifas();
  const comTarifa = GARAGENS.filter((g) => tarifas[g]);
  const frota = Array.from({ length: Math.max(50, Math.floor(qtd / 20)) }, placaAleatoria);
  const agora = Date.now();
  const params = [];

  for (let i = 0; i < qtd; i++) {
    const garagemId = comTarifa[rnd(comTarifa.length)];
    const tipos = Object.keys(tarifas[garagemId]);
    const tipo = Math.random() < 0.85 || tipos.length === 1 ? 'CARRO' : tipos[1];
    const { nome, tarifa } = tarifas[garagemId][tipo];

    const minutos = minutosAleatorios();
    const saida = new Date(agora - rnd(dias * 24 * 60) * 60000);
    const entrada = new Date(saida.getTime() - minutos * 60000);
    const mensalista = Math.random() < 0.2;
    const c = calcular({ entrada, saida, mensalista, tarifa });

    params.push({
      garagemId,
      nome,
      tipo,
      entrada,
      saida,
      mensalista,
      minutos: c.minutos,
      valor: dec(c.valor),
      placa: frota[rnd(frota.length)],
      sessaoId: types.Uuid.random(),
    });
  }

  const porGaragem = `INSERT INTO sessoes_por_garagem
      (garagem_id, dia, entrada, sessao_id, placa, tipo_veiculo, mensalista, saida, minutos, valor, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FECHADA')`;
  const porPlaca = `INSERT INTO sessoes_por_placa
      (placa, entrada, sessao_id, garagem_id, garagem_nome, tipo_veiculo, mensalista, saida, minutos, valor, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FECHADA')`;

  const t0 = Date.now();
  await executeConcurrent(
    db(),
    porGaragem,
    params.map((p) => [
      p.garagemId,
      diaDe(p.entrada),
      p.entrada,
      p.sessaoId,
      p.placa,
      p.tipo,
      p.mensalista,
      p.saida,
      p.minutos,
      p.valor,
    ]),
    { concurrencyLevel: 128 },
  );
  await executeConcurrent(
    db(),
    porPlaca,
    params.map((p) => [
      p.placa,
      p.entrada,
      p.sessaoId,
      p.garagemId,
      p.nome,
      p.tipo,
      p.mensalista,
      p.saida,
      p.minutos,
      p.valor,
    ]),
    { concurrencyLevel: 128 },
  );
  const seg = (Date.now() - t0) / 1000;
  console.log(
    `Seed: ${qtd} sessões em ${dias} dias -> ${qtd * 2} escritas em ${seg.toFixed(1)}s (~${Math.round((qtd * 2) / seg)} escritas/s)`,
  );
}

// Ambiente novo: gera o histórico só se ainda não houver nenhuma sessão.
async function gerarSeVazio(qtd, dias) {
  const rs = await db().execute('SELECT sessao_id FROM sessoes_por_placa LIMIT 1');
  if (rs.rowLength > 0) return;
  await gerar(qtd, dias);
}

module.exports = { gerar, gerarSeVazio };

if (require.main === module) {
  const qtd = parseInt(process.argv[2], 10) || 10000;
  const dias = parseInt(process.argv[3], 10) || 30;
  (async () => {
    await conectar();
    console.log(`Gerando ${qtd} sessões em ${dias} dias...`);
    await gerar(qtd, dias);
    await db().shutdown();
  })().catch(async (err) => {
    console.error(err.message);
    await db()
      ?.shutdown()
      .catch(() => {});
    process.exit(1);
  });
}
