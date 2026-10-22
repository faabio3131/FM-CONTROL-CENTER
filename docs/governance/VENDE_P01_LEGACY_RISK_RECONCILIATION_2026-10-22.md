# VENDEATENDEIA B1/P01 — risco financeiro e apresentação fail-closed

**Data:** 2026-10-22. **Fonte do estado:** Command `main` após PR #155 (`f163bf62b07ea61d9224fe1a5c8c40c085ed3db0`), cronograma do produto `-FM-Assistant-Base/docs/governance/CRONOGRAMA_MESTRE_CONSTRUCAO_100_INTERNA.md`.

## Decisão de reconciliação

As PRs antigas Command [#146](https://github.com/faabio3131/FM-CONTROL-CENTER/pull/146) e [#148](https://github.com/faabio3131/FM-CONTROL-CENTER/pull/148) nasceram da mesma `main` histórica `12fb8a...`, antes do B1/P01 corretivo e da PR #155. Ambas têm gates verdes apenas em SHAs antigos e não podem ser mergeadas cegamente: conflitos com aprovações/transações/revisões mais recentes precisam ser preservados.

Os dois **diffs funcionais únicos** permaneciam ausentes da `main`:

1. **#146:** classificação de `SUSPEND_DELINQUENCY` aplicada e licença ainda `suspended`, apesar de PSP `settled_verified`. A nova categoria de risco é `remote_suspended_after_finance_settled`. Nunca equivale a licença ativa ou autoriza uma reativação.
2. **#148:** motivos de risco no painel corporativo passam por allowlist estrita de categorias auditadas. Códigos desconhecidos/strings arbitrárias viram `unspecified`, nunca texto controlado pelo gateway/tenant.

Foram incorporadas **cirurgicamente** na nova branch desde `main`: só as duas alterações de serviço, testes adversariais de motivo e dois casos de PostgreSQL migrados da PR #146. Não replicamos migrations, não alteramos políticas financeiras, não refazemos C06/quotas, nem tocamos as cópias Core/Assistant.

## Gate de saída

Validar Foundation, Billing PostgreSQL, F21 e Cognitive no SHA definitivo; revisar segurança de tenant, PSP e nenhuma mutação nova; registrar auditoria interna FM em passe separado; merge somente após gates verdes. Após merge, fechar #146/#148 como **superseded** com link e sem descartar branches. A PR #149 de histórico ainda é separada e deverá ser conciliada com o HEAD atualizado, sem cherry-pick cego.

Nenhum deploy, segredo, cobrança, webhook, provider real, migration de produção ou homologação externa é autorizado. Este WP apenas reclassifica e minimiza metadados de um risco, não resolve nenhum incidente.
