# FM CONTROL CENTER — F15 CLIENTES, USO E SUPORTE

**Fase:** F15 — 85% → 88%  
**Status inicial:** CURRENT DISCOVERY + SYSTEM DESIGN

## Current Discovery

Autoridades existentes:
- organização/tenant para cliente institucional;
- Better Auth para usuário/sessão;
- Product Registry para produto;
- canonical facts para eventos de origem externa.

Não existe:
- ticketing provider canônico;
- modelo de feedback;
- semântica de adoção aprovada;
- score de cliente em risco;
- fonte de eventos de uso já conectada.

## Design

Facts suportados quando provenientes de fonte autorizada:
- `usage.active_user.day`;
- `usage.engagement_event`;
- `support.ticket.opened`.

Métricas base:
- `usage.active_users.dau`;
- `usage.engagement.events`;
- `support.ticket.open.count`.

Permanecem pending_semantics:
- MAU;
- feature adoption rate;
- customer risk score;
- experience score.

Não haverá score mágico. A superfície apresenta sinais individuais e diferencia fato, ausência e semântica pendente.

PII não deve ser replicada no payload de métricas quando não necessária.
