# Serviço de Sessões

Responsável pelo check-in e check-out de veículos e pelo cálculo do valor cobrado.

**Banco:** Cassandra (DB2, wide-column) · **Porta:** 3003 · **Stack:** Node.js + Express 5 + `cassandra-driver`

## Como rodar

```bash
# na raiz do repositório (o Cassandra leva ~1 min para ficar "healthy")
docker-compose up -d cassandra

# nesta pasta (clientes-service e garagens-service precisam estar rodando)
cp .env.example .env
npm install
npm test                    # testes do cálculo de cobrança
npm run dev
npm run seed -- 20000 30    # opcional: 20 mil sessões nos últimos 30 dias
```

O keyspace, o tipo `tarifa` e as tabelas ([`db/schema.cql`](db/schema.cql)) são criados automaticamente na inicialização. Com `SEED_SE_VAZIO=10000` (padrão no docker compose), o serviço gera 10 mil sessões de exemplo em segundo plano se o Cassandra estiver vazio.

## Modelagem orientada a consultas

No Cassandra não existe JOIN, e só se filtra com eficiência pela chave de partição (e pelas colunas de clustering). Por isso a modelagem parte das **consultas**: a mesma sessão é gravada em várias tabelas (**desnormalização**), cada uma desenhada para responder a uma consulta lendo uma partição.

| Consulta | Tabela | Chave primária |
|---|---|---|
| Sessões de uma garagem num período | `sessoes_por_garagem` | `((garagem_id, dia), entrada DESC, sessao_id)` |
| Histórico de um veículo | `sessoes_por_placa` | `((placa), entrada DESC, sessao_id)` |
| Sessão aberta de uma placa (check-out) | `sessoes_abertas_por_placa` | `(placa)` |
| Quem está estacionado agora (ocupação) | `sessoes_abertas_por_garagem` | `((garagem_id), placa)` |

### Por que `(garagem_id, dia)` como partição
- Se a partição fosse só `garagem_id`, ela cresceria para sempre (*wide/hot partition*): todas as sessões da história da garagem num só nó.
- O "bucket" diário limita cada partição a um dia de movimento e distribui a carga entre os nós do cluster.
- Dentro da partição, as linhas ficam ordenadas por `entrada` (clustering DESC). "Sessões entre X e Y" vira uma leitura sequencial de um trecho, sem ordenar nada depois.
- Uma consulta de N dias lê N partições **em paralelo**.

### Desempenho medido (notebook, 1 nó em Docker, `npm run seed -- 20000 30`)

| Operação | Resultado |
|---|---|
| 40.000 escritas (20 mil sessões × 2 tabelas, `executeConcurrent`) | 4,4 s → **~9.100 escritas/s** |
| Sessões da garagem, últimas 24h (2 partições, ~200 sessões) | ~15 ms |
| Últimos 7 dias (8 partições, ~1.500 sessões) | ~40 ms |
| Últimos 30 dias (31 partições, ~6.600 sessões) | ~100 ms |

A resposta de `GET /garagens/:id/sessoes` traz `particoes_lidas` e `tempo_consulta_ms`, para demonstrar isso ao vivo.

### O que **não** foi feito, de propósito
- **Sem `ALLOW FILTERING`.** O filtro por `status` é feito na aplicação, depois de ler as partições do período. Filtrar no banco por uma coluna fora da chave obrigaria uma varredura.
- **Sem índice secundário** e **sem `count(*)`** em tabela grande. A ocupação conta as linhas de uma partição pequena (`sessoes_abertas_por_garagem`, que é limitada pela capacidade da garagem).

## Consistência sem transações relacionais

| Problema | Solução |
|---|---|
| Duas requisições de check-in da mesma placa ao mesmo tempo | `INSERT ... IF NOT EXISTS` em `sessoes_abertas_por_placa` (**lightweight transaction**, Paxos) |
| Check-out em dobro | `DELETE ... IF sessao_id = ?` (LWT) |
| Gravar a mesma sessão em 3 tabelas de forma atômica | `BATCH` **logged**: ou todas as tabelas recebem a escrita, ou nenhuma (via batchlog) |
| Batch falha depois do LWT do check-in | A reserva da placa é desfeita, também com LWT (não se mistura LWT com escrita comum na mesma linha) |

