# Prompt 01 — prova financeira e estado remoto para reparação comercial

Esta entrega reaproveita o reconciliador PSP autenticado da FM e o status
comercial operation-scoped do Assistant. Não existe estorno/ajuste automático.

## Mudanças verificáveis
- Corrige a detecção B1.12 de estorno tardio após **RENEW_VERIFIED** entregue,
  mantendo os alarmes já existentes para reativação, suspensão e mudanças
  de plano. Deduplicação por comando, no TX da observação PSP, sem
  alterar pagamento, subscription, entitlement ou quotas.
- Após um operador corporativo registrar investigating/escalated na PR #143,
  ele pode solicitar uma consulta S2S de evidências, com step-up pessoal,
  escopo FM, config assinada OFF por padrão, expectedReviewVersion e
  verificação de risk event no audit ledger.
- A consulta ao Assistant é SOMENTE STATUS. Não executa transição, recupera
  token, modifica assinatura ou reenvia uma operação incerta.
- Rechecar claim action/revision/state, revisão do operador, fatura/tenant,
  pagamento e última evidência verificada ANTES de persistir o resultado
  do readback. Mudança durante I/O invalida a observação.
- Auditoria append-only mantém apenas operation_status, action reportada,
  status de licença, planCode/revision/validUntil e estado financeiro
  categórico. Nenhum segredo, comprovante integral ou referência de PSP.
- Resposta devolve explicitamente remediationDispatched=false,
  automaticCompensationAuthorized=false e caseResolved=false; nenhuma
  constatação remota por si só é quitação financeira ou resolução.
- Testes isolados HTTP e PostgreSQL comprovam escopo, reautenticação,
  ausência de efeitos colaterais, corrida pós-I/O, recusa de pedido
  com tenant e tipo de reparação injetados, e estorno tardio.

## Pendências para P01 final
Essa etapa **não executa compensação monetária ou licença** e não deve
ser vendida como reparo concluído. Falta um comando corretivo autorizado
especificamente para cada divergência classificada, com provas atuais
independentes, garantia de no-double-spend, validação do estado real
de entitlement, reconciliação e compensação da eventual falha.
Faltam ainda fechar todas as matrizes de provider/FinOps e certify do
Assistant/Core em branches candidatas. P01=IN_PROGRESS.

As opções de provider real, PSP, Evolution, worker produtivo e deploy
seguem OFF; a homologação externa é outra fase.
