// Chamadas HTTP aos outros dois serviços. O Serviço de Sessões nunca acessa
// o Postgres nem o MongoDB diretamente — só pelas APIs internas.
const { HttpError } = require('./errors');

const CLIENTES = process.env.CLIENTES_SERVICE_URL || 'http://localhost:3001';
const GARAGENS = process.env.GARAGENS_SERVICE_URL || 'http://localhost:3002';

class ServicoIndisponivel extends HttpError {
  constructor(nome) {
    super(503, `Serviço de ${nome} indisponível`);
  }
}

async function get(url, nome) {
  let resp;
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
  } catch {
    throw new ServicoIndisponivel(nome);
  }
  const corpo = await resp.json().catch(() => ({}));
  return { status: resp.status, corpo };
}

// -> { veiculo_cadastrado, mensalista, cliente_id, tipo_veiculo, ... }
async function consultarMensalista(placa, garagemId) {
  const q = new URLSearchParams({ placa, garagem_id: garagemId });
  const { status, corpo } = await get(`${CLIENTES}/interno/mensalista?${q}`, 'Clientes');
  if (status !== 200) throw new HttpError(502, `Serviço de Clientes respondeu ${status}`, { detalhe: corpo });
  return corpo;
}

// -> { nome, ativa, aceita_tipo, total_vagas, tarifa } ou null se não existe
async function consultarTarifa(garagemId, tipoVeiculo) {
  const q = new URLSearchParams({ tipo_veiculo: tipoVeiculo });
  const { status, corpo } = await get(`${GARAGENS}/interno/garagens/${garagemId}/tarifa?${q}`, 'Garagens');
  if (status === 404) return null;
  if (status === 400) throw new HttpError(400, corpo.erro || 'Requisição inválida para o Serviço de Garagens');
  if (status !== 200) throw new HttpError(502, `Serviço de Garagens respondeu ${status}`, { detalhe: corpo });
  return corpo;
}

// -> documento da garagem (para totais de vagas) ou null
async function buscarGaragem(garagemId) {
  const { status, corpo } = await get(`${GARAGENS}/garagens/${garagemId}`, 'Garagens');
  if (status === 404) return null;
  if (status !== 200) throw new HttpError(502, `Serviço de Garagens respondeu ${status}`, { detalhe: corpo });
  return corpo;
}

module.exports = { consultarMensalista, consultarTarifa, buscarGaragem, ServicoIndisponivel };
