# CME-08 â€” Registro de governanÃ§a das 8 semÃ¢nticas executivas pendentes

**Data da reconciliaÃ§Ã£o:** 04/10/2026
**Baseline FM Command:** `main@e18378a38ab712851b4446544860243884a5a2ce`
**Cronograma:** CME-08 â€” ResoluÃ§Ã£o das 8 SemÃ¢nticas Executivas Pendentes
**Veredito do bloco:** `EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED`

## 1. Regra de autoridade

Este registro NÃƒO promove nenhuma mÃ©trica para `implemented`.

A ordem de autoridade aplicada foi:

1. CURRENT real do FM Command;
2. ADRs vigentes do FM Command;
3. documentaÃ§Ã£o funcional vigente;
4. CURRENT real do Kordena onde existe fonte candidata;
5. decisÃµes humanas/corporativas ainda necessÃ¡rias.

O `Metric Registry` e o `Metric Engine` continuam como autoridades factuais do FM Command.
Uma fÃ³rmula vÃ¡lida para o produto Kordena nÃ£o se torna automaticamente a semÃ¢ntica corporativa universal da Nova FM.

Regras preservadas:

- `missing != zero`;
- nenhuma fÃ³rmula sem decisÃ£o canÃ´nica;
- nenhuma soma/conversÃ£o multi-moeda sem polÃ­tica FX;
- nenhum denominador implÃ­cito;
- nenhum provider vira autoridade apenas por existir;
- nenhuma mÃ©trica muda de `pending_semantics` para `implemented` sem aprovaÃ§Ã£o explÃ­cita, teste determinÃ­stico e provenance.

## 2. EvidÃªncias CURRENT

### FM Command

- `src/domain/metrics/registry.ts` mantÃ©m exatamente as oito mÃ©tricas deste registro em `pending_semantics`.
- ADR-007 exige Metric Registry versionado + Metric Engine determinÃ­stico e proÃ­be materializar definiÃ§Ã£o pendente.
- ADR-012 mantÃ©m FX como `DEFERRED`; valores financeiros permanecem separados por moeda.

### Kordena â€” evidÃªncia candidata, nÃ£o aprovaÃ§Ã£o corporativa

CURRENT consultado: `faabio3131/fm-ai-platform`, branch `staging/kordena-premium`.

Arquivos de evidÃªncia:

- `application/fmcc_commercial_projection.py`
- `application/commercial_observability.py`

O Kordena exclui contas `internal_test` das projeÃ§Ãµes comerciais governadas e publica provenance/source authority para as mÃ©tricas que calcula.

## 3. Resumo executivo

| MÃ©trica | CURRENT | EvidÃªncia candidata | PendÃªncia para promoÃ§Ã£o |
|---|---|---|---|
| `trial.active.count` | `pending_semantics` | Kordena possui critÃ©rio determinÃ­stico de trial ativo | AprovaÃ§Ã£o corporativa da definiÃ§Ã£o |
| `trial.conversion.rate` | `pending_semantics` | Kordena possui coorte rolling 30d + denominador explÃ­cito | AprovaÃ§Ã£o corporativa de coorte/janela |
| `subscription.logo_churn.rate` | `pending_semantics` | Kordena possui gross logo churn 30d reconstruÃ­do por eventos | AprovaÃ§Ã£o corporativa de churn |
| `revenue.mrr` | `pending_semantics` | Kordena possui MRR contratual por moeda | AprovaÃ§Ã£o corporativa de elegibilidade e autoridade financeira |
| `revenue.arr` | `pending_semantics` | Kordena possui ARR contratual por moeda | AprovaÃ§Ã£o corporativa de derivaÃ§Ã£o/elegibilidade |
| `finance.operating_result` | `pending_semantics` | Nenhuma definiÃ§Ã£o corporativa suficiente localizada | Autoridade contÃ¡bil + fÃ³rmula |
| `finance.operating_margin.rate` | `pending_semantics` | Nenhuma definiÃ§Ã£o corporativa suficiente localizada | Autoridade contÃ¡bil + denominador |
| `service.error.rate` | `pending_semantics` | Existe `service.error.count`, mas nÃ£o taxa canÃ´nica | Autoridade de observabilidade + denominador/janela |

---

## 4. `trial.active.count`

**ID:** `trial.active.count`
**VersÃ£o canÃ´nica:** nÃ£o atribuÃ­da; decisÃ£o pendente
**Status:** `EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED`

