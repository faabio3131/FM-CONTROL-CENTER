# FM CONTROL CENTER
# FASE 06 — FUNDAÇÃO TÉCNICA WEB/CLOUD

**Status:** IMPLEMENTADA E TESTADA; DEPLOY NÃO PRODUTIVO PENDENTE  
**Versão:** 0.1  
**Data:** 18/09/2026  
**Gate:** F06 — BLOQUEADO EXCLUSIVAMENTE NO CRITÉRIO DE DEPLOY NÃO PRODUTIVO

---

## 1. IDENTIFICAÇÃO

- Repositório: `faabio3131/FM-CONTROL-CENTER`
- Branch: `feat/fmcc-f05-f08-platform-foundation`
- Pull Request: #1
- Base da missão: `f68cef6bb527631b2d0e440e3af715ee42e0cec7`
- Candidate técnico inicial: `bfa84346237164fbd084c92da7c98eae73819fa4`
- Candidate com migration versionada: `bc0753c179eb65a87332cd2aafde9d740adba944`

## 2. STACK REAL IMPLEMENTADA

- Node.js 24 LTS
- Next.js 16.3.x
- React 19.2.x
- TypeScript
- PostgreSQL 18
- Drizzle ORM / Drizzle Kit
- Better Auth + Organization
- GitHub Actions
- Docker/container-compatible
- Render definido em ADR como target inicial de runtime

## 3. ESTRUTURA FUNDACIONAL

Implementado:
- application shell Web;
- fronteira de autenticação;
- organizações/tenants;
- memberships;
- RBAC fundacional;
- TenantContext server-side;
- PostgreSQL/Drizzle;
- migration versionada;
- audit foundation;
- configuração externa;
- health/readiness;
- structured logging;
- correlation id;
- CI;
- Dockerfile;
- login;
- onboarding de organização;
- dashboard shell;
- fundação visual responsiva.

Não implementado nesta fase:
- dashboard executivo completo;
- Core funcional;
- connectors reais;
- Metric Engine completo;
- automações de negócio.

## 4. AUTH E TENANCY

A autoridade de tenant é a organização ativa da sessão autenticada e sua membership válida.

O sistema:
- não aceita `X-Tenant-ID` como autoridade;
- valida sessão no servidor;
- valida membership no servidor;
- falha fechado quando tenant/sessão não estão resolvidos;
- possui teste adversarial de cross-tenant;
- possui RBAC server-side.

## 5. PERSISTÊNCIA E MIGRATIONS

A migration fundacional foi gerada a partir do schema Drizzle, versionada no repositório e validada em PostgreSQL 18 no CI.

O workflow verifica que:
- o schema e a migration versionada não divergiram;
- a migration aplica corretamente em banco limpo.

## 6. CONFIGURAÇÃO E SECRETS

Secrets não são versionados.

Variáveis esperadas:
- `DATABASE_URL`;
- `BETTER_AUTH_URL`;
- `BETTER_AUTH_SECRET`.

O código valida ausência/secret insuficiente e falha fechado.

## 7. OBSERVABILIDADE

Implementado:
- structured JSON logging;
- sanitização de campos sensíveis;
- correlation id;
- `/api/health`;
- `/api/ready`;
- audit foundation.

Vendor dedicado de observabilidade permanece deferred conforme ADR-009.

## 8. CI / TESTES

Workflow: `FMCC Foundation Gate`.

Candidate `bc0753c179eb65a87332cd2aafde9d740adba944`:

- Install — SUCCESS
- Lint — SUCCESS
- Typecheck — SUCCESS
- Verify migration matches schema — SUCCESS
- Apply versioned migration — SUCCESS
- Tests — SUCCESS
- Build — SUCCESS
- Runtime dependency audit — SUCCESS

Run: `35400377673`.

## 9. DEPLOY NÃO PRODUTIVO

**NÃO EXECUTADO.**

Motivo:
- Render foi escolhido como target inicial pelo ADR-005;
- não existe conexão/credencial Render disponível nesta execução;
- não foi criado ambiente fictício;
- não foi usado mock como prova de deploy;
- produção não foi alterada.

Para fechamento do Gate F06 ainda é necessário:
1. disponibilizar acesso autorizado ao provider;
2. criar development/preview/staging conforme ADR;
3. configurar secrets por referência;
4. executar migrations;
5. validar health/readiness;
6. validar login;
7. validar tenant scope;
8. executar smoke tests;
9. registrar evidência.

## 10. SEGURANÇA

Confirmado no escopo atual:
- autorização server-side;
- tenant context confiável;
- header arbitrário não amplia escopo;
- secrets fora do código;
- configuração fail-closed;
- logs com sanitização;
- dependency audit verde.

## 11. DIFF REVIEW

A PR contém somente:
- ADRs F05;
- fundação F06;
- migration;
- testes;
- CI;
- documentação e configuração necessárias.

F07, F08 e F09 não foram iniciadas.

## 12. CLASSIFICAÇÃO DO GATE

[x] projeto compila/builda  
[x] lint verde  
[x] typecheck verde  
[x] testes fundacionais verdes  
[x] auth funciona no CI representativo  
[x] autorização server-side  
[x] tenant isolation com teste adversarial  
[x] migration baseline funciona  
[x] secrets fora do código  
[x] CI verde  
[x] observabilidade básica  
[ ] deploy não produtivo + smoke real — BLOQUEADO POR ACESSO EXTERNO  
[x] nenhum deploy de produção  
[x] diff revisado  
[x] documentação atualizada

# GATE F06 — BLOQUEADO EXCLUSIVAMENTE NO DEPLOY NÃO PRODUTIVO

O merge desta base técnica, se autorizado pelo humano responsável, **não altera esta classificação**.

F07 não poderá ser iniciada até o fechamento comprovado deste critério.
