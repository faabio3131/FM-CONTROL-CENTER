# VENDEATENDEIA — P01: pré-autorização humana dupla de intenção corretiva

**Natureza:** construção interna em branch isolada, sem integração externa e **SEM EXECUTAR REPARO**. Essa é a etapa preparatória governada para eventual execução corretiva. Nunca confundir "revisão humana" com autorização de dispatch ou com resolução da divergência.

## Escopo da primeira ação corretiva candidata

Caso restrito: `SUSPEND_DELINQUENCY` consta como `delivered`, o Assistant relatou `applied` com `license_status=suspended`, a fatura relacionada agora está `paid`, o último testemunho financeiro autenticado e vinculado é `settled_verified`, e o contrato do mesmo tenant/product/subscription permanece `suspended`, com vigência ainda não vencida e revisão idêntica à operação entregue.

A ação **proposta, mas não enviada** é `REACTIVATE_VIA_EXISTING_REGULARIZATION`, aproveitando exclusivamente o caminho de reativação já implementado com pagamento e revisão contratual verificados. Estorno, reembolso, alteração de plano ou nova contratação não podem ser inferidos, criados nem aprovados por este mecanismo.

## Protocolo de quatro barreiras

1. **Triagem e prova inicial:** evento imutável `vende.compensation_review.required`; revisão corporativa `escalated` com step-up e `reviewVersion` explícitos; último evento `vende.compensation_review.remote_observed` emitido pelo leitor autenticado atual, schema canônico, menos de dois minutos e todas as flags de não-mutação em `false`.
2. **Fences locais e financeiros sob lock:** bloquear o comando, depois fatura e contrato; conferir produto VendeAtendeIA, tenant, assinatura, cliente, invoice ID, versão contratual, estado remoto observado, pagamento vinculado e atestado mais recente. Resultados desconhecidos/contraditórios negam a operação.
3. **Primeira revisão:** `POST /api/billing/products/{productId}/vende-compensation-intents`, action `prepare`, senha corporativa fresca. Gravar uma única intenção auditável `vende.compensation_correction.prepared`; recusar duplicação ainda válida.
4. **Revisão independente:** segundo operador humano autenticado (ID distinto), mesma versão e `intentId`; revalidar todo o conjunto de provas; exigir que o evento preparado mais recente não tenha expirado; rejeitar replay e concorrência por transação serializada no comando. Inserir `vende.compensation_correction.second_reviewed` com resultado **`reviewed_no_dispatch`**.

Todos os eventos preservam `approvedForDispatch=false`, `remediationDispatched=false`, `entitlementMutated=false`, `refundExecuted=false` e `caseResolved=false`. Não existe worker, POST para Assistant, refund, mudança de licença ou alteração do contrato nesta etapa. A interface FM deixa esses limites explícitos.

## Testes de certificação

- Suite real PostgreSQL de C06 em banco descartável: comando, contrato, invoice, atestado financeiro, triagem v1/v2, observação assinada simulada no endpoint de leitura, preparo, revisão por segundo operador e concorrência de aprovação. Comprovar exatamente dois registros de intenção/segunda revisão, nenhum contrato ou pagamento alterado.
- Casos negativos de tenant externo, ausência de risco/triagem, prova vencida, mesmo ator tentando segunda revisão, replay e versões inválidas.
- API HTTP: schema restrito, payload limitado, step-up, rejeição de campos extras e comandos monetários, falha sem vazamento de segredos.
- CI lint, typecheck, testes unitários/contrato/PG, build, E2E proporcional, F21 e demais gates no SHA final; revisão **independente** obrigatória antes de merge.
- Testes com gateways reais, sistema Assistant remoto e credenciais reais permanecem adiados até a conclusão da construção interna.

## Limites — P01 permanece aberto

O executor transacional corretivo e a confirmação real pós-correção **não** foram implementados aqui. A futura etapa precisa escolher reativação segura pelo caminho canônico existente, criar transação/outbox com ID único, consultar status remoto atual via S2S autenticado, revalidar PSP, resolver estados ambíguos por leitura (nunca duplicar POST) e comprovar resultado no Assistant antes de encerrar um caso. Evidências de mais de dois minutos ou uma operação financeira posterior invalidam uma intenção; segunda revisão nunca é passe livre para execução.

## Rollback

Reverter a branch ou desligar o acesso ao novo endpoint. Nenhuma migration foi introduzida e os eventos de auditoria, se gerados, são imutáveis. O controle existente de billing, assinatura e entrega permanece intacto.
