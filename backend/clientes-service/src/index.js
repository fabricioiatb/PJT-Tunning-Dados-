require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { pool, initSchema } = require('./db');
const { errorHandler } = require('./errors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', servico: 'clientes-service', banco: 'postgresql' });
});

app.use('/clientes', require('./routes/clientes'));
app.use('/veiculos', require('./routes/veiculos'));
app.use('/planos', require('./routes/planos'));
app.use('/interno', require('./routes/interno'));

app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

initSchema()
  .then(async () => {
    // Ambiente novo (ex.: docker compose): popula com exemplos se estiver vazio.
    if (process.env.SEED_SE_VAZIO === 'true') await require('./seed').popular({ somenteSeVazio: true });
  })
  .then(() => {
    app.listen(PORT, () => console.log(`clientes-service ouvindo em http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Falha ao inicializar o schema do Postgres:', err.message);
    process.exit(1);
  });
