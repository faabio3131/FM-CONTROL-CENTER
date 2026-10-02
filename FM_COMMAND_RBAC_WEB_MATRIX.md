# FM Command — RBAC × Web Matrix

Data: 2026-10-01

| Superfície | Permissão canônica | Owner | Admin | Analyst | Viewer | Member |
|---|---|---:|---:|---:|---:|---:|
| Visão geral | metric:read | sim | sim | sim | sim | sim |
| Produtos | product:read | sim | sim | sim | sim | sim |
| Financeiro | metric:read | sim | sim | sim | sim | sim |
| Comercial/Growth | metric:read | sim | sim | sim | sim | sim |
| Clientes | metric:read | sim | sim | sim | sim | sim |
| Operações | metric:read | sim | sim | sim | sim | sim |
| Incidentes/Alertas | alert:read | sim | sim | sim | sim | sim |
| Core | metric:read | sim | sim | sim | sim | sim |
| Kordena read | commercial:read | sim | sim | sim | sim | sim |
| Fontes e Integrações | source:read | sim | sim | sim | não | não |
| Kordena write | commercial:write + step-up/approval | sim | sim | não | não | não |

## Correções executadas
- COMMAND_NAVIGATION passou a declarar a Permission de cada item e é filtrada por roleHasPermission.
- Viewer/Member não veem Fontes e Integrações.
- Viewer/Member continuam vendo Kordena porque commercial:read é suficiente.
- Ocultação de menu não substitui proteção server-side.
- A página de fontes continua exigindo source:read no servidor.
- A página Kordena usa CommercialSourceResolver tenant-scoped e não SourceRegistryService.list.

## Testes
- commercial-source-resolver.unit.test.ts: owner/admin/analyst/viewer/member + tenant isolation + source admin denied.
- command-navigation.unit.test.ts: visibilidade por role.
- kca12-commercial-security.test.ts: commercial read/write e step-up contract.
