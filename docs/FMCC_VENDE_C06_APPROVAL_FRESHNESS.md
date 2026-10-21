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

Comandos pendentes antigos ou expirados exigirão reaprovação FM explícita e auditada,
ainda não implementada nesta unidade. Não executar UPDATE manual para liberá-los.
Scheduler e lifecycle completo continuam em construção; nenhum marco global declarado.

## Rollback

Manter FM_COMMAND_VENDE_C06_DELIVERY_ENABLED OFF. Preservar a coluna e o histórico.
Não reverter para o signer que fabrica aprovação recente e não preencher NULL com
created_at/now. Uma regressão deve manter o envio bloqueado enquanto a correção é
preparada. Não há deploy, credencial ou migration operacional nesta entrega.
