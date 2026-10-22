# VENDEATENDEIA — P01: pré-autorização humana dupla de intenção corretiva

**Natureza:** construção interna em branch isolada, sem integração externa real. Preparar/revisar não executam reparação; a admissão de uma operação corretiva pelo serviço C06 canônico é opt-in e OFF por padrão, conforme extensão abaixo. Essa é a etapa preparatória governada para eventual execução corretiva. Nunca confundir "revisão humana" com autorização de dispatch ou com resolução da divergência.

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

A admissão C06 do comando corretivo e a confirmação interna por leitura assinada foram implementadas como fluxos opt-in e testes sintéticos; **não** há homologação real nem fechamento do caso, e a etapa de Core/quotas ainda falta. A futura etapa precisa escolher reativação segura pelo caminho canônico existente, criar transação/outbox com ID único, consultar status remoto atual via S2S autenticado, revalidar PSP, resolver estados ambíguos por leitura (nunca duplicar POST) e comprovar resultado no Assistant antes de encerrar um caso. Evidências de mais de dois minutos ou uma operação financeira posterior invalidam uma intenção; segunda revisão nunca é passe livre para execução.

## Rollback

Reverter a branch ou desligar o acesso ao novo endpoint. Nenhuma migration foi introduzida e os eventos de auditoria, se gerados, são imutáveis. O controle existente de billing, assinatura e entrega permanece intacto.

## Continuação do mesmo WP — admissão corretiva transacional, controlada e OFF

A ação `queue` é **separada** de `prepare` e `second_review`. A segunda revisão continua sendo **`reviewed_no_dispatch`**. O segundo operador deve realizar um novo POST com senha corporativa/step-up atualizada, `intentId` canônico e a mesma versão de revisão para autorizar expressamente a admissão corretiva. Qualquer alteração de dados de evidência, revisão, plano ou estado remoto invalida a admissão.

- **Controle adicional:** `FM_COMMAND_VENDE_CORRECTION_EXECUTION_ENABLED` deve estar explicitamente `true`, com `FM_COMMAND_VENDE_C06_DELIVERY_ENABLED=true` e identidade S2S já configurada. **Padrão: OFF.** Nenhum desses parâmetros deve ser alterado em produção nesta fase.
- **Preflight:** revalida a prova financeira canônica, fatura, contrato, operação e dupla revisão; consulta por HTTPS/S2S o status **atual** da operação de suspensão do Assistant; confirma `applied + SUSPEND_DELINQUENCY + suspended` e identidade exata de plano, versão e validade. Não aceita um ACK antigo como prova atual.
- **Pós-I/O:** repete sob lock as verificações de evidência, fatura, contrato, revisão e duplicidade. O serviço canônico `GovernedVendeC06Service.requestRegularization` verifica novamente PSP/associação financeira e faz a transição atômica **suspended → reactivation_pending**, cria a auditoria contratual e a operação `REACTIVATE_VERIFIED` com estado `pending`.
- **Idempotência:** `operationId` e `sourceRef` são derivados deterministicamente de `p01.correction.<intentId>`, atravessando a auditoria existente e a restrição de chave única da outbox. Concorrência e tentativas repetidas não criam novos comandos. Não altera o ID original do cliente, tenant ou subscription.
- **Execução:** nenhum POST mutável para Assistant é realizado por `queue`. O worker comercial já existente é responsável por um único envio assinado, acompanhado de readback e conciliação, quando futuramente estiver ativado. Uma resposta `reactivation_pending` **não comprova reativação**, custo, receita, pagamento novo ou reparação do caso.
- **Proibição:** não executa estornos, refund, reembolso, alteração de preços, migração, webhook, cobrança, plano comercial ou novo contrato. Não ativa automaticamente licença ou Core. Nenhuma ação da API `queue` é acessível ao cliente SaaS.

A suíte PostgreSQL verifica flags OFF, identidade distinta dos operadores, leitura externa adversarial, exclusão de duplicatas, exatamente uma transição C06 e uma operação de outbox, além de confirmar que o PSP e o pagamento não são modificados.

**Status real:** construção e CI sintética apenas. Mesmo após admission `reactivation_pending`, P01 permanece aberto até haver confirmação assinada da licença ativa, rechecagem financeira e registro governado do encerramento. A revisão independente e a CI pós-merge continuam obrigatórias.

## Confirmação read-only após o processamento C06

A página FM e a API `GET /api/billing/products/{productId}/vende-compensation-intents/{intentId}/status` permitem consultar a operação corretiva sem disparar novas transições. O leitor restringe o escopo ao produto/tenant, valida a intenção e a segunda revisão e resolve o comando canônico por `operationId=p01.correction.<intentId>`.

- `pending` → **queued**, `processing` → **processing**, `unknown/blocked` → **needs_reconciliation**; esses estados não usam status HTTP bruto como prova de licença.
- `delivered` exige nova leitura assinada do Assistant pelo ID da operação *corretiva*, com `applied_action=REACTIVATE_VERIFIED`, `license_status=active`, plano/revisão/validade iguais ao `delivery_target` persistido.
- Após a rede, o Command revalida dentro do PostgreSQL o mesmo comando, fatura paga, última atestação de PSP autenticada `settled_verified` ainda fresca, versão e estado `active` do contrato com vigência local da FM.
- Só então a tela apresenta **assistant_active_payment_verified**, que confirma as duas evidências **no momento daquela consulta**. Ainda retorna `coreQuotaVerified=false` e `caseResolved=false`. Não inventa liberação efetiva de IA nem encerra incidente sem o mecanismo governado posterior.
- Status `no-store`, erros saneados, somente FM corporativa, sem side effects, replay mutável, acesso cruzado ou exposição de segredos do provedor.

O teste PostgreSQL integra a admissão C06, a entrega assinada sintética pelo dispatcher existente, o ACK, a confirmação de estado e pagamento e a rejeição de prova remota contraditória. Nenhuma chamada a ambiente externo real foi feita.

**Próxima dependência P01:** reconciliação e estado de licença/quota FM Core atualizados, seguido de encerramento versionado por aprovador humano; nenhum desses passos foi declarado executado pelo novo endpoint.
