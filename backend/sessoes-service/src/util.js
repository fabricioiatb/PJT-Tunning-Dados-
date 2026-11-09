const { HttpError } = require('./errors');
const { num } = require('./db');

const PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

function placaValida(valor) {
  const placa = typeof valor === 'string' ? valor.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  if (!PLACA.test(placa)) throw new HttpError(400, 'placa inválida (ex.: ABC1D23 ou ABC1234)');
  return placa;
}

function garagemIdValido(valor) {
  if (!OBJECT_ID.test(String(valor || ''))) {
    throw new HttpError(400, 'garagem_id deve ser um ObjectId (24 caracteres hexadecimais)');
  }
  return String(valor);
}

// Data opcional vinda do body/query; `padrao` se ausente.
function dataOpcional(valor, campo, padrao) {
  if (valor === undefined || valor === null || valor === '') return padrao;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `${campo} inválida (use ISO 8601)`);
  return d;
}

// Linha do Cassandra -> JSON da API (decimal -> number, date -> string).
function formatar(row) {
  const o = {};
  for (const [k, v] of Object.entries(row)) {
    if (v == null) o[k] = v ?? null;
    else if (k === 'valor') o[k] = num(v);
    else if (k === 'sessao_id' || k === 'dia') o[k] = v.toString();
    else if (k === 'tarifa') {
      o[k] = {
        tolerancia_minutos: v.tolerancia_minutos,
        primeira_hora: num(v.primeira_hora),
        hora_adicional: num(v.hora_adicional),
        diaria_maxima: num(v.diaria_maxima),
      };
    } else o[k] = v;
  }
  return o;
}

module.exports = { placaValida, garagemIdValido, dataOpcional, formatar };
