// Cálculo do valor de uma permanência. Função pura (sem banco/rede) para
// poder ser testada isoladamente — ver test/cobranca.test.js.
//
// Regras:
//  - Mensalista: não paga (já paga o plano).
//  - Até `tolerancia_minutos`: grátis.
//  - Senão: primeira hora + cada hora (ou fração) adicional.
//  - Se houver `diaria_maxima`: cada 24h completas custam a diária e o
//    restante é limitado à diária (o cliente nunca paga mais que a diária
//    por período de 24h).
// Contas feitas em CENTAVOS (inteiros) para não acumular erro de float.

const MIN_POR_DIA = 24 * 60;

const centavos = (v) => Math.round(Number(v || 0) * 100);

function minutosEntre(entrada, saida) {
  const ms = new Date(saida) - new Date(entrada);
  if (ms < 0) throw new Error('saída anterior à entrada');
  return Math.ceil(ms / 60000);
}

// Valor (em centavos) de um período de até 24h, sem tolerância.
function valorPeriodo(minutos, t) {
  if (minutos <= 0) return 0;
  const horas = Math.ceil(minutos / 60);
  return centavos(t.primeira_hora) + (horas - 1) * centavos(t.hora_adicional);
}

function calcular({ entrada, saida, mensalista, tarifa }) {
  const minutos = minutosEntre(entrada, saida);

  if (mensalista) {
    return { minutos, valor: 0, regra: 'MENSALISTA' };
  }
  if (!tarifa) throw new Error('tarifa ausente para cliente avulso');

  const tolerancia = Number(tarifa.tolerancia_minutos || 0);
  if (minutos <= tolerancia) {
    return { minutos, valor: 0, regra: 'TOLERANCIA' };
  }

  const diaria = tarifa.diaria_maxima != null ? centavos(tarifa.diaria_maxima) : null;
  let total;
  let regra = 'POR_HORA';

  if (diaria == null) {
    total = valorPeriodo(minutos, tarifa);
  } else {
    const dias = Math.floor(minutos / MIN_POR_DIA);
    const resto = minutos - dias * MIN_POR_DIA;
    const valorResto = Math.min(valorPeriodo(resto, tarifa), diaria);
    total = dias * diaria + valorResto;
    if (dias > 0 || valorResto === diaria) regra = 'DIARIA';
  }

  return { minutos, valor: total / 100, regra };
}

module.exports = { calcular, minutosEntre };