**Teste de concorrência:** 20 check-ins simultâneos da mesma placa resultaram em 1 × `201` e 19 × `409`. 20 check-outs simultâneos resultaram em 1 × `200` e 19 × `409`, com exatamente 1 sessão no histórico.

## Integração com os outros serviços

```
check-in ──► Clientes  GET /interno/mensalista       (veículo cadastrado? mensalista nesta garagem?)
         ──► Garagens  GET /interno/garagens/:id/tarifa (ativa? aceita o tipo? vagas e tarifa)
check-out ─► Clientes  GET /interno/mensalista       (confirma: o plano pode ter mudado durante a permanência)
```

- **Tarifa congelada no check-in** (tipo `tarifa`, um UDT do Cassandra): cobra-se a tarifa vigente **na entrada**, mesmo que a garagem mude a tabela durante a permanência. Assim, o check-out **não depende** do Serviço de Garagens.
- **Resiliência:** se o Serviço de Clientes estiver fora do ar, o check-in registra o veículo como avulso (com um aviso), e o check-out usa o que foi gravado na entrada (`mensalista_fonte: "CHECKIN"`). O estacionamento continua operando.
- **Capacidade:** o avulso só entra se houver vaga livre do tipo dele. O mensalista tem acesso garantido.

## Regra de cobrança ([`src/cobranca.js`](src/cobranca.js))

1. Mensalista: R$ 0.
2. Até `tolerancia_minutos`: R$ 0.
3. Caso contrário: `primeira_hora` + `hora_adicional` para cada hora (ou fração) seguinte.
4. Com `diaria_maxima`: cada 24 h completas custam a diária, e o restante é limitado à diária.

Os cálculos são feitos em centavos inteiros para não acumular erro de ponto flutuante. Há 10 testes (`npm test`).

Exemplo (Garagem Paulista, carro: tolerância de 15 min, R$ 18 a primeira hora, R$ 8 cada adicional, diária de R$ 70): 3h10 → 18 + 3 × 8 = **R$ 42**.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| POST | `/sessoes/checkin` | `{ garagem_id, placa, tipo_veiculo?, entrada? }`. O `tipo_veiculo` vem do cadastro se o veículo existir; `entrada` é opcional, para simulação |
| POST | `/sessoes/checkout` | `{ placa, saida? }`. Devolve `minutos`, `regra`, `valor` |
| GET | `/sessoes/abertas/:placa` | Sessão aberta + `valor_se_sair_agora` |
| GET | `/garagens/:garagem_id/sessoes?inicio=&fim=&status=` | Sessões do período (padrão: últimas 24 h, máximo de 31 dias) + `resumo` (faturamento, ticket médio, permanência média) |
| GET | `/garagens/:garagem_id/ocupacao` | Vagas ocupadas e livres por tipo + veículos estacionados |
| GET | `/veiculos/:placa/sessoes?limite=20` | Histórico do veículo |
| DELETE | `/sessoes/:sessao_id?garagem_id=&placa=&entrada=` | Exclui uma sessão. Se estiver aberta, cancela o check-in e libera a vaga |

**Por que o DELETE pede `garagem_id`, `placa` e `entrada`?** No Cassandra não existe `DELETE ... WHERE sessao_id = ?`: é preciso a chave primária completa de cada tabela, ou seja, a partição `(garagem_id, dia)` (o dia vem da `entrada`) mais o clustering. Esses valores já vêm em todas as listagens da API. Se a sessão estiver aberta, a reserva da placa é removida com LWT (`IF sessao_id = ?`), e só então a vaga é liberada. Uma sessão fechada nunca toca nas tabelas de "abertas", porque a mesma placa pode estar estacionada de novo, em outra sessão.

Datas em ISO 8601 (`2026-11-09T14:30:00Z`). Os buckets diários são em UTC.

### Erros
`400` validação · `404` garagem ou sessão não encontrada · `409` placa já estacionada, garagem lotada ou inativa, tipo de veículo não aceito, check-out em dobro · `503` Serviço de Garagens fora do ar no check-in
