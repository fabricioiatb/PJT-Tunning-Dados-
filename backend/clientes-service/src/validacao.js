const { HttpError } = require('./errors');

// "abc-1d23" -> "ABC1D23" (aceita placa antiga e Mercosul)
const normalizarPlaca = (placa) => (typeof placa === 'string' ? placa.toUpperCase().replace(/[^A-Z0-9]/g, '') : placa);

// "123.456.789-00" -> "12345678900"
const normalizarCpf = (cpf) => (typeof cpf === 'string' ? cpf.replace(/\D/g, '') : cpf);

const OBJECT_ID = /^[a-f0-9]{24}$/i;

function exigir(body, campos) {
  const faltando = campos.filter((c) => body[c] === undefined || body[c] === null || body[c] === '');
  if (faltando.length) {
    throw new HttpError(400, `Campos obrigatórios: ${faltando.join(', ')}`);
  }
}

function validarGaragemId(garagemId) {
  if (!OBJECT_ID.test(String(garagemId))) {
    throw new HttpError(400, 'garagem_id deve ser um ObjectId do MongoDB (24 caracteres hexadecimais)');
  }
}

// Monta um UPDATE só com os campos enviados no body.
// Retorna { sets: 'a = $1, b = $2', values: [...] } ou null se nada mudou.
function montarUpdate(body, permitidos, normalizadores = {}) {
  const sets = [];
  const values = [];
  for (const campo of permitidos) {
    if (body[campo] !== undefined) {
      const norm = normalizadores[campo];
      values.push(norm ? norm(body[campo]) : body[campo]);
      sets.push(`${campo} = $${values.length}`);
    }
  }
  return sets.length ? { sets: sets.join(', '), values } : null;
}

module.exports = { normalizarPlaca, normalizarCpf, exigir, validarGaragemId, montarUpdate };
