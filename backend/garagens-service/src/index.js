require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { client, conectar } = require('./db');
const { errorHandler } = require('./errors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
  await client.db().command({ ping: 1 });
  res.json({ status: 'ok', servico: 'garagens-service', banco: 'mongodb' });
});

app.use('/garagens', require('./routes/garagens'));
app.use('/interno', require('./routes/interno'));

app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));
app.use(errorHandler);

const PORT = process.env.PORT || 3002;

conectar()
  .then(async () => {
    // Ambiente novo (ex.: docker compose): popula com exemplos se estiver vazio.
    if (process.env.SEED_SE_VAZIO === 'true') await require('./seed').popular({ somenteSeVazio: true });
  })
  .then(() => {
    app.listen(PORT, () => console.log(`garagens-service ouvindo em http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Falha ao conectar no MongoDB:', err.message);
    process.exit(1);
  });
