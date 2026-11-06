# FM Command — diagnóstico da cobertura real Kordena × IRON, 06/11/2026

## Problema reproduzido

Painel `/dashboard/sources` mostrava **2 fatos** para Kordena e **8 fatos** para IRON no último botão "Sincronizar agora". A mensagem dizia *fatos ingeridos* e induzia a concluir incorretamente que só 2/8 funcionalidades estariam conectadas.

### Causa no Command

- `KordenaCommercialConnector.pull()` lê `/v1/control-plane/fmcc/snapshot` mas transforma em fatos apenas `snapshot.facts`.
- `IronCommercialConnector.pull()` lê `/api/v1/control-plane/fmcc/snapshot` e igualmente converte apenas `snapshot.facts`.
- `ConnectorRuntime.syncPull()` retorna `ingested: result.facts.length`, isto é **quantidade tentada/processada no lote**, não número garantido de novos inserts ou domínios integrados.
- `PostgresCanonicalFactRepository.ingest()` usa `onConflictDoNothing` e não informa quantidade efetivamente nova. A nova UI passou a falar em **fatos recebidos para processamento**, sem alegar novidade.
- O backend IRON já expõe arrays distintos para academias, trials, assinaturas, entitlements e onboarding, e deliberadamente marca transações de billing como autoridade `FM_COMMAND_AUTHORITY`. No backend IRON, os `facts` são projetados dos conjuntos academias, trials, assinaturas e onboarding, **não** de entitlements nem de transações financeiras.
- O contrato Kordena já separa clientes, contas, trials, assinaturas, transações, entitlements, catálogo, summary e observabilidade opcional. O número de fatos não substitui essas estruturas.

### Correção implementada exclusivamente no Command

1. Nova projeção pura `commercial-source-coverage.ts`, com **somente contagens agregadas**, identificação de contrato e autoridade de billing. Nenhum cliente, nome, email, conta bancária, payload de fato ou segredo sai da projeção.
2. Novo GET autenticado `/api/sources/{sourceId}/coverage`, com RBAC owner/admin + `source:read`, `integration:read` e `commercial:read`; valida tenant, produto ativo, binding de adapter, tipo/versão da fonte e origem via conector existente. Retorna apenas contagens/autoridades; inclui auditoria e `no-store`.
3. Botão **Ver cobertura comercial** por fonte no `/dashboard/sources`. O resultado diferencia `facts` (que são processados na sync) dos demais conjuntos disponíveis no snapshot. Mostra resumo comercial agregado e alerta expressamente sobre a não certificação E2E.
4. Mensagem após sincronização deixa de dizer `X fato(s) ingerido(s)`: fatos duplicados podem já existir no banco, e nenhum número é quantidade de integrações.

## O que essa PR NÃO inventa

- Não força importação de arrays com PII no ledger de fatos.
- Não converte registros de academia em faturamento nem inventa MRR, ARR, churn, preço, créditos ou pagamentos.
- Não confunde cobertura de contrato com produção homologada ou assinatura paga.
- Não instala nem altera endpoints, autenticação ou tabelas de Kordena e IRON. Outros agentes podem seguir suas frentes.
- A leitura é sob demanda, mediante operador autorizado; ela não sincroniza nem modifica contratos.

## Lacunas de integração end-to-end que permanecem separadas

| Domínio | Kordena | IRON FIT | Autoridade |
|---|---|---|---|
| Saúde S2S autenticada | Comprovada em prints 06/11 | Comprovada em prints 06/11 | SaaS |
| Último pull de facts | 2 processados | 8 processados | Snapshot do SaaS |
| Clientes, trials, subscriptions | Array exposto; contagem agora consultável | Array exposto; contagem agora consultável | SaaS para projeção |
| Entitlements | Array exposto | Array exposto, sem fatos derivados em `snapshot.facts` | SaaS |
| Catálogo / planos | Catálogo e comandos específicos | Endpoint separado `plan-versions` | SaaS para versão; Command para billing FM |
| Financeiro, pagamentos, MRR | Contrato não prova reconc. com provider | Snapshot atribui transações à FMCC | Billing FMCC/gateway |
| Consumo IA / custo real | Observabilidade KCA13 opcional | API `usage/ai` separada, não equivale a tokens/custo comprovados | SaaS/provider |
| Certificação de todos os fluxos | **Não certificada** | **Não certificada** | Gates E2E por produto |

## Próxima evidência

Após aprovação e deploy desta PR, acessar `/dashboard/sources` e clicar `Ver cobertura comercial` em cada fonte. O Command exibirá contagens atuais do snapshot **autenticado**, sem necessidade de comparar manualmente com o número de fatos. Integrações externas adicionais exigem contrato e testes próprios — não se resolvem aumentando artificialmente o número de fatos.

Sem merge/deploy automático nesta PR de diagnóstico.
