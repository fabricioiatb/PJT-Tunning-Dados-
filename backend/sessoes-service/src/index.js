require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { conectar, db } = require('./db');
const { errorHandler } = require('./errors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
  await db().execute('SELECT release_version FROM system.local');
  res.json({ status: 'ok', servico: 'sessoes-service', banco: 'cassandra' });
});

app.use('/sessoes', require('./routes/sessoes'));
app.use('/', require('./routes/consultas'));

app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));
app.use(errorHandler);

const PORT = process.env.PORT || 3003;

conectar()
  .then(() => {
    app.listen(PORT, () => console.log(`sessoes-service ouvindo em http://localhost:${PORT}`));

    // Ambiente novo (ex.: docker compose): gera histórico de exemplo em
    // segundo plano se o Cassandra estiver vazio. SEED_SE_VAZIO = quantidade.
    const qtd = parseInt(process.env.SEED_SE_VAZIO, 10);
    if (qtd > 0) {
      require('./seed')
        .gerarSeVazio(qtd, 30)
        .catch((err) => console.error('Seed de sessões falhou:', err.message));
    }
  })
  .catch((err) => {
    console.error('Falha ao conectar no Cassandra:', err.message);
    process.exit(1);
  });
