# FMCC — Production Source Integration Discovery v0.1

Status: CURRENT DISCOVERY — GOVERNED / NÃO HOMOLOGADO EM PRODUÇÃO

Base certificada:
`main@175f4847eba16b7361929d35a780dc22a39ff95b`

Objetivo:
mapear as fontes reais necessárias para que as métricas do FM Control Center deixem de depender de ausência de dados, sem inventar providers, semântica ou fatos.

## Regras

- SOURCE AUTHORITY → Integration Fabric → Canonical Facts → Metric Registry → Metric Engine → Intelligence → Core.
- Missing != zero.
- Coleção/sumário de provider não é automaticamente um fato canônico compatível.
- Métrica só pode ser marcada CONNECTED quando existir fonte real configurada, autenticação válida, ingestão comprovada e proveniência.
- Credencial inexistente = EXTERNAL_BLOCKER, nunca dado simulado.
- Semântica pendente não pode ser resolvida por implementação silenciosa.

## Fonte real já descoberta — Kordena Commercial Control Plane

Contrato Kordena verificado no candidate:
`faabio3131/fm-ai-platform@b35ba198ecd9a667f0473829c16562e2474a1f31`

Boundary:
`/v1/control-plane/fmcc`

Autoridade:
Kordena Commercial Platform.

Acesso:
HTTP governado; FMCC não lê/escreve banco Kordena diretamente.

Fatos publicados pelo contrato atual:
- `customer.created`
- `trial.started`
- `trial.converted`
- `trial.expired`
- `subscription.activated`
- `subscription.cancelled`
- `payment.settled`
- `payment.failed`
- `entitlement.changed`

O próprio contrato Kordena declara como pendente:
- MRR
- ARR
- churn
- inadimplência monetária
- contagem de assinatura ativa com semântica stateful/as-of
- saúde operacional (fonte dedicada)
- custos (fonte FinOps dedicada)
- suporte (fonte dedicada)

## Matriz das 24 métricas executivas

| metric_id | Estado semântico FMCC | Fato exigido | Fonte real descoberta | Status de integração | Observação |
|---|---|---|---|---|---|
| trial.starts.count | implemented | trial.started | Kordena Commercial (para Kordena) | READY_TO_CONNECT | Contrato Kordena publica fato compatível; faltam runtime config/source real/credencial e sync homologado. |
| trial.active.count | pending_semantics | — | Kordena snapshot possui active_trials | SEMANTICS_PENDING | Sumário não substitui definição canônica aprovada. |
| trial.conversion.rate | pending_semantics | — | Kordena publica trial.started + trial.converted | SEMANTICS_PENDING | Exige coorte, população e janela temporal aprovadas. |
| subscription.active.count | implemented | subscription.active | Kordena publica subscription.activated e snapshot active_subscriptions | SEMANTICS_PENDING | Evento activated não equivale a estado ativo as-of; contrato Kordena declara pendência stateful. |
| subscription.cancelled.count | implemented | subscription.cancelled | Kordena Commercial | READY_TO_CONNECT | Fato compatível disponível. |
| subscription.logo_churn.rate | pending_semantics | — | Kordena publica cancelamentos | SEMANTICS_PENDING | Denominador/coorte/janela ainda não aprovados. |
| revenue.mrr | pending_semantics | — | Kordena catalog/subscriptions | SEMANTICS_PENDING | O próprio contrato Kordena declara MRR pendente. |
| revenue.arr | pending_semantics | — | Kordena catalog/subscriptions | SEMANTICS_PENDING | O próprio contrato Kordena declara ARR pendente. |
| billing.gross_billed | implemented | billing.invoice | Nenhuma fonte real aprovada | PROVIDER_UNDECIDED | Kordena atual não publica billing.invoice. |
| revenue.cash_collected | implemented | payment.settled | Kordena Commercial | READY_TO_CONNECT | Fato compatível com amount/currency disponível. |
| receivable.delinquent_amount | implemented | receivable.delinquent | Kordena declara delinquency_amount pendente | SEMANTICS_PENDING | Não existe fato monetário compatível no contrato atual. |
| cost.infrastructure.total | implemented | cost.infrastructure | Nenhuma fonte FinOps aprovada | PROVIDER_UNDECIDED | Deve vir de autoridade faturável/custo real, não tabela estimada. |
| cost.operating.total | implemented | cost.operating | Nenhuma fonte financeira/operacional aprovada | PROVIDER_UNDECIDED | Necessita fonte contábil/operacional real. |
| finance.operating_result | pending_semantics no registry executivo | derivada | Metric/Finance layer existente | ARCHITECTURAL_RECONCILIATION | Há serviço determinístico F12; registry executivo ainda marca pendência. Não reconciliar silenciosamente. |
| finance.operating_margin.rate | pending_semantics | — | Nenhuma | SEMANTICS_PENDING | Fórmula/base ainda não aprovada. |
| lead.created.count | implemented | lead.created | Nenhum CRM/fonte comercial aprovado | PROVIDER_UNDECIDED | Não inventar CRM/attribution. |
| incident.count | implemented | incident.opened | Nenhuma fonte operacional aprovada | PROVIDER_UNDECIDED | Health pontual não é incidente. |
| job.failure.count | implemented | job.failed | Nenhuma telemetria operacional conectada | PROVIDER_UNDECIDED | Deve vir de runtime/job authority. |
| integration.failure.count | implemented | integration.failed | FMCC possui ConnectorRuntime, mas não emite esse fato canônico hoje | READY_FOR_INTERNAL_ADAPTER | Pode ser fonte interna governada, após contrato explícito e testes. |
| service.error.count | implemented | service.error | Nenhuma observabilidade aprovada | PROVIDER_UNDECIDED | Necessita telemetria real. |
| service.error.rate | pending_semantics | — | Nenhuma | SEMANTICS_PENDING | Exige população/denominador/janela. |
| usage.active_users.dau | implemented | usage.active_user.day | Nenhuma telemetria SaaS conectada | PROVIDER_UNDECIDED | Cada SaaS deve emitir fatos governados por produto. |
| usage.engagement.events | implemented | usage.engagement_event | Nenhuma telemetria SaaS conectada | PROVIDER_UNDECIDED | Não inferir de logs genéricos. |
| support.ticket.open.count | implemented | support.ticket.opened | Nenhuma fonte de suporte aprovada | PROVIDER_UNDECIDED | Kordena declara suporte como fonte dedicada. |

