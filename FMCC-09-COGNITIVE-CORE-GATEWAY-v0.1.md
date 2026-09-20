# FM CONTROL CENTER — F09 FM COGNITIVE CORE

**Status:** EM EXECUÇÃO / INTEGRAÇÃO EXTERNA A VALIDAR

## Current comprovado
Foi revisado o Current do Kordena em `faabio3131/fm-ai-platform`, PR #118 (OPEN/DRAFT). O Gerente IA/Core existente possui allowlist estrita, contexto autenticado, RBAC, previews, confirmação humana, fingerprint, idempotência, auditoria e AI router. Esse código continua vertical/acoplado ao Kordena e não constitui um serviço compartilhado canônico comprovado.

## Decisão aplicada
ADR-001 é preservado: o FMCC não copia o Core do Kordena e não cria segundo Core. Foi implementado um Core Gateway que consome um serviço canônico versionado por HTTP quando `FM_CORE_BASE_URL` e `FM_CORE_SERVICE_TOKEN` existirem no ambiente seguro.

## Capabilities FMCC
Allowlist implementada nesta fase:
- `metric.query`.

`source.status` permanece fora da allowlist até existir uma capability governada e fonte autorizada correspondente; não é anunciada como implementada.

O Gateway injeta tenant/user/correlation server-side; o modelo não escolhe tenant. `metric.query` consulta somente o MetricService governado. Métrica ausente retorna indisponível sem síntese inventada.

## Limite atual
Nenhum endpoint/credencial real do serviço Core canônico foi comprovado nesta missão até este ponto. Portanto não se declara integração externa Live antes de smoke real.

## Gate
Implementação e testes de boundary podem ficar verdes; integração real permanece condicionada à existência comprovada do serviço canônico e credencial segura.
