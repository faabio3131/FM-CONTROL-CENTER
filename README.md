# FM Control Center

SaaS comercial independente da Nova FM Tecnologia. A Nova FM é o Tenant Zero.

## Estado
- F00–F04: discovery/System Design concluídos; arquitetura do Core reconciliada em v0.2.
- F05: ADRs e governança aprovados; ADR-001 SUPERSEDED por ADR-013.
- F06: Fundação Técnica Web/Cloud concluída e certificada em Preview em 19/09/2026.
- F07: Integration Fabric concluída com evidência na PR #9.
- F08: Metric Registry + Metric Engine determinísticos concluídos com evidência na PR #9.
- F09: FMCC Cognitive Vertical Core **próprio do produto** concluído com evidência em Preview na PR #9.
- F10: Executive Command Center concluído com evidência em Preview na PR #9.
- F11: implementação funcional concluída na PR #11 Draft; Product Registry, product scope, Product Intelligence, comparação governada, UI e Core product-aware certificados no Gate #162. Preview/smoke final ainda pendente; F11 **não está encerrada nem mergeada**.

## Arquitetura cognitiva vigente

O FM Control Center possui seu próprio **FM Cognitive Vertical Core**.

Ele não depende operacionalmente do Core do Kordena, IRON ou de qualquer outro SaaS.

O Core do FMCC é composto por:
- policies verticais de gestão empresarial;
- contexto/memória operacional tenant + user scoped;
- capability planning;
- grounding pelo Metric Engine;
- provenance/evidence;
- análise single/multi-métrica;
- explicação, correlação, anomalias, risco e recomendações;
- model provider atrás de boundary de infraestrutura;
- auditoria e fail-closed.

O modelo externo não é o Core. Ele é apenas provider de capacidade cognitiva.

## Autoridades

- Auth/Tenant: identidade, sessão, membership e escopo.
- Integration Fabric: fontes/connectors.
- Metric Registry + Metric Engine: semântica e cálculo factual.
- FMCC Cognitive Vertical Core: interpretação, contexto, coordenação e recomendação.
- Governed Action Services: execução crítica autorizada.
- Audit Ledger: trilha de evidência.

## Runtime cognitivo

Variáveis de Preview/runtime:

```text
FMCC_COGNITIVE_MODEL_BASE_URL
FMCC_COGNITIVE_MODEL_API_KEY
FMCC_COGNITIVE_MODEL_ID
```

Nunca versione secrets.

## Evidência de Preview
- Render Preview real com Web Service + PostgreSQL;
- migrations aplicadas;
- `/api/health` e `/api/ready` verdes;
- auth, logout/re-login e tenancy validados;
- isolamento multi-tenant automatizado;
- provider cognitivo real validado;
- consulta executiva governada validada;
- ausência de valor governado apresentada como indisponível, nunca como zero;
- provenance preservada;
- Audit Ledger e memória cognitiva tenant/user scoped testados em PostgreSQL;
- PR #9 e PR #10 integradas à `main`; CI pós-merge automático em `push: main`;
- Render Preview reconciliado para `main` e smoke pós-merge F07–F10 concluído;
- F11 permanece em branch/PR próprias até Preview/smoke e gate final.

## Stack
Node.js 24 LTS · Next.js 16.3.x · TypeScript · PostgreSQL 18 · Drizzle · Better Auth Organizations · GitHub Actions · Render Preview.

## Desenvolvimento
```bash
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

Produção permanece fora do escopo enquanto os gates obrigatórios não estiverem satisfeitos.
