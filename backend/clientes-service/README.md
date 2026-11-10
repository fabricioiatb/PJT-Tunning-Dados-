# Serviço de Clientes

Responsável pelo CRUD de clientes, veículos e planos de mensalista.

**Banco:** PostgreSQL (RDB) · **Porta:** 3001 · **Stack:** Node.js + Express 5 + `pg`

## Como rodar

```bash
# na raiz do repositório: sobe o Postgres (porta 5433 no host)
docker-compose up -d postgres

# nesta pasta
cp .env.example .env
npm install
npm run dev
```

O schema ([`db/schema.sql`](db/schema.sql)) é aplicado automaticamente na inicialização (idempotente, `CREATE ... IF NOT EXISTS`).

`npm run seed` insere 4 clientes de exemplo (com veículos e planos nas garagens do seed do MongoDB). No docker compose isso acontece sozinho se o banco estiver vazio (`SEED_SE_VAZIO=true`).

Sem `.env`, o serviço usa os valores padrão do docker compose (`localhost:5433` e Serviço de Garagens em `localhost:3002`). As datas (`CURRENT_DATE`) usam o fuso `America/Sao_Paulo`, configurável em `DB_TIMEZONE`.

## Modelo de dados

```
clientes 1 ──< veiculos      (placa UNIQUE)
clientes 1 ──< planos        (garagem_id = _id da garagem no MongoDB)
```

- **Tipo do cliente é derivado**: `MENSALISTA` se tem plano vigente, senão `AVULSO`. Não há coluna `tipo`, para não ter dado duplicado que possa ficar inconsistente.
- `garagem_id` não tem FK porque a garagem vive em outro banco (MongoDB). Ao criar um plano, o serviço consulta o **Serviço de Garagens** (`GARAGENS_SERVICE_URL`) para confirmar que a garagem existe e está ativa. Se o serviço estiver fora do ar, a resposta é `503`. Sem a variável configurada, só o formato do ObjectId é validado.

### Decisões de integridade e desempenho

| Recurso | Para quê |
|---|---|
| `UNIQUE (cpf)`, `UNIQUE (placa)` + `CHECK` de formato | Integridade garantida pelo banco, não só pela aplicação |
| `ON DELETE CASCADE` | Apagar o cliente remove os veículos e planos dele |
| `idx_veiculos_cliente_id`, `idx_planos_cliente_id` | O Postgres **não** indexa FKs sozinho; sem eles, os joins e o cascade fazem seq scan |
| `uq_plano_ativo_cliente_garagem` (único **parcial**, `WHERE ativo`) | Regra de negócio no banco: só 1 plano ativo por cliente/garagem, mas o histórico de planos encerrados é livre |
| `idx_planos_ativos_garagem` (parcial, `WHERE ativo`) | Atende a consulta mais frequente (check-out). Fica pequeno porque não indexa o histórico. O `EXPLAIN` mostra *Index Only Scan* |
| Transação em `POST /clientes` | Cliente + veículos são gravados juntos: se uma placa falhar, o cliente também não é criado |
| Transação + `SELECT ... FOR UPDATE` em `PATCH /planos/:id/encerrar` | Trava a linha contra encerramentos ou alterações concorrentes |

## Endpoints

### Clientes
| Método | Rota | Descrição |
|---|---|---|
| GET | `/clientes?busca=` | Lista (busca por nome ou CPF), com `tipo` e `qtd_veiculos` |
| GET | `/clientes/:id` | Detalhe com `veiculos` e `planos` |
| POST | `/clientes` | `{ nome, cpf, email?, telefone?, veiculos?: [{ placa, modelo?, cor?, tipo? }] }` |
| PUT | `/clientes/:id` | Atualização parcial (`nome`, `cpf`, `email`, `telefone`) |
| DELETE | `/clientes/:id` | Remove em cascata |

### Veículos
| Método | Rota | Descrição |
|---|---|---|
| GET | `/veiculos?cliente_id=&placa=` | Lista com filtros |
| GET | `/veiculos/:id` | Detalhe |
| POST | `/veiculos` | `{ cliente_id, placa, modelo?, cor?, tipo? }` — `tipo`: `CARRO` \| `MOTO` \| `UTILITARIO` |
| PUT | `/veiculos/:id` | Atualização parcial |
| DELETE | `/veiculos/:id` | Remove |

Placas aceitam formato antigo e Mercosul, com ou sem hífen e em qualquer caixa (`abc-1d23` → `ABC1D23`).

### Planos (mensalista)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/planos?cliente_id=&garagem_id=&ativo=` | Lista com filtros |
| GET | `/planos/:id` | Detalhe (com `vigente`) |
| POST | `/planos` | `{ cliente_id, garagem_id, valor_mensal, data_inicio? }` |
| PUT | `/planos/:id` | `{ valor_mensal }` |
| PATCH | `/planos/:id/encerrar` | Encerra (`ativo = false`, `data_fim = hoje`) |
| DELETE | `/planos/:id` | Remove (no frontend: só planos já encerrados) |

### Interno (usado pelo Serviço de Sessões)
`GET /interno/mensalista?placa=ABC1D23&garagem_id=<ObjectId>`

```json
{
  "placa": "ABC1D23",
  "veiculo_cadastrado": true,
  "veiculo_id": 1,
  "tipo_veiculo": "CARRO",
  "cliente_id": 1,
  "cliente_nome": "Joao Silva",
  "mensalista": true,
  "plano": { "id": 1, "valor_mensal": 350, "data_inicio": "2026-11-09", "data_fim": null }
}
```

Placa não cadastrada → `{ "placa": "...", "veiculo_cadastrado": false, "mensalista": false }` (o carro entra como avulso).

### Erros
Respostas de erro vêm como `{ "erro": "..." }`: `400` para validação, FK ou formato inválido; `404` quando o registro não existe; `409` para duplicidade (CPF, placa ou plano ativo) e para plano já encerrado.
