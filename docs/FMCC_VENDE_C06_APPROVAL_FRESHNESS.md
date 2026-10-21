# C06 — preservar a aprovação humana original

## Defeito corrigido

O dispatcher assinava approved_at com o instante do envio, mesmo quando o comando
havia sido aprovado antes. Isso mascarava aprovação vencida perante o limite de
300 segundos do contrato assinado. A data da reautenticação não estava persistida.

## Construção interna B1.5

Migration 0018 adiciona approved_at nullable ao comando. scheduleCancellation,
requestRegularization e requestSuspension persistem proof.verifiedAt, do mesmo ator
já validado. Nenhum default, trigger ou backfill produz autorização para dados antigos.

O dispatcher exige aprovação presente, finita, não futura e com idade <=300s antes
de reclamar o comando ou acessar rede. Após o readback remoto e antes de enviar a
mutação, revalida data e ator contra o intent reclamado. O signer recebe a data
original, com relógio atualizado no envio. Expiração no intervalo falha fechada.
O resultado fica unknown se uma tentativa já reclamada perder a aprovação; nunca
se renova o timestamp, reenvia a suspensão ou se declara entrega sem prova.

Reconciliação read-only de uma operação unknown permanece permitida depois dos
300s, pois verifica execução passada, sem criar autorização para nova suspensão.
Os fences financeiros e contratuais continuam obrigatórios para confirmar entrega.

## Testes e limites

PostgreSQL descartável verifica persistência exata, payload com a data original
(aprovação de quatro minutos), bloqueio legado/expirado/futuro antes de claim/HTTP,
alteração de prova/ator durante I/O, e readback tardio sem replay de mutação.
Nenhum Assistant/PSP real é chamado. A migration só integra bancos descartáveis.

Comandos pendentes antigos ou expirados exigem reaprovação FM explícita e auditada,
implementada na unidade B1.6 abaixo. Não executar UPDATE manual para liberá-los.
Scheduler e lifecycle completo continuam em construção; nenhum marco global declarado.

## Rollback

Manter FM_COMMAND_VENDE_C06_DELIVERY_ENABLED OFF. Preservar a coluna e o histórico.
Não reverter para o signer que fabrica aprovação recente e não preencher NULL com
created_at/now. Uma regressão deve manter o envio bloqueado enquanto a correção é
preparada. Não há deploy, credencial ou migration operacional nesta entrega.

## B1.6 — reaprovação supervisionada sem envio

O painel de planos Vende lista até 50 intents de suspensão pendentes sem tentativa,
com aprovação ausente ou expirada, priorizando os mais antigos e indicando truncamento.
GET/POST `/api/billing/products/{productId}/vende-command-approvals` exigem escopo FM.
GET usa somente dados locais. POST aceita commandId, expectedApprovedAt e senha; body
limitado a 2048 bytes. Não aceita ator, tenant, outcome, estado ou nova data de aprovação.

A nova autorização usa o StepUpProof real do mesmo ator. Sob lock do comando, o serviço
compara expectedApprovedAt com o valor persistido, exige pending sem claimed/delivered,
produto Vende ativo, contrato suspension_pending na mesma revisão, vínculo SaaS exato e
evidência recente unpaid vinculada à fatura canônica. Aprovação ainda válida não é renovada.
Processing, unknown, delivered e blocked nunca são reabertos. Quarentena/reconciliação
continuam fluxos distintos; esta operação não envia HTTP, suspende licença ou altera billing.

Auditoria append-only registra aprovação/ator anteriores, nova aprovação, operação,
produto, fatura e revisão na mesma transação da alteração. Concorrência resulta em uma
única nova aprovação/auditoria. Falha ao gravar auditoria reverte toda a operação.
O painel limpa a senha e atualiza o estado; resposta incerta exige consultar a lista,
sem renovar automaticamente o timestamp nem criar nova suspensão.

Testes adicionais: ingresso autenticado/limitado, injeção de campos, CAS concorrente,
falha de auditoria, isolamento, prova vencida, fatura paga, revisão alterada e ausência
de reset dos estados tentados. Nenhuma migration nova. Rollback B1.6: remover o fluxo
de reaprovação mantendo os guards B1.5, timestamps e histórico de auditoria.
