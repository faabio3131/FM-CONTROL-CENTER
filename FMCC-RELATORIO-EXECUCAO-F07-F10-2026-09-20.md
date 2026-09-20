# FM CONTROL CENTER — RELATÓRIO DE EXECUÇÃO F07–F10

**Baseline:** `8076ad7861f43f78fa502d92dbd7eb0f0ff130d4`  
**Branch:** `feat/fmcc-f07-f10-intelligence-stack`  
**PR:** #9  
**Modo:** pipeline autônomo com reavaliação assíncrona  
**Produção:** não utilizada

## Resumo executivo
F07 e F08 atingiram gate técnico verde. A arquitetura de F09 foi posteriormente reconciliada para um **FMCC Cognitive Vertical Core próprio do produto**, removendo a dependência cognitiva operacional de outro SaaS. F10 permanece alinhada ao mesmo Core próprio. A recertificação do novo HEAD está bloqueada antes da execução dos steps do GitHub Actions por ausência de runner alocado; portanto F09/F10 não foram promovidas e F11–F15 não foram iniciadas.

## F07 — Integration Fabric
Implementado:
- Source Registry tenant-scoped;
- Connector contracts/runtime;
- pull incremental;
- timeout/retry;
- idempotência;
- cursor/checkpoint;
- sync execution;
- canonical facts/provenance;
- secret-by-reference;
- API server-side;
- PostgreSQL repositories;
- testes tenant/RBAC/idempotência.

**Status:** gate técnico aprovado.

## F08 — Data Platform + Metric Engine
Implementado:
- Metric Registry versionado;
- Metric Engine determinístico;
- MetricValue;
- query/overview service;
- provenance;
- freshness/quality explícitas;
- missing != zero;
- proteção contra valor inválido;
- proteção FX multi-moeda;
- alvos executivos sem fabricação de semântica.

**Status:** gate técnico aprovado.

## F09 — Cognitive Core
Estado arquitetural vigente:
- `FmccVerticalCognitiveCore` pertence ao próprio FM Control Center;
- Cognitive Model Port;
- adapter OpenAI-compatible;
- contexto e memória tenant/user scoped;
- Metric Engine como autoridade factual;
- grounding/provenance;
- planejamento single/multi-métrica;
- explicação, correlação, anomalia, risco e recomendação;
- fail-closed sem provider.

Removido do desenho vigente:
- `FM_CORE_BASE_URL`;
- `FM_CORE_SERVICE_TOKEN`;
- `HttpCanonicalCoreClient`;
- dependência operacional cognitiva do Kordena/`fm-ai-platform`.

**Status:** implementado/reconciliado em código; recertificação CI e Preview pendentes.

## F10 — Executive Command Center
Implementado:
- dashboard executivo;
- cards governados;
- estados indisponível/semântica pendente;
- provenance/source/freshness/quality;
- painel de consulta ao Core próprio;
- degradação segura quando provider cognitivo não está configurado;
- responsividade/acessibilidade básica;
- dados não inventados.

**Status:** implementado; certificação do HEAD corrigido e Preview E2E pendentes.

## Evidência verde histórica
Último HEAD funcional consolidado anterior à reconciliação do Core próprio:
`8d2fee2d4db989cabcc19e485dcf0eb6d0ad48f7`.

FMCC Foundation Gate #82:
- Install — SUCCESS
- Lint — SUCCESS
- Typecheck — SUCCESS
- Verify migration matches schema — SUCCESS
- Apply versioned migration — SUCCESS
- Tests — SUCCESS
- Build — SUCCESS
- Build Docker image without runtime secrets — SUCCESS
- Runtime dependency audit — SUCCESS

Essa evidência não certifica automaticamente os commits posteriores.

## STOP operacional de CI — evidência atual

HEAD investigado:
`62405d16c262a880971d1287f979317d906c6b73`

FMCC Foundation Gate #119:
- run id: `35510973426`;
- attempt 1: FAILURE antes de qualquer step;
- reexecução explícita autorizada executada;
- attempt 2: job `106087696116`;
- resultado novamente FAILURE;
- `steps=[]`;
- `runner_id=0`;
- nenhum runner alocado;
- nenhum log de execução disponível.

Comparação de workflow:
- run #86 SUCCESS no HEAD `ec3bf035fc557890577d3ce0a86309c97b6057de`, com 17 steps;
- run #89 já falhava sem execução normal;
- o workflow usado nos dois pontos possui o mesmo blob SHA: `85bfd11d004bf47daaa2911840f7f08f6fe1b51b`.

Conclusão suportada pela evidência:
- a transição de execução normal para falha pré-runner não foi causada por alteração do arquivo de workflow;
- não é possível afirmar a causa administrativa específica apenas pela API disponível;
- não existe evidência para atribuir a falha atual ao código de F09/F10, pois lint/test/build/migrations não chegaram a rodar;
- também não é permitido chamar o HEAD corrigido de certificado.

## Governança atual
- PR #9 permanece OPEN/DRAFT;
- nenhum merge realizado;
- nenhum deploy de produção realizado;
- arquitetura do Core próprio preservada;
- F11–F15 não iniciadas;
- merge e progressão permanecem bloqueados até execução real do CI obrigatório;
- após restaurar runner/Actions: recertificar HEAD → configurar provider cognitivo no Preview → smoke E2E → regressão F06–F10 → revisão final → merge condicionado → smoke pós-merge.

## Pendência externa
É necessário restaurar a capacidade de alocação de GitHub-hosted runner para este repositório/conta. Possíveis causas administrativas como quota, billing/spending limit, políticas de Actions ou disponibilidade específica da conta devem ser verificadas no GitHub; nenhuma delas é declarada como causa raiz sem evidência administrativa.