- **Pergunta empresarial:** ainda nÃ£o aprovada formalmente como contrato corporativo.
- **FÃ³rmula candidata Kordena:** contar trials nÃ£o-`internal_test` com `status == active`, `ends_at` presente e `ends_at > as_of`.
- **Unidade candidata:** count.
- **Moeda:** nÃ£o aplicÃ¡vel.
- **PerÃ­odo/grain candidato:** estado atual em `as_of`.
- **Timezone candidato:** UTC no boundary Kordena.
- **DimensÃµes corporativas:** pendentes de aprovaÃ§Ã£o.
- **InclusÃµes candidatas:** trials comerciais externos ativos.
- **ExclusÃµes candidatas:** `internal_test`; trials expirados/revogados/inativos.
- **Coorte/denominador:** nÃ£o aplicÃ¡vel Ã  contagem; populaÃ§Ã£o corporativa ainda precisa ser aprovada.
- **Cancelamentos/refunds:** nÃ£o aplicÃ¡vel.
- **Fonte candidata:** Kordena `fm_commercial_platform` para o produto Kordena; autoridade corporativa multi-produto ainda nÃ£o definida.
- **Freshness/quality:** source-governed; contrato corporativo pendente.
- **ProveniÃªncia candidata:** `fm_commercial_trials_v1` + `fm_customers_v1`.
- **FX:** nÃ£o aplicÃ¡vel.
- **Ausente:** nunca converter ausÃªncia em zero.
- **Autoridade de aprovaÃ§Ã£o:** decisÃ£o humana de negÃ³cio da Nova FM ainda requerida.

## 5. `trial.conversion.rate`

**ID:** `trial.conversion.rate`
**VersÃ£o canÃ´nica:** nÃ£o atribuÃ­da; decisÃ£o pendente
**Status:** `EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED`

- **Pergunta empresarial:** ainda nÃ£o aprovada formalmente como contrato corporativo.
- **FÃ³rmula candidata Kordena:** trials iniciados na coorte rolling de 30 dias que possuem `converted_at <= as_of` / total de trials iniciados na mesma coorte Ã— 100.
- **Unidade candidata:** percent.
- **Moeda:** nÃ£o aplicÃ¡vel.
- **PerÃ­odo candidato:** rolling 30 dias.
- **Timezone candidato:** UTC.
- **DimensÃµes corporativas:** pendentes.
- **InclusÃµes candidatas:** trials nÃ£o-`internal_test` iniciados dentro da janela.
- **ExclusÃµes candidatas:** `internal_test`.
- **Coorte/denominador candidato:** trials cujo `started_at` pertence Ã  janela rolling de 30 dias.
- **Cancelamentos/refunds:** nÃ£o aplicÃ¡vel.
- **Fonte candidata:** Kordena `fm_commercial_platform` apenas para Kordena.
- **Freshness/quality:** source-governed; Kordena marca valor calculÃ¡vel como verified.
- **ProveniÃªncia candidata:** `fm_commercial_trials_v1` + `fm_customers_v1`.
- **FX:** nÃ£o aplicÃ¡vel.
- **Ausente:** coorte vazia => `unavailable`, nunca 0%.
- **Autoridade de aprovaÃ§Ã£o:** decisÃ£o humana corporativa sobre coorte/janela ainda requerida.

## 6. `subscription.logo_churn.rate`

**ID:** `subscription.logo_churn.rate`
**VersÃ£o canÃ´nica:** nÃ£o atribuÃ­da; decisÃ£o pendente
**Status:** `EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED`

- **Pergunta empresarial:** ainda nÃ£o aprovada formalmente.
- **FÃ³rmula candidata Kordena:** gross logo churn de 30 dias = assinaturas que estavam ativas imediatamente antes da janela e emitiram `subscription.canceled` durante a janela / base ativa inicial Ã— 100.
- **Unidade candidata:** percent.
- **Moeda:** nÃ£o aplicÃ¡vel.
- **PerÃ­odo candidato:** rolling 30 dias.
- **Timezone candidato:** UTC.
- **DimensÃµes corporativas:** pendentes.
- **InclusÃµes candidatas:** base ativa reconstruÃ­da por eventos canÃ´nicos.
- **ExclusÃµes candidatas:** clientes `internal_test`.
- **Coorte/denominador candidato:** base de subscriptions ativas imediatamente antes do inÃ­cio da janela.
- **Cancelamentos:** evento `subscription.canceled` dentro da janela.
- **Refunds:** nÃ£o fazem parte da fÃ³rmula candidata de logo churn.
- **Fonte candidata:** Kordena `fm_commercial_platform` / commercial outbox para Kordena.
- **Freshness/quality:** reconciled quando calculÃ¡vel.
- **ProveniÃªncia candidata:** `fm_commercial_outbox_v1` + `fm_customers_v1`.
- **FX:** nÃ£o aplicÃ¡vel.
- **Ausente:** base inicial vazia => `unavailable`, nunca 0%.
- **Autoridade de aprovaÃ§Ã£o:** decisÃ£o humana corporativa de churn ainda requerida.

