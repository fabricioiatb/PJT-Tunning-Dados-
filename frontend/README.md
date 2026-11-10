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

## Diretrizes de interface

A interface foi revisada e refeita seguindo as [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) da Vercel:

| Área | O que foi aplicado |
|---|---|
| Acessibilidade | Link "Pular para o conteúdo", `h1` por página e `h2` por cartão, abas como links (`aria-current`), tabelas com `caption`/`scope`, barras de ocupação com `role="meter"`, gráfico com descrição textual, mensagens com `aria-live` |
| Foco | `:focus-visible` em tudo; o topo fixo não cobre o elemento focado (`scroll-padding-top`) |
| Formulários | `name`, `autocomplete="off"`, `spellCheck={false}` e `inputMode` corretos; placeholders com exemplo terminando em `…`; botão habilitado até a requisição começar, com spinner durante; foco vai para a mensagem de erro; aviso antes de sair com o formulário preenchido |
| Ações destrutivas | Diálogo de confirmação acessível (`<dialog>`, Esc fecha) explicando a consequência, em vez do `confirm()` do navegador |
| URL = estado | Aba, garagem, período, status, busca, cliente selecionado e placa pesquisada ficam no endereço (`#relatorios?periodo=30d&garagem=…`). Dá para recarregar, compartilhar o link e usar voltar/avançar |
| Tema | Claro e escuro automáticos (`prefers-color-scheme`), `color-scheme`, `theme-color`, `<select>` com cores explícitas |
| Movimento | Animações só de `transform`/`opacity`, sem `transition: all`, e respeitam `prefers-reduced-motion` |
| Conteúdo | Números com `tabular-nums`, textos longos truncados, estados vazios com orientação, mensagens de erro com o próximo passo (ex.: como iniciar um serviço fora do ar) |
| Internacionalização | Datas, moeda, números e percentuais com `Intl.*`; placas, IDs e nomes de bancos com `translate="no"` |
| Desempenho | Linhas de tabela e lista com `content-visibility: auto`; tabela de sessões paginada ("Mostrar mais") |
| Toque e telas | `touch-action: manipulation`, `overscroll-behavior` em áreas roláveis, `safe-area-inset` para telas com entalhe |

Desvio consciente: a regra de *Title Case* em títulos e botões é uma convenção do inglês; em português foi mantida a capitalização normal ("Registrar entrada").

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
