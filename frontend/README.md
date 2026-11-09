# Frontend

Interface em React (Vite) que consome os três serviços de backend. **Nunca acessa um banco diretamente**, só as APIs.

## Como rodar

```bash
# com os 3 serviços de backend rodando
cp .env.example .env
npm install
npm run dev        # http://localhost:5173
```

As URLs dos serviços ficam no `.env` (`VITE_CLIENTES_API_URL`, `VITE_GARAGENS_API_URL`, `VITE_SESSOES_API_URL`).

## Telas

| Aba | O que faz | Serviço / banco |
|---|---|---|
| **Operação** | Check-in e check-out com recibo (valor, regra aplicada, tarifa); ocupação da garagem em tempo real, com o botão "Saída" em cada veículo | Sessões (Cassandra), que consulta Clientes e Garagens |
| **Clientes** | Busca, cadastro (cliente + veículo na mesma transação), veículos e planos de mensalista (criar e encerrar) | Clientes (PostgreSQL) |
| **Garagens** | Cartões com vagas, tarifas, comodidades e os **campos específicos de cada garagem** (schema flexível); cadastro com campos extras em JSON livre; ativar, desativar e excluir | Garagens (MongoDB) |
| **Relatórios** | Faturamento, ticket médio, permanência média e gráfico por hora ou dia de uma garagem (24 h, 7 dias, 30 dias), mostrando quantas **partições do Cassandra** foram lidas e em quanto tempo; histórico de um veículo | Sessões (Cassandra) |

No topo, um indicador mostra se cada serviço/banco está no ar (verifica o `/health` a cada 10 s).

## Estrutura

```
src/
├── api.js          # cliente HTTP dos 3 serviços + formatação (R$, datas, duração)
├── ui.jsx          # componentes e hooks compartilhados
├── App.jsx         # abas (no endereço: #operacao, #clientes...) e status dos serviços
├── styles.css
└── pages/
    ├── Operacao.jsx
    ├── Clientes.jsx
    ├── Garagens.jsx
    └── Relatorios.jsx
```
