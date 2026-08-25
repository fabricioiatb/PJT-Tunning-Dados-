# Serviço de Sessões

Responsável pelo check-in e check-out de veículos e pelo cálculo do valor cobrado.

**Banco:** Cassandra (DB2 — wide-column)

**Endpoints previstos:**
- Check-in (abre uma sessão)
- Check-out (consulta o Serviço de Clientes para saber se é mensalista; se for avulso, consulta o Serviço de Garagens para pegar a tarifa e calcula o valor pelo tempo de permanência)
- Consulta de sessões por garagem e período

> Em construção — Fase 3 do roteiro de implementação.
