const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calcular } = require('../src/cobranca');

// Tarifa de carro da "Garagem Paulista" do seed
const tarifa = { tolerancia_minutos: 15, primeira_hora: 18, hora_adicional: 8, diaria_maxima: 70 };
const entrada = new Date('2026-11-09T10:00:00Z');
const depois = (min) => new Date(entrada.getTime() + min * 60000);

const valor = (min, t = tarifa, mensalista = false) =>
  calcular({ entrada, saida: depois(min), mensalista, tarifa: t });

test('mensalista não paga, independente do tempo', () => {
  assert.deepEqual(valor(600, tarifa, true), { minutos: 600, valor: 0, regra: 'MENSALISTA' });
});

test('dentro da tolerância é grátis (inclusive no limite)', () => {
  assert.equal(valor(0).valor, 0);
  assert.equal(valor(15).valor, 0);
  assert.equal(valor(15).regra, 'TOLERANCIA');
});

test('passou da tolerância cobra a primeira hora', () => {
  assert.equal(valor(16).valor, 18);
  assert.equal(valor(60).valor, 18);
});

test('fração de hora adicional conta como hora cheia', () => {
  assert.equal(valor(61).valor, 26); // 18 + 8
  assert.equal(valor(120).valor, 26);
  assert.equal(valor(121).valor, 34); // 18 + 8 + 8
});

test('limitado à diária máxima dentro de 24h', () => {
  // 7h = 18 + 6*8 = 66 (< 70)
  assert.equal(valor(7 * 60).valor, 66);
  // 8h = 18 + 7*8 = 74 -> limitado a 70
  assert.deepEqual(valor(8 * 60), { minutos: 480, valor: 70, regra: 'DIARIA' });
  assert.equal(valor(23 * 60).valor, 70);
});

test('mais de 24h: diárias completas + resto (também limitado)', () => {
  assert.equal(valor(24 * 60).valor, 70); // exatamente 1 diária
  assert.equal(valor(24 * 60 + 30).valor, 70 + 18); // 1 diária + 1ª hora
  assert.equal(valor(48 * 60 + 10 * 60).valor, 70 * 3); // 2 diárias + resto limitado
});

test('sem diária máxima: cobra todas as horas', () => {
  const semDiaria = { primeira_hora: 20, hora_adicional: 10 };
  assert.equal(valor(10 * 60, semDiaria).valor, 20 + 9 * 10);
  assert.equal(valor(1, semDiaria).valor, 20); // sem tolerância
});

test('valores com centavos não acumulam erro de ponto flutuante', () => {
  const t = { primeira_hora: 0.1, hora_adicional: 0.2 };
  assert.equal(valor(180, t).valor, 0.5); // 0.1 + 0.2 + 0.2 (em float daria 0.5000000000000001)
});

test('segundos extras arredondam para o minuto seguinte', () => {
  const r = calcular({ entrada, saida: new Date(entrada.getTime() + 15 * 60000 + 1000), tarifa });
  assert.equal(r.minutos, 16);
  assert.equal(r.valor, 18);
});

test('saída antes da entrada é erro', () => {
  assert.throws(() => valor(-5), /saída anterior/);
});
