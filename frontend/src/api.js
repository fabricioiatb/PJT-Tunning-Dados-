// Cliente HTTP dos três serviços. O frontend nunca acessa banco: só as APIs.
const SERVICOS = {
  clientes: {
    url: import.meta.env.VITE_CLIENTES_API_URL || 'http://localhost:3001',
    pasta: 'backend/clientes-service',
  },
  garagens: {
    url: import.meta.env.VITE_GARAGENS_API_URL || 'http://localhost:3002',
    pasta: 'backend/garagens-service',
  },
  sessoes: { url: import.meta.env.VITE_SESSOES_API_URL || 'http://localhost:3003', pasta: 'backend/sessoes-service' },
};

const NOME_SERVICO = { clientes: 'Clientes', garagens: 'Garagens', sessoes: 'Sessões' };

export class ApiError extends Error {
  constructor(message, status, corpo) {
    super(message);
    this.status = status;
    this.corpo = corpo;
  }
}

async function req(servico, path, { method = 'GET', body } = {}) {
  const { url, pasta } = SERVICOS[servico];
  let resp;
  try {
    resp = await fetch(url + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Mensagem com o próximo passo, não só o problema.
    throw new ApiError(
      `Serviço de ${NOME_SERVICO[servico]} fora do ar. Inicie-o com “npm run dev” em ${pasta} e tente de novo.`,
      0,
    );
  }
  if (resp.status === 204) return null;
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const det = Array.isArray(corpo.detalhe) ? ` — ${corpo.detalhe.join('; ')}` : '';
    throw new ApiError((corpo.erro || `Erro ${resp.status}`) + det, resp.status, corpo);
  }
  return corpo;
}

const qs = (obj) => {
  const p = new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== undefined && v !== '' && v !== null));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  saude: (servico) => req(servico, '/health'),

  // Clientes (PostgreSQL)
  clientes: (busca) => req('clientes', `/clientes${qs({ busca })}`),
  cliente: (id) => req('clientes', `/clientes/${id}`),
  criarCliente: (body) => req('clientes', '/clientes', { method: 'POST', body }),
  atualizarCliente: (id, body) => req('clientes', `/clientes/${id}`, { method: 'PUT', body }),
  removerCliente: (id) => req('clientes', `/clientes/${id}`, { method: 'DELETE' }),
  criarVeiculo: (body) => req('clientes', '/veiculos', { method: 'POST', body }),
  atualizarVeiculo: (id, body) => req('clientes', `/veiculos/${id}`, { method: 'PUT', body }),
  removerVeiculo: (id) => req('clientes', `/veiculos/${id}`, { method: 'DELETE' }),
  criarPlano: (body) => req('clientes', '/planos', { method: 'POST', body }),
  atualizarPlano: (id, body) => req('clientes', `/planos/${id}`, { method: 'PUT', body }),
  encerrarPlano: (id) => req('clientes', `/planos/${id}/encerrar`, { method: 'PATCH' }),
  removerPlano: (id) => req('clientes', `/planos/${id}`, { method: 'DELETE' }),

  // Garagens (MongoDB)
  garagens: (filtros = {}) => req('garagens', `/garagens${qs(filtros)}`),
  criarGaragem: (body) => req('garagens', '/garagens', { method: 'POST', body }),
  substituirGaragem: (id, body) => req('garagens', `/garagens/${id}`, { method: 'PUT', body }),
  atualizarGaragem: (id, body) => req('garagens', `/garagens/${id}`, { method: 'PATCH', body }),
  removerGaragem: (id) => req('garagens', `/garagens/${id}`, { method: 'DELETE' }),

  // Sessões (Cassandra)
  checkin: (body) => req('sessoes', '/sessoes/checkin', { method: 'POST', body }),
  checkout: (body) => req('sessoes', '/sessoes/checkout', { method: 'POST', body }),
  sessaoAberta: (placa) => req('sessoes', `/sessoes/abertas/${encodeURIComponent(placa)}`),
  // A chave completa no Cassandra: partição (garagem_id, dia de entrada) + clustering.
  removerSessao: (s, garagemId) =>
    req(
      'sessoes',
      `/sessoes/${s.sessao_id}${qs({ garagem_id: garagemId || s.garagem_id, placa: s.placa, entrada: new Date(s.entrada).toISOString() })}`,
      {
        method: 'DELETE',
      },
    ),
  ocupacao: (garagemId) => req('sessoes', `/garagens/${garagemId}/ocupacao`),
  sessoesGaragem: (garagemId, filtros = {}) => req('sessoes', `/garagens/${garagemId}/sessoes${qs(filtros)}`),
  historicoVeiculo: (placa, limite = 50) =>
    req('sessoes', `/veiculos/${encodeURIComponent(placa)}/sessoes${qs({ limite })}`),
};

// --- formatação com Intl (idioma do navegador; moeda sempre BRL) ---------
export const LOCALE = (typeof navigator !== 'undefined' && navigator.languages?.[0]) || 'pt-BR';

const fmtMoeda = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'BRL' });
const fmtNumero = new Intl.NumberFormat(LOCALE);
const fmtPct = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 });
const fmtDataHora = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
// Datas "puras" (YYYY-MM-DD) vêm sem fuso: formatar em UTC evita voltar um dia.
const fmtDia = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const fmtDiaCurto = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit' });
const fmtHora = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', hour: '2-digit' });

export const brl = (v) => fmtMoeda.format(v ?? 0);
export const numero = (v) => fmtNumero.format(v ?? 0);
export const pct = (v) => fmtPct.format(v ?? 0);
export const dataHora = (d) => (d ? fmtDataHora.format(new Date(d)) : '—');
export const dia = (d) => (d ? fmtDia.format(new Date(`${d}T00:00:00Z`)) : '—');
export const diaCurto = (d) => fmtDiaCurto.format(new Date(d));
export const horaCurta = (d) => fmtHora.format(new Date(d));

export const duracao = (min) => {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min`;
};

export const TIPOS = ['CARRO', 'MOTO', 'UTILITARIO'];
export const NOME_TIPO = { CARRO: 'Carro', MOTO: 'Moto', UTILITARIO: 'Utilitário' };
