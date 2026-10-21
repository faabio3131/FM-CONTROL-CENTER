# VendeAtendeIA — B1.13: cancelamento definitivo somente após o período pago

## Problema
SCHEDULE_CANCEL já registra intenção contratual, consentimento verificado pela FM
e autoRenew=false, preservando acesso pelo dia civil de paidThrough inteiro.
O Assistant recebe CANCEL_AT_PERIOD_END somente após o encerramento do período.
Uma senha validada na data do agendamento não é autorização eterna: o step-up
vence após 300 segundos, antes da data futura de cancelamento.

## Solução interna
- Reaproveitar o comando SCHEDULE_CANCEL e a interface corporativa de reaprovações.
  GET exibe essa ação somente quando a data local vigente é POSTERIOR à paidThrough;
  pendências jamais viram cancelamento antecipado.
- POST exige step-up de senha do mesmo owner/admin FM, revisão e timestamp anterior
  observados via CAS, contrato cancel_at_period_end, autoRenew=false, identidade de
  assinante e binding SaaS canônicos, assinatura ainda não cancelada. Auditoria da
  nova aprovação na MESMA transação. Nunca reaprovar processing, unknown, blocked,
  delivered ou execução já reclamada.
- O dispatcher privado B1.13 continua OFF sem FM_COMMAND_VENDE_C06_DELIVERY_ENABLED
  e configuração S2S válida; não cria rota pública, job ou novo scheduler.
- Sob claim transacional, exigir NOW >= fmPaidThroughExclusiveInstant(paidThrough),
  que usa timezone IANA America/Sao_Paulo (sem UTC -03 fixo), step-up válido em
  300 segundos, contrato no mesmo revision, identidade canônica FM, produto ativo,
  binding tenant/subscription/customer e plano atual.
- Readback S2S assinado antes de POST deve indicar operação ainda não aplicada,
  plano/código e período iguais à fonte contratual aprovada; estado remoto ativo,
  trial ou suspenso. Segunda validação transacional APÓS I/O impede alterações
  locais de contrato/plano antes do envio. A licença é encerrada exclusivamente por
  envelope assinado CANCEL_AT_PERIOD_END; HTTP 2xx não equivale a confirmação.
- Outra leitura assinada deve provar: operation_id aplicado, action exata
  CANCEL_AT_PERIOD_END, license_status cancelled, plano/revisão e prazo exatos.
  Só então mudar contrato local para cancelled, assinatura billing para cancelled
  e claim para delivered na mesma transação.
- Falha/timeout/ACK divergente -> unknown. Reconciliação apenas READ-ONLY,
  inclusive depois de expirar step-up; nunca faz segunda mutação nem cria nova
  validade, plano, pagamento ou contrato. Claim processing órfão fica unknown
  após 15 minutos de quarentena, sem retries.

## Restrições
Uma assinatura definitivamente cancelada não pode ser reativada no mesmo ID;
retorno comercial exige nova contratação e nova identidade conforme política FM.
Não revoga acesso antes do limite local pago. Não altera invoice, PSP, quota,
ledger, taxa, receita nem integrações já certificadas. Não resolve mudanças
financeiras posteriores, que continuam na linha B1.11–B1.12.

## Provas
Teste PostgreSQL sintético com sessão FM e cobrança isolada: cancelamento duplicado,
aprovação antiga, reaprovação CAS concorrente, deadline futuro, inspeção do payload
assinado, ACK exato, timeout após aplicar, leitura de recuperação sem replay,
ACK divergente e quarentena. Teste HTTP impede troca de action entre classes.
CI 4/4 no HEAD da PR e pós-merge, revisão de segurança e rollback: reverter
código B1.13 sem apagar intents/auditorias e sem resetar unknown para pending.
**Homologação e deploy reais continuam adiados.**
