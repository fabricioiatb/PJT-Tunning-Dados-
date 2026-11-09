// Condição de "plano vigente" (usar com a tabela planos apelidada de p):
// ativo, já começou e ainda não terminou.
const PLANO_VIGENTE = `p.ativo
  AND p.data_inicio <= CURRENT_DATE
  AND (p.data_fim IS NULL OR p.data_fim >= CURRENT_DATE)`;

module.exports = { PLANO_VIGENTE };