## Credenciais/configuração Kordena necessárias

A integração Kordena candidata exige, em runtime:

- `FMCC_KORDENA_CONTROL_TENANT_ID`
- `FMCC_KORDENA_ALLOWED_ORIGINS`
- `FMCC_KORDENA_CONTROL_PLANE_TOKEN`

A origem Kordena deve receber o mesmo segredo por configuração própria.

O segredo:
- não pertence ao repositório;
- não pertence à configuração JSON da source;
- não pode aparecer em logs/auditoria/browser.

Enquanto os valores reais não forem configurados e a source não estiver registrada:
**Kordena = READY_TO_CONNECT / EXTERNAL_BLOCKER para homologação real.**

## Decisões necessárias antes de CONNECTED

### Kordena
Já existe provider/authority aprovado tecnicamente.
Falta:
1. reconciliar a PR FMCC KCA-12 com a main atual;
2. garantir aprovação server-side para publicação de preço/plano/promoção;
3. registrar source real no tenant de controle;
4. configurar origem HTTPS allowlisted;
5. configurar segredo real fora do repo;
6. executar health + sync real;
7. provar fatos persistidos e proveniência;
8. recomputar métricas compatíveis no Metric Engine;
9. comparar Core/UI com os valores determinísticos.

### Demais domínios
Ainda exigem decisão de provider/fonte real:
- billing/invoices;
- FinOps/infra;
- custos operacionais;
- CRM/leads;
- observabilidade/incidentes;
- telemetria de uso;
- suporte.

Nenhum provider será escolhido silenciosamente por esta implementação.

## Próxima ação técnica

1. Portar a integração Kordena certificada para uma branch baseada na main atual.
2. Preservar permissões F16/F17 e adicionar permissões comerciais sem regressão.
3. Converter toda UI Kordena para pt-BR.
4. Tornar preview/aprovação de publicações de alto risco obrigatório no servidor.
5. Rodar matriz integral.
6. Homologar somente com credencial/configuração real; caso contrário manter EXTERNAL_BLOCKER explícito.
