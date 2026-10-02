# FM Command — Capability Completion Matrix

Data: 2026-10-01

| Capability | API/Service | Web | Permission | Estado |
|---|---|---|---|---|
| Dashboard executivo | Metric/Product/Alert services | /dashboard | metric:read/product:read | COMPLETE |
| Produtos | Product Registry/Intelligence | /dashboard + /products/[id] | product:read | COMPLETE |
| Financeiro | Financial Intelligence | /dashboard/finance | metric:read | COMPLETE |
| Growth/Comercial | Growth Intelligence | /dashboard/growth | metric:read | COMPLETE |
| Clientes | Customer Intelligence | /dashboard/customers | metric:read | COMPLETE |
| Operações | Operations Intelligence | /dashboard/operations | metric:read | COMPLETE |
| Alertas governados | Alert services/APIs | /dashboard/alerts | alert:read/write | COMPLETE; scheduler external blocked |
| Core governado | Core Gateway | /dashboard/intelligence | metric:read | COMPLETE |
| Kordena leitura | KordenaCommercialControlService | /dashboard/commercial/kordena | commercial:read | COMPLETE após fix |
| Kordena mutação | command API + step-up + approval | admin form | commercial:write | COMPLETE contratualmente; runtime externo revalidação pendente |
| Source Registry | SourceRegistryService/APIs | /dashboard/sources | source:read/write | COMPLETE |
| Onboarding | Better Auth Organization | /onboarding | sessão autenticada | COMPLETE após guarda server-side |
| Metric Registry | Metric Engine | superfícies executivas | metric:read | PARTIAL por 8 semânticas externas |
| Fontes reais | Connector Runtime | várias | integration/source permissions | EXTERNAL_BLOCKED conforme provider/credential/semântica |
| Alert automation scheduler | internal automation endpoint | não aplicável | scheduler secret | EXTERNAL_BLOCKED / RUNTIME_SECRET_REQUIRED |

## Meta de órfãos
- IMPLEMENTED_NOT_REACHABLE: 0 identificado após correções.
- REACHABLE_NOT_AUTHORIZED_CORRECTLY: 0 identificado nos findings corrigidos.
- UI_WITHOUT_BACKEND: 0 identificado nas capacidades listadas; busca/notificação premium permanecem explicitamente indisponíveis e não interativas.
- BACKEND_WITHOUT_UI: 0 identificado para capacidades humanas listadas.
- PARTIAL interno corrigível: 0 conhecido; PARTIAL restante depende de semântica/fonte externa.
