# FM CONTROL CENTER — F07–F10 MISSION LEDGER

**Mission:** F07 Integration Fabric → F08 Data Platform + Metric Engine → F09 Cognitive Core → F10 Executive Command Center  
**Baseline main:** `8076ad7861f43f78fa502d92dbd7eb0f0ff130d4`  
**PR:** #9 — Draft  
**Branch:** `feat/fmcc-f07-f10-intelligence-stack`  
**Produção:** não utilizada

## Status consolidado

| Block | Status | Evidência principal | Gate |
|---|---|---|---|
| F07 | CONCLUÍDA COM EVIDÊNCIA | Integration Fabric + PostgreSQL + tenant/idempotência | APPROVED |
| F08 | CONCLUÍDA COM EVIDÊNCIA | Metric Engine determinístico + provenance + missing != zero | APPROVED |
| F09 | CONCLUÍDA COM EVIDÊNCIA EM PREVIEW | provider real + Core próprio + grounding + tenant/user isolation + Audit Ledger | APPROVED FOR PREVIEW |
| F10 | CONCLUÍDA COM EVIDÊNCIA EM PREVIEW | dashboard real + Core query + provenance + estados indisponíveis | APPROVED FOR PREVIEW |

Esta tabela não declara produção, merge ou disponibilidade comercial.

## Arquitetura cognitiva vigente

- ADR-001: SUPERSEDED;
- ADR-013: ACCEPTED;
- FMCC possui seu próprio FM Cognitive Vertical Core;
- provider de modelo é infraestrutura, não autoridade cognitiva;
- contexto/memória são tenant + user scoped;
- Metric Engine permanece autoridade factual;
- operações críticas continuam sob serviços determinísticos;
- não existe dependência cognitiva operacional obrigatória de outro SaaS.

## Evidências F09

Implementação:
- `FmccVerticalCognitiveCore`;
- Cognitive Model Port;
- adapter OpenAI-compatible;
- planejamento single/multi-métrica;
- grounding por facts/evidence;
- contexto operacional via Audit Ledger;
- fail-closed;
- observabilidade segura do provider.

Preview real:
- health: OK;
- readiness: READY;
- autenticação e dashboard: OK;
- pergunta executiva executada;
- resposta governada de indisponibilidade para dado ausente;
- provenance `billing.gross_billed`;
- nenhum número inventado.

Tenant/auditoria:
- teste PostgreSQL prova isolamento tenant + user da memória cognitiva;
- teste prova persistência de `core.query` com tenant, ator, correlação, resultado e evidence refs;
- evento de falha não é reutilizado como memória de continuidade.

## Evidências F10

- dashboard executivo server-side;
- MetricService compartilhado entre dashboard e Core;
- cards governados;
- source/freshness/quality/provenance;
- gaps explícitos;
- missing nunca apresentado como zero;
- painel cognitivo operacional;
- degradação segura de provider;
- Preview E2E observado com sessão autenticada.

## Certificação de CI

Candidate funcional de certificação:
`cb632f9c1bab9957094274092fd60161c5e546f3`

FMCC Foundation Gate #133:
- Install — SUCCESS
- Lint — SUCCESS
- Typecheck — SUCCESS
- Verify migration matches schema — SUCCESS
- Apply versioned migration — SUCCESS
- Tests — SUCCESS
- Build — SUCCESS
- Docker build — SUCCESS
- Runtime dependency audit — SUCCESS

Testes:
- 15 test files PASS;
- 62 tests PASS;
- `core-audit.integration.test.ts`: 3/3 PASS.

## Histórico de bloqueio resolvido

Em 20/09/2026 houve STOP operacional por GitHub Actions sem runner alocado. O bloqueio não executava steps e não constituía evidência de regressão do código.

Esse STOP foi posteriormente resolvido operacionalmente. Gates reais voltaram a executar e os HEADs posteriores foram certificados normalmente.

Durante o primeiro smoke do provider em Preview houve resposta externa 401. A configuração do ambiente foi corrigida e o smoke subsequente passou.

## CI/CD de Preview

O serviço Preview está configurado para acompanhar a branch da PR #9 e utilizar deploy após checks de CI aprovados.

Deploy manual por SHA não é mais o fluxo operacional pretendido.

## Governança

- PR #9 permanece OPEN/DRAFT;
- nenhum merge realizado;
- nenhuma produção utilizada;
- secrets não são registrados em código/documentação;
- F11 ainda não foi iniciada;
- próxima ação de governança: revisão final da PR #9 e decisão explícita de integração antes de abrir F11.

## Próxima fase funcional

Plano Mestre:
**F11 — Inteligência por Produto**

Escopo previsto:
- visão individual de cada SaaS;
- aquisição;
- ativação;
- engajamento;
- receita;
- churn;
- saúde;
- crescimento;
- comparação entre produtos.
