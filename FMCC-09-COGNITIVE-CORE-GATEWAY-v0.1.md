# FM CONTROL CENTER — F09 FM COGNITIVE VERTICAL CORE

**Status:** ARQUITETURA RECONCILIADA / IMPLEMENTAÇÃO EM PR #9  
**Data de reconciliação:** 20/09/2026  
**Decisão vigente:** ADR-013 — Product-Owned FM Cognitive Vertical Core

## 1. Correção arquitetural

A interpretação anterior tratava o FM Control Center como consumidor obrigatório de um runtime cognitivo hospedado no `fm-ai-platform`.

Essa decisão foi revista porque o FMCC é SaaS comercial independente e precisa possuir seu próprio cérebro vertical, contexto, memória, policies e ciclo de evolução.

O ADR-001 está SUPERSEDED.

## 2. Current da implementação

O FMCC agora contém no próprio produto:
- `FmccVerticalCognitiveCore`;
- Cognitive Model Port;
- adapter HTTP OpenAI-compatible para capacidade de modelo;
- Core Gateway;
- memória operacional tenant/user scoped a partir do audit ledger;
- Metric Engine como autoridade factual;
- provenance/evidence;
- análise single e multi-métrica;
- degradação segura quando modelo não está configurado.

Foi removida a dependência obrigatória:
- `FM_CORE_BASE_URL`;
- `FM_CORE_SERVICE_TOKEN`;
- `HttpCanonicalCoreClient`;
- runtime cognitivo de outro produto.

## 3. Natureza vertical e cognitiva

O Core do FMCC é vertical para gestão empresarial consolidada.

Capacidades previstas/implementadas no boundary:
- interpretação de intenção;
- seleção planejada de métricas governadas;
- contexto operacional;
- consulta single/multi-métrica;
- explicação de indicadores;
- correlação;
- padrões;
- anomalias;
- análise de risco;
- recomendação;
- interação executiva em linguagem natural.

O modelo externo é apenas provider de cognição. O Core é a combinação de:
- policies verticais;
- contexto;
- capabilities;
- grounding;
- Metric Engine;
- provenance;
- guardrails;
- auditoria;
- model adapter.

## 4. Autoridade

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

## 5. Multi-tenancy

Contexto cognitivo é filtrado por tenant + usuário. Toda consulta de métrica recebe TenantContext server-side.

Cross-tenant é STOP condition.

## 6. Model provider runtime

Variáveis do produto:
- `FMCC_COGNITIVE_MODEL_BASE_URL`;
- `FMCC_COGNITIVE_MODEL_API_KEY`;
- `FMCC_COGNITIVE_MODEL_ID`.

Secrets ficam somente no runtime secret store.

A V1 usa um adapter OpenAI-compatible como boundary concreto. Multi-provider adicional só será introduzido se houver benefício comprovado.

## 7. Estado de prontidão

IMPLEMENTADO EM CÓDIGO:
- ownership do Core no FMCC;
- vertical policies;
- model boundary;
- context memory;
- Metric grounding;
- multi-metric reasoning path;
- fail-closed.

AINDA EXIGE EVIDÊNCIA:
- CI do novo HEAD;
- model provider configurado no Preview;
- smoke real de pergunta executiva;
- verificação de ausência de cross-tenant;
- logs/auditoria/provenance;
- regressão F06–F10.

## Gate

**F09 NÃO está homologada ainda.**

O bloqueio atual deixou de ser “Core externo inexistente”. O gate agora depende de testar e validar o Core vertical próprio no Preview do FM Control Center.