## 7. `revenue.mrr`

**ID:** `revenue.mrr`
**VersÃ£o canÃ´nica:** nÃ£o atribuÃ­da; decisÃ£o pendente
**Status:** `EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED`

- **Pergunta empresarial:** deve representar receita recorrente contratada mensal, sem confundir com faturamento, caixa ou reconhecimento contÃ¡bil; contrato corporativo ainda pendente.
- **FÃ³rmula candidata Kordena:** subscriptions atuais em `active`; perÃ­odo mensal => `contracted_amount` integral; perÃ­odo anual => `contracted_amount / 12`.
- **Unidade candidata:** currency_per_month.
- **Moeda:** valores separados por moeda.
- **PerÃ­odo/grain candidato:** estado contratual atual em `as_of`.
- **Timezone candidato:** UTC.
- **DimensÃµes candidatas:** currency; demais dimensÃµes corporativas pendentes.
- **InclusÃµes candidatas:** subscriptions ativas com perÃ­odos mensais/anuais suportados.
- **ExclusÃµes candidatas:** `internal_test`; perÃ­odos de billing nÃ£o suportados sÃ£o excluÃ­dos explicitamente e degradam quality para partial.
- **Coorte/denominador:** nÃ£o aplicÃ¡vel.
- **Cancelamentos:** subscription nÃ£o ativa nÃ£o entra na fÃ³rmula candidata.
- **Refunds:** nÃ£o sÃ£o usados para MRR contratual na fÃ³rmula candidata; polÃ­tica corporativa precisa confirmar.
- **Fonte candidata:** Kordena `fm_commercial_platform` para o produto Kordena.
- **Freshness/quality:** verified quando todos os perÃ­odos ativos sÃ£o suportados; partial quando hÃ¡ perÃ­odo nÃ£o suportado.
- **ProveniÃªncia candidata:** `fm_commercial_subscriptions_v1` + `fm_customers_v1`.
- **FX:** ADR-012 proÃ­be conversÃ£o automÃ¡tica; moedas permanecem separadas.
- **Ausente:** ausÃªncia de fonte/contrato nÃ£o vira 0.
- **Autoridade de aprovaÃ§Ã£o:** negÃ³cio + autoridade financeira corporativa ainda requeridos.

## 8. `revenue.arr`

**ID:** `revenue.arr`
**VersÃ£o canÃ´nica:** nÃ£o atribuÃ­da; decisÃ£o pendente
**Status:** `EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED`

- **Pergunta empresarial:** contrato corporativo de receita recorrente anual ainda pendente.
- **FÃ³rmula candidata Kordena:** subscriptions atuais em `active`; perÃ­odo mensal => `contracted_amount Ã— 12`; perÃ­odo anual => `contracted_amount` integral.
- **Unidade candidata:** currency_per_year.
- **Moeda:** separada por moeda.
- **PerÃ­odo/grain candidato:** estado contratual atual em `as_of`.
- **Timezone candidato:** UTC.
- **DimensÃµes candidatas:** currency.
- **InclusÃµes/exclusÃµes:** mesmas fronteiras candidatas do MRR.
- **Coorte/denominador:** nÃ£o aplicÃ¡vel.
- **Cancelamentos/refunds:** polÃ­tica corporativa ainda deve validar elegibilidade; fÃ³rmula Kordena usa apenas subscriptions ativas.
- **Fonte candidata:** Kordena `fm_commercial_platform` para Kordena.
- **Freshness/quality:** mesma polÃ­tica candidata do MRR.
- **ProveniÃªncia candidata:** `fm_commercial_subscriptions_v1` + `fm_customers_v1`.
- **FX:** sem conversÃ£o automÃ¡tica conforme ADR-012.
- **Ausente:** ausÃªncia nÃ£o vira 0.
- **Autoridade de aprovaÃ§Ã£o:** negÃ³cio + autoridade financeira corporativa ainda requeridos.

## 9. `finance.operating_result`

**ID:** `finance.operating_result`
**VersÃ£o canÃ´nica:** nÃ£o atribuÃ­da
**Status:** `EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED`

