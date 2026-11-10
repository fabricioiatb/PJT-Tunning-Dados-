const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017/garagem_garagens', {
  serverSelectionTimeoutMS: 5000,
});

let db;

// ---------------------------------------------------------------------------
// Validador $jsonSchema da coleção.
// Exige só o NÚCLEO que o sistema precisa (nome, cidade, vagas e tarifas com
// os campos usados no cálculo da cobrança). Todo o resto é livre: cada
// garagem pode ter comodidades, horário, observações, campos próprios...
// É o equilíbrio do document store: schema flexível, mas não "sem schema".
// ---------------------------------------------------------------------------
const TIPOS_VEICULO = ['CARRO', 'MOTO', 'UTILITARIO'];

const validador = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['nome', 'endereco', 'vagas', 'tarifas'],
    properties: {
      nome: { bsonType: 'string', minLength: 2 },
      ativa: { bsonType: 'bool' },
      endereco: {
        bsonType: 'object',
        required: ['cidade', 'uf'],
        properties: {
          cidade: { bsonType: 'string' },
          uf: { bsonType: 'string', minLength: 2, maxLength: 2 },
          localizacao: {
            bsonType: 'object',
            required: ['type', 'coordinates'],
            properties: {
              type: { enum: ['Point'] },
              coordinates: { bsonType: 'array', minItems: 2, maxItems: 2, items: { bsonType: ['double', 'int'] } },
            },
          },
        },
      },
      vagas: {
        bsonType: 'array',
        minItems: 1,
        items: {
          bsonType: 'object',
          required: ['tipo', 'total'],
          properties: {
            tipo: { enum: TIPOS_VEICULO },
            total: { bsonType: 'int', minimum: 0 },
          },
        },
      },
      tarifas: {
        bsonType: 'array',
        minItems: 1,
        items: {
          bsonType: 'object',
          required: ['tipo_veiculo', 'primeira_hora', 'hora_adicional'],
          properties: {
            tipo_veiculo: { enum: TIPOS_VEICULO },
            tolerancia_minutos: { bsonType: ['int', 'double'], minimum: 0 },
            primeira_hora: { bsonType: ['int', 'double'], minimum: 0 },
            hora_adicional: { bsonType: ['int', 'double'], minimum: 0 },
            diaria_maxima: { bsonType: ['int', 'double'], minimum: 0 },
          },
        },
      },
      comodidades: { bsonType: 'array', items: { bsonType: 'string' } },
    },
  },
};

async function conectar({ tentativas = 10, intervaloMs = 2000 } = {}) {
  for (let i = 1; ; i++) {
    try {
      await client.connect();
      break;
    } catch (err) {
      if (i === tentativas) throw err;
      console.log(
        `MongoDB indisponível (${err.message}), tentando de novo em ${intervaloMs}ms... [${i}/${tentativas}]`,
      );
      await new Promise((r) => setTimeout(r, intervaloMs));
    }
  }
  db = client.db();

  // Cria a coleção com o validador, ou atualiza o validador se já existir.
  const existe = await db.listCollections({ name: 'garagens' }).hasNext();
  if (existe) {
    await db.command({ collMod: 'garagens', validator: validador, validationLevel: 'strict' });
  } else {
    await db.createCollection('garagens', { validator: validador, validationLevel: 'strict' });
  }

  // Índices — cada um atende uma consulta real do sistema.
  const garagens = db.collection('garagens');
  await garagens.createIndexes([
    // Listagem/filtro por cidade (só garagens ativas): índice composto.
    { key: { 'endereco.cidade': 1, ativa: 1 }, name: 'idx_cidade_ativa' },
    // Busca "garagens perto de mim" ($near / $geoNear) exige 2dsphere.
    { key: { 'endereco.localizacao': '2dsphere' }, name: 'idx_localizacao_2dsphere' },
    // Filtro por comodidade: índice MULTIKEY (um item de índice por elemento do array).
    { key: { comodidades: 1 }, name: 'idx_comodidades' },
  ]);

  return db;
}

const garagens = () => db.collection('garagens');

module.exports = { client, conectar, garagens, TIPOS_VEICULO };
