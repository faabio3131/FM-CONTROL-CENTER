# VendeAtendeIA — entrega interna de reativação B1.8/C06

## Autoridade e escopo
Responsável: executor autorizado nesta sessão. Reutiliza requestRegularization, contrato
HMAC comercial e consumidor Assistant certificado, sem alterar a política comercial.
FM governa termos/pagamento; Assistant aplica licença. Mantém customer/subscription/tenant;
assinatura cancelada exige nova contratação, nunca este dispatcher.

## Fluxo
1. Config C06 existente OFF por padrão, organização corporativa, HTTPS sem redirect e
   chave referenciada por configuração. Nenhuma rota pública ou scheduler adicionado.
2. Claim transacional de intent pending, aprovação original recente (300s), sem tentativa
   anterior/target. Fatura paid BRL, PSP received, última prova settled fresca e vinculada,
   contrato reactivation_pending na revisão, período vigente, assinatura active/past_due/
   suspended, produto Vende ativo e binding SaaS canônico.
3. Consulta S2S autenticada exige suspended, operação ainda não aplicada, plano igual à
   assinatura e validade não superior ao período pago. Revalidar tudo após consulta.
4. Migration 0020 aditiva guarda delivery_target antes do POST: schema, plano/revisão,
   instante final, referência do pagamento e revisão contratual. NULL legado não autoriza
   confirmação. O alvo não é reescrito ou reconstruído na recuperação.
5. Assinatura usa aprovação original e target persistido. O período pago inclui todo o
   dia civil America/Sao_Paulo. Busca de fronteira via timezone IANA considera DST, sem
   hardcode de offset. Nenhum preço/limite muda, nem se inventa uma nova duração de plano.
6. HTTP 200 isolado não é ACK: nova leitura exige operação aplicada e tenant/action/estado/
   plano/revisão/validade exatos. Nova validação financeira/contratual precede active local.
7. Timeout, divergência ou corrida financeira ficam unknown, preservando target e termos
   pendentes. Reconcile é somente leitura e funciona após expirar aprovação; precisa de
   evidência financeira atual. Quarentena de processing órfão inclui reativação (15min).

## Limites e segurança
Não elimina a corrida distribuída de estorno posterior ao último fence; não concede
compensação automática nem confirma localmente quando as provas divergem. Reconciliação
financeira e compensação governada continuam explícitas no cronograma. Não toca em ledger,
invoice, provider payment ou quotas. Não renova automaticamente: usa datas contratuais
já aprovadas. Reaprovação de reativação expirada e supervisão/worker comercial permanecem
unidades seguintes. Segredos e ativação reais permanecem adiados.

## Validação e rollback
Testes SQL sintéticos cobrem tentativa concorrente única, target persistido antes do envio,
IDs preservados, timeout após aplicação e readback sem reenvio, expiração, cancelamento,
prova/financeiro/binding/tenant/flag, plano e validade remotos, aprovação alterada, ACK falso
ou divergente, estorno durante I/O e quarentena sem target. Testes civis cobrem DST/fim de
fevereiro/datas inválidas. Gate Foundation mantém o contrato signer Command→consumidor
Assistant real em processo isolado. Não se trata de homologação de rede/PSP real.

Rollback: manter flag C06 OFF, reverter dispatcher sem apagar targets/claims. Preservar
coluna 0020 e evidências; não resetar unknown/processing para pending. Todas as migrations
operacionais continuam proibidas nesta etapa. Auditoria em passe separado nesta sessão;
quatro gates PR e pós-merge obrigatórios antes de encerrar o bloco.

## B1.9 — reaprovação governada, sem reenvio
O painel corporativo de aprovações existentes foi ampliado para selecionar
SUSPEND_DELINQUENCY ou REACTIVATE_VERIFIED sem duplicar autoridades/rotas. GET
consulta até 50 comandos pendentes nunca tentados por produto, tenant e ação;
query inválida/duplicada é rejeitada. POST mantém compatibilidade com a ação
legada de suspensão, ou exige enum action explícita para reativação e senha do
ator autenticado, sem aceitar tenant, novo approval timestamp ou outcome externos.

No serviço de reativação, sob lock da claim e no mesmo TX, exigir approval anterior
nulo ou expirado, CAS exato, step-up FM recente e mesmo usuário, estado pending
sem claim/target/delivery, invoice paid BRL, PSP received, observação settled_verified
fresca vinculada, contrato reactivation_pending na revisão, período válido,
assinatura não cancelada, plano/tenant/binding e produto ativo. Auditoria append-only
with old/new approval e actor precede UPDATE; falha cancela toda a transação.
Nenhuma operação externa é enviada pela reaprovação, sem alteração de invoice,
ledger, entitlement, quota ou licença. Desconhecidos não são reabertos nem recebem
nova tentativa; apenas reconciliação B1.8 read-only resolve outcomes incertos.

Testes PostgreSQL descartáveis abrangem corrida de aprovação única, aprovação
original ausente/expirada/válida, target fixo, estados tentados, tenant divergente,
rollback de mutações negadas, pagamento estornado, contrato e binding divergentes.
Teste de rota assegura ação estrita, autoridade, senha e payload limitado.
Rollback: reverter fluxo B1.9 sem alterar esquema/dados, preservar auditoria,
B1.8 e flags OFF. Não realizar operação real de gateway, SaaS ou migration produtiva.
