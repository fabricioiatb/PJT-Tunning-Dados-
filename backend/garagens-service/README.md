# Serviço de Garagens

Responsável pelo CRUD das unidades da rede: endereço, vagas por tipo e tabela de tarifas.

**Banco:** MongoDB (DB1, document store) · **Porta:** 3002 · **Stack:** Node.js + Express 5 + driver oficial `mongodb`

## Como rodar

```bash
# na raiz do repositório
docker-compose up -d mongo

# nesta pasta
cp .env.example .env
npm install
npm run seed       # 4 garagens de exemplo (com _id fixos)
npm run dev
```

Na inicialização o serviço cria a coleção `garagens` com o validador `$jsonSchema` e os índices (ou atualiza o validador, se a coleção já existir).

## Por que um document store

Cada garagem tem uma estrutura própria, e o seed mostra isso de propósito:

| Garagem | Particularidades |
|---|---|
| Garagem Paulista | carro + moto, `carregadores_eletricos[]` com potência e conector |
| Estacionamento Pinheiros | só carro, `horario_funcionamento` por dia da semana, `lava_rapido.servicos[]` |
| Park Center Campinas | carro + moto + utilitário (`altura_maxima_m`), `convenios[]` com desconto |
| Garagem Centro Rio | inativa, com `observacao` |

Vagas e tarifas ficam **embutidas** no documento: são sempre lidas junto com a garagem e não existem fora dela. Assim, uma leitura traz tudo, sem joins.

### Schema flexível, mas não "sem schema"
O validador `$jsonSchema` ([src/db.js](src/db.js)) exige apenas o **núcleo** que o sistema usa:
- `nome`, `endereco.cidade`, `endereco.uf`
- `vagas[]` com `tipo` (`CARRO` | `MOTO` | `UTILITARIO`) e `total >= 0`
- `tarifas[]` com `tipo_veiculo`, `primeira_hora` e `hora_adicional` (e opcionalmente `tolerancia_minutos` e `diaria_maxima`)

Qualquer outro campo é aceito livremente. Um documento fora da regra é recusado pelo **próprio banco** (erro 121), e a API devolve a lista do que falhou:

```json
{ "erro": "Documento não passou na validação do schema",
  "detalhe": ["endereco: faltando uf", "tarifas[0]: faltando hora_adicional, primeira_hora"] }
```

### Índices
| Índice | Consulta atendida |
|---|---|
| `{ endereco.cidade: 1, ativa: 1 }` (composto) | `GET /garagens?cidade=...` |
| `{ endereco.localizacao: "2dsphere" }` (geoespacial) | `GET /garagens/proximas` (`$geoNear`, ordenado por distância) |
| `{ comodidades: 1 }` (**multikey**, um item de índice por elemento do array) | `GET /garagens?comodidade=...`. O `explain()` mostra `IXSCAN idx_comodidades` |

No endpoint interno de tarifa, a projeção com `$elemMatch` faz o MongoDB devolver só o item de tarifa e de vaga do tipo de veículo pedido, e não o documento inteiro.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/garagens?cidade=&comodidade=&tipo_vaga=&ativa=` | Lista com filtros (inclui `total_vagas` calculado) |
| GET | `/garagens/proximas?lat=&lng=&raio_km=5` | Garagens ativas no raio, com `distancia_m` |
| GET | `/garagens/:id` | Detalhe |
| POST | `/garagens` | Cria (ver exemplo abaixo) |
| PUT | `/garagens/:id` | Substitui o documento inteiro (campos omitidos são removidos) |
| PATCH | `/garagens/:id` | Atualização parcial (`$set`) |
| DELETE | `/garagens/:id` | Remove |

Exemplo de `POST /garagens`. A `localizacao` pode ser enviada como `{ lat, lng }`, que é convertida para GeoJSON; os tipos aceitam minúsculas:

```json
{
  "nome": "Garagem Santos",
  "endereco": { "cidade": "Santos", "uf": "SP", "localizacao": { "lat": -23.96, "lng": -46.33 } },
  "vagas":   [{ "tipo": "CARRO", "total": 50 }],
  "tarifas": [{ "tipo_veiculo": "CARRO", "tolerancia_minutos": 15, "primeira_hora": 12, "hora_adicional": 6, "diaria_maxima": 50 }],
  "comodidades": ["coberta"],
  "vista_mar": true
}
```

### Interno (usado pelo Serviço de Sessões)
`GET /interno/garagens/:id/tarifa?tipo_veiculo=CARRO`

```json
{
  "garagem_id": "6720a0000000000000000001",
  "nome": "Garagem Paulista",
  "ativa": true,
  "tipo_veiculo": "CARRO",
  "aceita_tipo": true,
  "total_vagas": 120,
  "tarifa": { "tolerancia_minutos": 15, "primeira_hora": 18, "hora_adicional": 8, "diaria_maxima": 70 }
}
```

Também é consultado pelo **Serviço de Clientes** ao criar um plano: a garagem precisa existir e estar ativa. É a integridade referencial entre bancos diferentes, feita pela aplicação.
