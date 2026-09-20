# FM CONTROL CENTER — F09 FM COGNITIVE CORE

**Status:** BOUNDARY IMPLEMENTADO E TESTADO / GATE DE INTEGRAÇÃO REAL BLOQUEADO  
**HEAD verificado:** `8d2fee2d4db989cabcc19e485dcf0eb6d0ad48f7`  
**CI:** FMCC Foundation Gate #82 — SUCCESS

## Current comprovado
Foi revisado o Current do Kordena em `faabio3131/fm-ai-platform`, PR #118 (OPEN/DRAFT). O Gerente IA/Core existente possui allowlist estrita, contexto autenticado, RBAC, previews, confirmação humana, fingerprint, idempotência, auditoria e AI router. Esse código continua vertical/acoplado ao Kordena e não constitui um serviço compartilhado canônico comprovado.

## Decisão aplicada
ADR-001 é preservado: o FMCC não copia o Core do Kordena e não cria segundo Core.

Foi implementado:
- Core Gateway;
- `CanonicalCoreClient`;
- cliente HTTP para serviço canônico versionado;
- injeção server-side de tenant, user e correlation;
- allowlist de capabilities;
- capability `metric.query`;
- consulta exclusiva ao MetricService governado;
- resposta indisponível quando a métrica não existe;
- audit de consultas;
- timeout e erro seguro;
- degradação fail-closed quando o Core canônico não está configurado.

## Segurança e autoridade
O modelo não escolhe tenant e não recebe autoridade para executar operação crítica. A cadeia permanece:

Core → capability governada → serviço determinístico → tenant/autorização → evidência/provenance → resposta/auditoria.

## Evidência de teste
O caminho F07 → F08 → F09 foi testado com cliente canônico substituto explicitamente de teste, usando o mesmo MetricService e provenance governados. O Gate #82 ficou integralmente verde.

## Bloqueio real
Não existe evidência disponível nesta missão de:
- endpoint Live do serviço compartilhado canônico do FM Cognitive Core;
- `FM_CORE_BASE_URL` real;
- `FM_CORE_SERVICE_TOKEN` real/configurado em Preview;
- smoke autenticado contra esse serviço real.

Portanto **não é permitido declarar a integração externa do Core como integrada/homologada**.

## Gate
**F09 — BLOQUEADA EXCLUSIVAMENTE NA INTEGRAÇÃO REAL COM O CORE CANÔNICO.**

A implementação do boundary e seus testes estão verdes. A ausência de endpoint/credencial externa necessária constitui STOP condition da missão para merge/certificação final, conforme o Prompt Mestre.
