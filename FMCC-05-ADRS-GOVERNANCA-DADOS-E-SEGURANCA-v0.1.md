# FM CONTROL CENTER
# FASE 05 — ADRs + GOVERNANÇA DE DADOS E SEGURANÇA

**Status:** CONCLUÍDA COM EVIDÊNCIA  
**Versão:** 0.1  
**Data:** 18/09/2026  
**Gate:** F05 — APROVADO PARA IMPLEMENTAÇÃO

## 1. Preflight live

- Repositório: `faabio3131/FM-CONTROL-CENTER`
- Visibilidade: private
- Default branch: `main`
- Base SHA: `f68cef6bb527631b2d0e440e3af715ee42e0cec7`
- CURRENT na base: somente `README.md`
- PRs existentes: nenhuma
- Branch desta missão: `feat/fmcc-f05-f08-platform-foundation`

Não foi encontrada implementação estrutural posterior à F04.

## 2. Decisões de stack e arquitetura

- Runtime: Node.js 24 LTS.
- Aplicação: Next.js 16.3.x + TypeScript, modular monolith.
- Persistence: PostgreSQL 18.
- ORM/migrations: Drizzle.
- Auth: Better Auth + Organization plugin.
- CI: GitHub Actions.
- Cloud target inicial: Render.
- Core: serviço interno versionado, integração somente na F09.
- Queue: deferred.
- FX: deferred.
- Observability vendor: deferred; logs/health/correlation desde F06.

## 3. RBAC / ABAC

RBAC inicial:
- `owner`: governança total do tenant;
- `admin`: gestão operacional/usuários/configuração, sem transferência/deleção de ownership;
- `analyst`: leitura de métricas/proveniência e operação analítica;
- `viewer`: leitura autorizada.

Recursos FMCC previstos:
- `tenant`;
- `member`;
- `source`;
- `metric`;
- `audit`;
- `integration`.

ABAC fica DEFERRED até existir regra contextual que RBAC não represente adequadamente.

## 4. Tenancy

- Organization ID autenticada = tenant authority.
- `tenant_id` obrigatório em dado FMCC pertencente a cliente.
- Contexto derivado server-side.
- Header/query/body nunca amplia tenant.
- Queries/repositories devem exigir TenantContext.
- Constraints/índices tenant-first.
- RLS será defesa adicional onde a estratégia de conexão permitir uso seguro, não substituto de autorização.

## 5. Data governance

Classificação mínima:
- PUBLIC;
- INTERNAL;
- CONFIDENTIAL;
- RESTRICTED.

PII, credenciais, dados financeiros sensíveis e material de autenticação são CONFIDENTIAL/RESTRICTED conforme natureza.

Princípios:
- minimização;
- ownership explícito;
- provenance;
- integridade;
- migrations;
- exportabilidade;
- backup/restore antes de produção;
- deleção governada;
- nenhuma limpeza destrutiva automática em F06–F08.

A política comercial/legal final de retenção permanece pendente para validação antes de produção. Até lá, o sistema não deve apagar automaticamente fatos/auditoria por conveniência.

## 6. Secrets

Secret-by-reference. Valores somente em runtime secret/environment store autorizado. Nunca em código, Git, frontend, prompt, log ou documentação.

## 7. Audit

Ledger lógico append-only, tenant-scoped, metadata sanitizada, correlation id e actor/service identity.

## 8. Limites do Core

Core/IA → intenção/recomendação → política → serviço determinístico → validação → execução → auditoria.

Nenhuma integração operacional do Core é permitida nesta fase.

## 9. Autoridades determinísticas

- Identity/Tenant boundary: identidade/sessão/membership.
- Source Registry: configuração e authority metadata das fontes.
- Metric Registry/Engine: definição e cálculo derivado.
- Connector adapters: execução contra providers.
- Audit ledger: trilha FMCC.
- Core: interpretação/orquestração cognitiva, não autoridade transacional.

## 10. Rollback/reversibilidade

- stack container-compatible;
- migrations versionadas;
- providers atrás de boundaries;
- Core atrás de API;
- queue/FX não antecipados;
- alterações estruturais via ADR.

## 11. Pendências não bloqueantes

- conta/credencial Render para deploy não produtivo;
- fonte real de billing/trial/financeiro/CRM/support;
- política legal/comercial final de retenção;
- SLO comercial;
- ICP/pricing;
- provider futuro de observability.

Essas pendências não bloqueiam F06 code foundation, mas credencial de cloud é requisito para concluir o deploy não produtivo da F06.

## 12. Gate F05

[x] stack justificada  
[x] runtime/cloud target decidido  
[x] auth boundary decidido  
[x] tenant isolation decidido  
[x] persistence decidida  
[x] secrets decididos  
[x] observability mínima decidida  
[x] CI target definido  
[x] Core ADR definido sem integração antecipada  
[x] data governance mínima definida  
[x] rollback/reversibilidade considerada  
[x] nenhum conflito de autoridade aberto  
[x] nenhuma STOP condition crítica aberta

# GATE F05 — APROVADO PARA IMPLEMENTAÇÃO
