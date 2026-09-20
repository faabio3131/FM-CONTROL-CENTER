# FM CONTROL CENTER — F09 FM COGNITIVE CORE

**Status:** IMPLEMENTAÇÃO CANÔNICA + GATEWAYS TESTADOS / PREVIEW E2E PENDENTE  
**Branch FMCC:** `feat/fmcc-f07-f10-intelligence-stack`  
**Core canônico:** `faabio3131/fm-ai-platform` / `feat/web-parity-v1-total-original-migration`

## Current comprovado
A descoberta confirmou que o Gerente IA/Core existente no `fm-ai-platform` já possuía AI Model Router, Control Plane, metering, SecretStore, governança de capabilities e runtime cognitivo. O problema não era ausência de Core; faltava uma superfície compartilhada, versionada e deployável para consumidores como o FM Control Center.

A lacuna foi corrigida sem copiar o Core:
- PR #121 criou a API canônica compartilhada `/v1/fmcc/plan` e `/v1/fmcc/synthesize`;
- PR #122 criou runtime FastAPI dedicado, isolado das superfícies operacionais do Kordena;
- PR #123 adicionou contexto operacional governado e síntese analítica para explicação, correlação, padrões, anomalias, risco e recomendação;
- as três mudanças foram integradas na branch canônica da PR #118.

Commits canônicos relevantes:
- `eb4ca1530885ce6da63f2df5ba9953d8f2eafab8` — serviço compartilhado;
- `13890d20179842d2ea61cf37c65b9ffd5a39e82e` — runtime dedicado deployável;
- `24b0c93843dd99c95db57f894945f3735da35582` — contexto e inteligência analítica governada.

## Implementação no FMCC
- Core Gateway;
- `CanonicalCoreClient`;
- cliente HTTP versionado;
- autenticação service-to-service por Bearer;
- tenant/user/correlation injetados server-side;
- allowlist de capabilities;
- `metric.query`;
- `metrics.query_many` para perguntas que exigem múltiplos fatos governados;
- MetricService como autoridade determinística;
- operational context recuperado do audit ledger por tenant + usuário;
- contexto histórico tratado apenas como continuidade, nunca como fonte factual;
- provenance-aware answers;
- timeout e erro seguro;
- audit de perguntas/respostas/evidence refs;
- fail-closed quando serviço canônico não está configurado.

## Capacidades cognitivas cobertas
Com facts/evidence governados, a camada canônica está apta a:
- explicar indicadores;
- correlacionar múltiplas métricas;
- destacar padrões;
- sinalizar anomalias;
- analisar risco;
- recomendar próximos passos;
- preservar continuidade contextual.

Essas capacidades não criam nova autoridade. O Core somente analisa os fatos entregues pelo Metric Engine e demais serviços aprovados.

## Cadeia de autoridade
Core → capability governada → serviço determinístico → tenant/autorização → evidence/provenance → síntese → auditoria.

O modelo:
- não escolhe tenant;
- não escolhe permissões;
- não define evidence;
- não define factualStatus;
- não executa operação crítica;
- não calcula livremente métricas financeiras.

## Estado de integração
O endpoint canônico e o mecanismo de credencial segura agora EXISTEM no código canônico.

Ainda falta evidência runtime de Preview para promover F09 a INTEGRADA/HOMOLOGADA:
- serviço `fm-cognitive-core-preview` Live;
- secret M2M configurado somente no ambiente;
- `FM_CORE_BASE_URL` configurado no FMCC Preview;
- smoke autenticado FMCC → Core → MetricService → synthesis;
- health check real.

## Gate
**F09 — IMPLEMENTADA E TESTADA EM CÓDIGO; PREVIEW E2E AINDA PENDENTE.**

A pendência anterior de “endpoint inexistente” foi resolvida. A única pendência material restante é operacional: deployment/configuração segura e smoke real no Preview.
