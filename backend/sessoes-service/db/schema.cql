-- Schema do Serviço de Sessões (Cassandra)
-- Executado automaticamente na inicialização (idempotente).
--
-- No Cassandra a modelagem parte das CONSULTAS, não das entidades: não há
-- JOIN e só se filtra eficientemente pela chave de partição (+ clustering).
-- Por isso a mesma sessão é gravada em várias tabelas (desnormalização),
-- cada uma desenhada para responder UMA consulta lendo UMA partição.
--
--   Consulta                                         Tabela
--   ------------------------------------------------ ---------------------------
--   Q1 sessões de uma garagem num período            sessoes_por_garagem
--   Q2 histórico de um veículo                       sessoes_por_placa
--   Q3 sessão aberta de uma placa (check-out) e      sessoes_abertas_por_placa
--      impedir check-in duplicado
--   Q4 veículos estacionados agora numa garagem      sessoes_abertas_por_garagem
--      (ocupação)

-- Ambiente de desenvolvimento: 1 nó. Em produção seria
-- NetworkTopologyStrategy com RF 3 por datacenter.
CREATE KEYSPACE IF NOT EXISTS garagem_sessoes
  WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

-- Tarifa "congelada" no check-in (UDT). O valor cobrado usa a tarifa vigente
-- na ENTRADA, mesmo que a garagem mude a tabela durante a permanência.
CREATE TYPE IF NOT EXISTS garagem_sessoes.tarifa (
  tolerancia_minutos int,
  primeira_hora      decimal,
  hora_adicional     decimal,
  diaria_maxima      decimal
);

-- Q1 — partição (garagem_id, dia): uma partição por garagem por dia.
-- Só garagem_id faria a partição crescer para sempre (hot/wide partition);
-- o "bucket" diário limita o tamanho (~milhares de linhas) e espalha a carga
-- entre os nós. Dentro da partição as linhas ficam ORDENADAS por entrada
-- (DESC), então "entrada entre X e Y" é uma leitura sequencial de um trecho.
CREATE TABLE IF NOT EXISTS garagem_sessoes.sessoes_por_garagem (
  garagem_id    text,
  dia           date,
  entrada       timestamp,
  sessao_id     uuid,
  placa         text,
  tipo_veiculo  text,
  cliente_id    int,
  mensalista    boolean,
  saida         timestamp,
  minutos       int,
  valor         decimal,
  status        text,
  PRIMARY KEY ((garagem_id, dia), entrada, sessao_id)
) WITH CLUSTERING ORDER BY (entrada DESC, sessao_id ASC);

-- Q2 — histórico de um veículo, mais recente primeiro.
CREATE TABLE IF NOT EXISTS garagem_sessoes.sessoes_por_placa (
  placa         text,
  entrada       timestamp,
  sessao_id     uuid,
  garagem_id    text,
  garagem_nome  text,
  tipo_veiculo  text,
  mensalista    boolean,
  saida         timestamp,
  minutos       int,
  valor         decimal,
  status        text,
  PRIMARY KEY ((placa), entrada, sessao_id)
) WITH CLUSTERING ORDER BY (entrada DESC, sessao_id ASC);

-- Q3 — no máximo UMA sessão aberta por placa. O check-in usa
-- INSERT ... IF NOT EXISTS (lightweight transaction / Paxos) aqui, o que
-- impede dois check-ins simultâneos da mesma placa.
CREATE TABLE IF NOT EXISTS garagem_sessoes.sessoes_abertas_por_placa (
  placa         text PRIMARY KEY,
  sessao_id     uuid,
  garagem_id    text,
  garagem_nome  text,
  entrada       timestamp,
  tipo_veiculo  text,
  cliente_id    int,
  mensalista    boolean,
  tarifa        frozen<tarifa>
);

-- Q4 — quem está estacionado agora. Partição por garagem é segura aqui:
-- o tamanho é limitado pela capacidade física da garagem.
CREATE TABLE IF NOT EXISTS garagem_sessoes.sessoes_abertas_por_garagem (
  garagem_id    text,
  placa         text,
  sessao_id     uuid,
  entrada       timestamp,
  tipo_veiculo  text,
  mensalista    boolean,
  PRIMARY KEY ((garagem_id), placa)
);
