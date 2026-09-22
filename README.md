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
- F11: **CONCLUÍDA COM EVIDÊNCIA**. PR #11 MERGED/CLOSED; squash merge `2a276f4c57577bf0236ae134311705f294d31b21`; Foundation Gate pós-merge #192 em `main` — SUCCESS. Product Registry, escopo por produto, Inteligência por Produto, comparação governada, UI pt-BR e Core consciente de produto integrados. Progresso acumulado: **71%**.
- F12–F15: implementação funcional e CI concluídos na PR #12 Draft. Gates F12 #205, F13 #210, F14 #211/#212 e F15 #214 em SUCCESS; candidate funcional `545114ce2379178eae05b06d3b2fb66765cf006e` com 31 arquivos de teste / 109 testes PASS / 0 FAIL. **Preview do candidate ainda não comprovado**, pois o serviço Preview vigente acompanha `main`; por isso a tranche ainda não está autorizada para merge nem declarada 88% certificada. F16 permanece fora do escopo.

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
- F11 integrada à `main`; Gate pós-merge #192 SUCCESS no commit `2a276f4c57577bf0236ae134311705f294d31b21`. O fechamento pós-merge factual também está registrado na PR #11.

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
