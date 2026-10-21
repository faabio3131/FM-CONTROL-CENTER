# VendeAtendeIA — B1.14 renovação comercial comprovada (admissão)

## Escopo e autoridade
Esta unidade cria uma intenção RENEW_VERIFIED para assinatura VendeAtendeIA
existente, mantendo **todos os campos do contrato/entitlement atuais inalterados**.
O status da intenção é pending, nunca delivered/ACK. O dispatcher assinado
posterior será um work package separado, submetido a novos gates antes de
qualquer autorização de aplicação. Sem mudança em códigos ou direitos do cliente.

### Fonte da verdade
- Apenas FM corporate owner/admin, commercial:write e step-up de senha de até
  cinco minutos podem criar a intenção, com referência de consentimento
  contratual e referência auditável de origem.
- Os registros tenant+produto+subscription+customer vêm do Command. Contrato
  deve estar active, autoRenew=true, revision exata; assinatura billing deve
  permanecer active e binding externo deve existir.
- Fatura deve pertencer exatamente à assinatura/produto/cliente FM, ser BRL
  paid e possuir pagamento no gateway daquela fatura com status received.
  Exigir a observação atual settled_verified do MESMO pagamento persistido;
  observar webhook isolado não conta como liquidação.
- Dois catálogos internos FM devem coincidir: plano billing active, plano
  Assistant published na revisão escolhida, mesmo planCode, currency BRL,
  amountMinor e billing interval monthly/yearly. O invoice.amountMinor tem
  que corresponder exatamente ao preço governado. Descontos, prorrata ou
  arbitragem de preço não são inventados neste fluxo.
- Um invoice que já seja fonte de qualquer lifecycle intent C06 não pode pagar
  outra renovação (proteção contra reutilização de liquidação).
- A próxima paidThrough e nextDueDate são calculadas pelo servidor em datas
  civis, respeitando duração de 1 mês/ano, virada de mês, fim de mês e ano
  bissexto. validUntil é fim **exclusivo** do dia pago na timezone
  America/Sao_Paulo, sem aceitar data ou valor arbitrários de HTTP.

### Transação e output
A mesma TX bloqueia contrato, fatura e assinatura, verifica pagamento/fonte,
preço/revisão, grava comando RENEW_VERIFIED pending com target tipado imutável
em delivery_target JSONB já existente e escreve auditoria append-only.
target guarda previousValidUntil, novo paidThrough, validUntil, nextDueDate,
planCode, planRevision, amountMinor, billingInterval, termsRevision e paymentRef.
Não há nova migration nem extensão local antecipada de paidThrough ou quota.
Um segundo comando com mesmo tenant/subscription/revision é bloqueado por
índice único. Em falha de auditoria, a transação inteira é revertida.

## Próximo estágio separado
B1.15 deverá adicionar reaprovação FM caso a autorização inicial expire e
um dispatcher one-shot que:
- confirma target já persistido e contrato no old revision;
- revalida financeiro, tenant, plano, preço e prazo antes/depois de I/O;
- verifica o estado real do Assistant por S2S assinado;
- envia RENEW_VERIFIED no máximo uma vez, com ACK exato e read-only recovery;
- somente com prova de aplicação atualiza termo para novo período, dueDate e
  revision. Em caso de incerteza, NÃO concede acesso nem repete mutação.

Sem credenciais externas, deploy, migração operacional, PSP real, homologação
ou worker habilitado. B1/cronograma global permanecem IN_PROGRESS.