- **Pergunta empresarial:** nÃ£o aprovada.
- **FÃ³rmula:** nÃ£o definida canonicamente.
- **Unidade/moeda:** pendentes.
- **PerÃ­odo/timezone:** pendentes.
- **DimensÃµes:** pendentes.
- **InclusÃµes/exclusÃµes:** pendentes; nÃ£o Ã© autorizado assumir receita menos custos existentes como â€œlucroâ€.
- **Coorte/denominador:** nÃ£o aplicÃ¡vel.
- **Cancelamentos/refunds:** tratamento pendente.
- **Fonte autoritativa:** autoridade contÃ¡bil/financeira corporativa nÃ£o identificada.
- **Freshness/quality:** pendentes.
- **ProveniÃªncia:** pendente.
- **FX:** ADR-012 continua `DEFERRED`.
- **Ausente:** indisponÃ­vel/pending; nunca zero.
- **Autoridade de aprovaÃ§Ã£o:** autoridade contÃ¡bil/financeira humana requerida.

## 10. `finance.operating_margin.rate`

**ID:** `finance.operating_margin.rate`
**VersÃ£o canÃ´nica:** nÃ£o atribuÃ­da
**Status:** `EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED`

- **Pergunta empresarial:** nÃ£o aprovada.
- **FÃ³rmula:** nÃ£o definida; numerador e denominador nÃ£o podem ser inferidos.
- **Unidade candidata:** percent, ainda nÃ£o promovida.
- **Moeda:** depende do contrato do numerador/denominador e polÃ­tica FX.
- **PerÃ­odo/timezone:** pendentes.
- **DimensÃµes:** pendentes.
- **InclusÃµes/exclusÃµes:** pendentes.
- **Coorte/denominador:** denominador corporativo nÃ£o definido.
- **Cancelamentos/refunds:** pendentes.
- **Fonte autoritativa:** autoridade contÃ¡bil/financeira nÃ£o identificada.
- **Freshness/quality/proveniÃªncia:** pendentes.
- **FX:** ADR-012 `DEFERRED`.
- **Ausente:** indisponÃ­vel/pending; nunca 0%.
- **Autoridade de aprovaÃ§Ã£o:** autoridade contÃ¡bil/financeira humana requerida.

## 11. `service.error.rate`

**ID:** `service.error.rate`
**VersÃ£o canÃ´nica:** nÃ£o atribuÃ­da
**Status:** `EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED`

- **Pergunta empresarial:** nÃ£o aprovada.
- **FÃ³rmula:** nÃ£o definida.
- **Numerador disponÃ­vel parcialmente:** o FM Command jÃ¡ possui `service.error.count`, mas isso nÃ£o define a taxa.
- **Denominador:** nÃ£o definido.
- **Unidade candidata:** percent/rate, ainda nÃ£o promovida.
- **PerÃ­odo/timezone:** nÃ£o definidos.
- **ServiÃ§o/escopo:** nÃ£o definido.
- **DimensÃµes:** pendentes.
- **InclusÃµes/exclusÃµes:** pendentes.
- **Fonte autoritativa:** observabilidade corporativa consolidada ainda nÃ£o definida.
- **Freshness/quality/proveniÃªncia:** dependem da autoridade de observabilidade.
- **FX:** nÃ£o aplicÃ¡vel.
- **Ausente:** indisponÃ­vel/pending; nunca 0%.
- **Autoridade de aprovaÃ§Ã£o:** autoridade operacional/observabilidade humana requerida.

## 12. DecisÃ£o de gate CME-08

ApÃ³s revalidar CURRENT, ADRs e Kordena:

- nenhuma das oito possui aprovaÃ§Ã£o corporativa completa suficiente para promoÃ§Ã£o;
- cinco possuem **semÃ¢ntica candidata especÃ­fica do Kordena**, preservada como evidÃªncia;
- trÃªs continuam sem definiÃ§Ã£o suficiente;
- o cÃ³digo deve continuar fail-closed em `pending_semantics`;
- nenhuma alteraÃ§Ã£o no Metric Engine Ã© autorizada neste bloco;
- nenhuma conversÃ£o FX Ã© autorizada;
- nenhuma mÃ©trica deve receber valor sintÃ©tico para â€œfecharâ€ o cronograma.

**Resultado formal:**

```text
CME-08
INTERNAL_RECONCILIATION = PASS
SEMANTIC_PROMOTION = EXTERNAL_BLOCKED
BLOCKER = BUSINESS_SEMANTICS_REQUIRED
```

Este blocker nÃ£o impede a continuidade dos itens internamente resolvÃ­veis do Cronograma Mestre. O prÃ³ximo item Ã© **CME-09 â€” Fontes e Providers Corporativos**.
