# VendeAtendeIA — B1.11: exposição comercial e alertas de compensação

## Objetivo e ameaça
Mesmo após uma checagem transacional de pagamento, uma mudança financeira pode
ocorrer entre a aplicação da licença pelo Assistant e a confirmação local do
Command. O sistema NÃO tem uma transação ACID distribuída entre os dois bancos.
Logo, um retorno HTTP 200 ou um status remoto aplicado não justifica declarar
a operação entregue quando a prova financeira/contratual local diverge.

## Implementação interna
A B1.11 NÃO cria um executor de compensação, estorno ou uma nova licença. Usa
a tabela canônica append-only `fmcc_audit_event`, sem migration, para guardar
uma evidência governada `vende.compensation_review.required` por operação
`vende_lifecycle_command`.

A entrada é registrada na mesma transação que conserva o comando em
`unknown`, somente se uma consulta autenticada do estado remoto indica
`operation_status=applied` mas a confirmação local não é segura. A rotina
idempotente é executada sob `SELECT FOR UPDATE` do comando e verifica uma
entrada anterior antes de registrar a nova. Múltiplas leituras de recuperação
não reemitem a operação nem geram alertas duplicados.

Campos sem segredos: produto, assinatura, operação, ação, revisão, estado
remoto observado, timestamp, motivo e marcador de ausência de autorização
para compensação automática. A trilha de auditoria não é prova de pagamento
autenticado por PSP; aplica-se a leitura financeira canônica preexistente.

O monitor corporativo B1.10 expõe um **total histórico** de alertas
identificados por FM tenant e productId. Este número NÃO é uma contagem de
incidentes abertos, não representa dívida ou execução de compensação, e não
confirma o estado atual da licença no Assistant.

## Limites explícitos
- Não altera invoice, ledger, gateway, assinatura, termos, licença ou quota.
- Nenhum envio automático, reativação, suspensão ou retry de operação incerta.
- Somente o Command, dentro da transação de claim previamente bloqueada,
  emite o evento de risco.
- Reversões que ocorram DEPOIS de uma entrega declarada concluída exigem
  monitoramento retroativo em outra unidade; não declarar essa lacuna fechada.
- Correção de licença/remediação financeira exigirá fluxo posterior com
  aprovação humana, prova remota atual, revogação governada e auditoria.
- Nenhuma migração de produção, segredo real, PSP, Evolution ou deploy.

## Testes e rollback
PostgreSQL descartável simula (1) ativação remota seguida de refund/chargeback
antes da confirmação no Command e (2) suspensão remota seguida de pagamento da
fatura durante I/O. Ambos permanecem `unknown` sem alterar localmente a
licença/contrato, geram exatamente uma evidência append-only apesar de nova
consulta de recuperação e não enviam segunda mutação. Monitor por tenant/produto
consulta o total histórico.

Rollback: retirar instrumentação B1.11 e painel adicional; preservar trilhas
já gravadas e comandos em unknown. Gates Foundation, Billing PG, F21 e Cognitive
no HEAD da PR e após merge. `BUILD_COMPLETE_INTERNAL_GREEN` global segue aberto.
