-- Schema do Serviço de Clientes (PostgreSQL)
-- Executado automaticamente na inicialização do serviço (idempotente).

-- ---------------------------------------------------------------------------
-- CLIENTE
-- Não existe coluna "tipo": um cliente é MENSALISTA quando possui pelo menos
-- um plano ativo; caso contrário é AVULSO. Derivar evita dado duplicado e
-- inconsistente (ex.: cliente marcado como mensalista sem plano).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(120) NOT NULL,
    cpf         CHAR(11)     NOT NULL UNIQUE CHECK (cpf ~ '^[0-9]{11}$'),
    email       VARCHAR(160),
    telefone    VARCHAR(20),
    criado_em   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- VEÍCULO — pertence a um cliente. A placa é a chave usada pelo Serviço de
-- Sessões no check-in/check-out, por isso é UNIQUE (o índice único também
-- serve de índice de busca).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS veiculos (
    id          SERIAL PRIMARY KEY,
    cliente_id  INTEGER      NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    placa       VARCHAR(7)   NOT NULL UNIQUE CHECK (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
    modelo      VARCHAR(80),
    cor         VARCHAR(30),
    tipo        VARCHAR(10)  NOT NULL DEFAULT 'CARRO' CHECK (tipo IN ('CARRO', 'MOTO', 'UTILITARIO')),
    criado_em   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- O Postgres NÃO cria índice automaticamente em chaves estrangeiras.
-- Sem ele, "veículos do cliente X" e o ON DELETE CASCADE fazem seq scan.
CREATE INDEX IF NOT EXISTS idx_veiculos_cliente_id ON veiculos (cliente_id);

-- ---------------------------------------------------------------------------
-- PLANO de mensalista — vincula um cliente a UMA garagem.
-- garagem_id é o _id do documento no MongoDB (Serviço de Garagens), por isso
-- é texto e não tem FK: a integridade entre bancos diferentes é validada na
-- aplicação.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS planos (
    id            SERIAL PRIMARY KEY,
    cliente_id    INTEGER       NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    garagem_id    VARCHAR(24)   NOT NULL,
    valor_mensal  NUMERIC(10,2) NOT NULL CHECK (valor_mensal > 0),
    data_inicio   DATE          NOT NULL DEFAULT CURRENT_DATE,
    data_fim      DATE,
    ativo         BOOLEAN       NOT NULL DEFAULT TRUE,
    criado_em     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_planos_cliente_id ON planos (cliente_id);

-- Regra de negócio garantida pelo banco: um cliente só pode ter UM plano
-- ativo por garagem. Índice único PARCIAL (só linhas com ativo = true):
-- planos encerrados não entram, então o histórico pode ter vários.
CREATE UNIQUE INDEX IF NOT EXISTS uq_plano_ativo_cliente_garagem
    ON planos (cliente_id, garagem_id)
    WHERE ativo;

-- Índice parcial para a consulta mais quente do serviço: o check-out do
-- Serviço de Sessões pergunta "este cliente tem plano ativo nesta garagem?".
-- Indexar só os ativos deixa o índice pequeno, mesmo com muito histórico.
CREATE INDEX IF NOT EXISTS idx_planos_ativos_garagem
    ON planos (garagem_id, cliente_id)
    WHERE ativo;
