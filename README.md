# PJT - Tunning de Dados / Garagem Poliglota

Projeto da disciplina **CCD410 — Performance e Tuning de Dados**, sobre **Polyglot Persistence**.

## 1. Tema

Um sistema de gestão para uma **rede de estacionamentos e garagens**: cadastro de clientes e seus veículos, cadastro das unidades da rede com suas vagas e tarifas, e o controle operacional de entrada e saída de veículos, com cálculo automático de quanto cada permanência custa.

O sistema distingue dois tipos de cliente:
- **Mensalista** — vinculado a uma garagem específica através de um plano; ao sair, não gera cobrança adicional.
- **Avulso** — paga pelo tempo de permanência, calculado a partir da tarifa da garagem usada.

Não há reserva de vaga: o mensalista já é credenciado (acesso garantido na sua garagem) e o avulso simplesmente usa uma vaga livre quando chega.

## 2. Bancos utilizados e arquitetura do backend

Cada banco foi escolhido pelo formato e pelo padrão de acesso do dado que ele guarda.

### RDB — PostgreSQL
Guarda **Cliente**, **Veículo** e **Plano**. Esses dados têm relação forte entre si e pedem integridade referencial e transação (ex.: fechar uma mensalidade não pode deixar o plano num estado inconsistente) — o caso de uso clássico de um banco relacional.

### DB1 — MongoDB (document store)
Guarda **Garagem**. Cada unidade da rede tem uma estrutura própria — tipos de vaga, faixas de tarifa, comodidades — que varia de unidade para unidade. Um schema flexível encaixa melhor do que colunas fixas.

### DB2 — Cassandra (wide-column)
Guarda **Sessão** (entrada/saída de veículos), particionada por garagem e ordenada por horário. Alto volume de escrita e a consulta típica é sempre "sessões desta garagem num intervalo de tempo" — um padrão de série temporal, o caso de uso canônico de wide-column.

### Backend

Dividido em **3 serviços independentes** (Node.js + Express), cada um dono de exatamente um banco:

| Serviço | Banco | Responsabilidade |
|---|---|---|
| [`clientes-service`](backend/clientes-service) | PostgreSQL | CRUD de cliente, veículo e plano de mensalista |
| [`garagens-service`](backend/garagens-service) | MongoDB | CRUD das unidades da rede: endereço, vagas por tipo, tarifas |
| [`sessoes-service`](backend/sessoes-service) | Cassandra | Check-in e check-out; consulta os outros dois serviços para decidir mensalista × avulso e calcular o valor |

O [`frontend`](frontend) (React) consome as APIs dos três serviços — nunca acessa um banco diretamente.

## 3. Como executar

### Pré-requisitos
- [Docker](https://www.docker.com/) e Docker Compose
- [Node.js](https://nodejs.org/) 20+

### Subindo os bancos de dados

```bash
docker-compose up -d
```

Isso sobe PostgreSQL (`localhost:5433`), MongoDB (`localhost:27017`) e Cassandra (`localhost:9042`).

### Serviços de backend e frontend

> O Postgres usa a porta **5433** no host, para não conflitar com um PostgreSQL instalado localmente.

Cada serviço roda em um terminal separado:

```bash
cd backend/clientes-service
cp .env.example .env
npm install
npm run dev        # http://localhost:3001
```

| Serviço | Porta | Status |
|---|---|---|
| [`clientes-service`](backend/clientes-service) | 3001 | ✅ Pronto |
| [`garagens-service`](backend/garagens-service) | 3002 | Em construção |
| [`sessoes-service`](backend/sessoes-service) | 3003 | Em construção |
| [`frontend`](frontend) | 5173 | Em construção |

## Estrutura do repositório

```
.
├── backend/
│   ├── clientes-service/   # RDB — PostgreSQL
│   ├── garagens-service/   # DB1 — MongoDB
│   └── sessoes-service/    # DB2 — Cassandra
├── frontend/                # React
└── docker-compose.yml
```
