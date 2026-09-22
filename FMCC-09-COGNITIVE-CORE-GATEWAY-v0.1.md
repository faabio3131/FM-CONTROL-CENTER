# FM CONTROL CENTER — F09 FM COGNITIVE VERTICAL CORE

**Status:** CONCLUÍDA COM EVIDÊNCIA EM PREVIEW / NÃO É PRODUÇÃO  
**Data de reconciliação arquitetural:** 20/09/2026  
**Data de certificação F09:** 22/09/2026  
**Decisão vigente:** ADR-013 — Product-Owned FM Cognitive Vertical Core

## 1. Arquitetura vigente

O FM Control Center possui seu próprio cérebro vertical, contexto, memória, policies e ciclo de evolução.

O ADR-001 está SUPERSEDED.

O FMCC contém no próprio produto:
- `FmccVerticalCognitiveCore`;
- Cognitive Model Port;
- adapter OpenAI-compatible;
- Core Gateway;
- memória operacional tenant/user scoped a partir do Audit Ledger;
- Metric Engine como autoridade factual;
- provenance/evidence;
- análise single e multi-métrica;
- degradação segura quando o provider falha;
- observabilidade segura de falhas externas.

Não existe dependência operacional cognitiva obrigatória de outro SaaS.

## 2. Autoridade

Core → interpretação/análise/recomendação → capability → serviço determinístico → tenant/autorização → evidence/provenance → resposta → auditoria.

O Core não pode:
- inventar número;
- tratar missing como zero;
- substituir Metric Engine;
- escolher tenant;
- elevar privilégio;
- somar moedas sem política;
- executar ação crítica diretamente;
- tratar memória conversacional como fonte factual.

## 3. Multi-tenancy e memória

Contexto cognitivo é filtrado por tenant + usuário. Toda consulta de métrica recebe `TenantContext` server-side.

A certificação adicionou teste PostgreSQL real para provar:
- memória do usuário A do tenant A não retorna contexto do usuário A2;
- memória do tenant A não retorna contexto do tenant B;
- eventos de falha não entram como continuidade cognitiva;
- cross-tenant permanece STOP condition.

## 4. Provider cognitivo em Preview

Foi validado um provider real compatível com o boundary OpenAI-compatible do produto.

Durante a configuração inicial, o provider rejeitou a autenticação. O valor de configuração foi corrigido no secret store do ambiente e o smoke subsequente passou.

Nenhum secret foi registrado em código, logs ou documentação.

## 5. Smoke real de Preview

Com aplicação autenticada no Preview:
- `/api/health` respondeu `{"service":"fm-control-center","status":"ok"}`;
- `/api/ready` respondeu `{"status":"ready"}`;
- dashboard autenticado carregou;
- pergunta executiva: **“Quanto faturamos esse mês?”**;
- resposta: métricas indisponíveis por ausência de valores governados;
- provenance exibida: `billing.gross_billed`;
- nenhum valor foi inventado;
- o comportamento confirmou missing != zero e grounding no Metric Engine.

## 6. Audit Ledger

A rota `/api/core/query` grava `core.query` antes de devolver resposta de sucesso.

A certificação PostgreSQL prova persistência de:
- tenant;
- ator;
- correlação;
- resultado;
- resource type;
- `factualStatus`;
- `evidenceRefs`.

O runtime também registra evento operacional somente depois da persistência, sem incluir pergunta, resposta ou credencial.

## 7. Evidência de CI

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

Resultado:
- 15 test files PASS;
- 62 tests PASS;
- teste de auditoria/isolamento cognitivo PostgreSQL: 3/3 PASS.

## Gate

**F09 — CONCLUÍDA COM EVIDÊNCIA EM PREVIEW.**

Esta certificação não declara produção, release comercial nem merge. PR #9 permanece sob governança até decisão explícita de integração.
