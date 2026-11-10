// Popula a coleção com garagens de exemplo.  Uso: npm run seed
//
// As garagens têm estruturas DIFERENTES de propósito — é o argumento para o
// document store: uma tem só carro, outra tem moto e carregador elétrico,
// outra tem horário especial e campos próprios (ex.: "convenios").
// Os _id são fixos para que os seeds/testes dos outros serviços possam
// referenciá-los.
require('dotenv').config();
const { ObjectId } = require('mongodb');
const { client, conectar, garagens } = require('./db');

const agora = new Date();

const dados = [
  {
    _id: new ObjectId('6720a0000000000000000001'),
    nome: 'Garagem Paulista',
    ativa: true,
    endereco: {
      logradouro: 'Av. Paulista',
      numero: '1000',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      uf: 'SP',
      cep: '01310-100',
      localizacao: { type: 'Point', coordinates: [-46.6544, -23.565] },
    },
    vagas: [
      { tipo: 'CARRO', total: 120, cobertas: 120 },
      { tipo: 'MOTO', total: 30 },
    ],
    tarifas: [
      { tipo_veiculo: 'CARRO', tolerancia_minutos: 15, primeira_hora: 18, hora_adicional: 8, diaria_maxima: 70 },
      { tipo_veiculo: 'MOTO', tolerancia_minutos: 15, primeira_hora: 8, hora_adicional: 4, diaria_maxima: 30 },
    ],
    comodidades: ['coberta', 'manobrista', 'carregador-eletrico'],
    horario_funcionamento: { tipo: '24h' },
    carregadores_eletricos: [{ conector: 'Tipo 2', potencia_kw: 22, quantidade: 4 }],
  },
  {
    _id: new ObjectId('6720a0000000000000000002'),
    nome: 'Estacionamento Pinheiros',
    ativa: true,
    endereco: {
      logradouro: 'Rua dos Pinheiros',
      numero: '450',
      bairro: 'Pinheiros',
      cidade: 'São Paulo',
      uf: 'SP',
      localizacao: { type: 'Point', coordinates: [-46.6823, -23.5662] },
    },
    vagas: [{ tipo: 'CARRO', total: 40 }],
    tarifas: [
      { tipo_veiculo: 'CARRO', tolerancia_minutos: 10, primeira_hora: 15, hora_adicional: 6, diaria_maxima: 50 },
    ],
    comodidades: ['lava-rapido'],
    horario_funcionamento: {
      seg_sex: { abre: '06:00', fecha: '23:00' },
      sab: { abre: '08:00', fecha: '20:00' },
      dom: null,
    },
    lava_rapido: {
      servicos: [
        { nome: 'Lavagem simples', preco: 40 },
        { nome: 'Completa', preco: 90 },
      ],
    },
  },
  {
    _id: new ObjectId('6720a0000000000000000003'),
    nome: 'Park Center Campinas',
    ativa: true,
    endereco: {
      logradouro: 'Av. Norte-Sul',
      numero: '200',
      cidade: 'Campinas',
      uf: 'SP',
      localizacao: { type: 'Point', coordinates: [-47.0608, -22.9056] },
    },
    vagas: [
      { tipo: 'CARRO', total: 200, cobertas: 80 },
      { tipo: 'MOTO', total: 50 },
      { tipo: 'UTILITARIO', total: 15, altura_maxima_m: 2.6 },
    ],
    tarifas: [
      { tipo_veiculo: 'CARRO', tolerancia_minutos: 20, primeira_hora: 12, hora_adicional: 5, diaria_maxima: 45 },
      { tipo_veiculo: 'MOTO', tolerancia_minutos: 20, primeira_hora: 6, hora_adicional: 3 },
      { tipo_veiculo: 'UTILITARIO', tolerancia_minutos: 10, primeira_hora: 20, hora_adicional: 10, diaria_maxima: 90 },
    ],
    comodidades: ['coberta', 'seguranca-24h', 'bicicletario'],
    horario_funcionamento: { tipo: '24h' },
    convenios: [{ empresa: 'Shopping Norte-Sul', desconto_percentual: 50 }],
  },
  {
    _id: new ObjectId('6720a0000000000000000004'),
    nome: 'Garagem Centro Rio',
    ativa: false,
    observacao: 'Em reforma até o fim do mês',
    endereco: {
      logradouro: 'Rua da Assembleia',
      numero: '10',
      bairro: 'Centro',
      cidade: 'Rio de Janeiro',
      uf: 'RJ',
      localizacao: { type: 'Point', coordinates: [-43.1767, -22.9043] },
    },
    vagas: [{ tipo: 'CARRO', total: 60 }],
    tarifas: [{ tipo_veiculo: 'CARRO', primeira_hora: 20, hora_adicional: 10 }],
    comodidades: [],
  },
].map((g) => ({ ...g, criado_em: agora, atualizado_em: agora }));

// (Re)insere as garagens de exemplo. Com somenteSeVazio, não faz nada se a
// coleção já tiver documentos (usado na inicialização em ambiente novo).
async function popular({ somenteSeVazio = false } = {}) {
  if (somenteSeVazio && (await garagens().estimatedDocumentCount()) > 0) return 0;
  await garagens().deleteMany({ _id: { $in: dados.map((d) => d._id) } });
  const { insertedCount } = await garagens().insertMany(dados);
  console.log(`Seed: ${insertedCount} garagens de exemplo inseridas`);
  return insertedCount;
}

module.exports = { popular };

// Execução direta: npm run seed
if (require.main === module) {
  (async () => {
    await conectar();
    await popular();
    for (const d of dados) console.log(`  ${d._id}  ${d.nome}${d.ativa ? '' : ' (inativa)'}`);
    await client.close();
  })().catch(async (err) => {
    console.error(err);
    await client.close();
    process.exit(1);
  });
}
